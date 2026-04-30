import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseHandleInput } from "@settle/sdk";

export const runtime = "nodejs";

/**
 * GET /api/resolve?handle=<input>
 *
 * Resolution path:
 *   1. parseHandleInput → kind ∈ {settle | sns | pubkey}
 *   2. pubkey → return as-is
 *   3. settle → query Supabase `handles` table
 *   4. sns → SNS resolver via @bonfida/spl-name-service
 *
 * NO mock data. If Supabase isn't configured, returns 503 — run `pnpm seed:supabase` first.
 */

async function querySupabaseHandle(
  handle: string,
): Promise<
  | { found: true; pubkey: string; sns_domain: string | null; display_name: string | null }
  | { found: false; reason: "not_found" | "supabase_unconfigured" | "supabase_error"; message?: string }
> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { found: false, reason: "supabase_unconfigured" };
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("handles")
    .select("pubkey, sns_domain, display_name")
    .eq("handle", handle)
    .maybeSingle();

  if (error) {
    return { found: false, reason: "supabase_error", message: error.message };
  }
  if (!data) return { found: false, reason: "not_found" };
  return {
    found: true,
    pubkey: data.pubkey,
    sns_domain: data.sns_domain,
    display_name: data.display_name,
  };
}

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle");
  if (!handle) {
    return NextResponse.json({ error: "missing_handle" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseHandleInput(handle);
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_handle", message: (e as Error).message },
      { status: 400 },
    );
  }

  switch (parsed.kind) {
    case "pubkey":
      return NextResponse.json({ kind: "pubkey", pubkey: parsed.value });

    case "settle": {
      const result = await querySupabaseHandle(parsed.value);
      if (result.found) {
        return NextResponse.json({
          kind: "settle",
          handle: parsed.value,
          pubkey: result.pubkey,
          sns_domain: result.sns_domain,
          display_name: result.display_name,
        });
      }
      if (result.reason === "supabase_unconfigured") {
        return NextResponse.json(
          {
            error: "supabase_unconfigured",
            message:
              "Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env, apply migrations 0001 + 0002, run `pnpm seed:supabase`.",
          },
          { status: 503 },
        );
      }
      if (result.reason === "supabase_error") {
        return NextResponse.json(
          { error: "supabase_error", message: result.message },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: "handle_not_found", handle: parsed.value },
        { status: 404 },
      );
    }

    case "sns": {
      // Bonfida SNS resolver
      try {
        const { Connection, clusterApiUrl } = await import("@solana/web3.js");
        const { resolve: resolveSns } = await import("@bonfida/spl-name-service");

        const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
        const rpcUrl =
          process.env.NEXT_PUBLIC_RPC_URL ??
          (process.env.HELIUS_API_KEY
            ? `https://${cluster}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
            : clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet"));
        const connection = new Connection(rpcUrl, "confirmed");

        // Bonfida resolve() takes the bare name without the .sol suffix
        const bareName = parsed.value.replace(/\.sol$/, "");
        const owner = await resolveSns(connection, bareName);

        return NextResponse.json({
          kind: "sns",
          domain: parsed.value,
          pubkey: owner.toBase58(),
        });
      } catch (e) {
        return NextResponse.json(
          {
            error: "sns_resolution_failed",
            domain: parsed.value,
            message: (e as Error).message,
          },
          { status: 404 },
        );
      }
    }
  }
}
