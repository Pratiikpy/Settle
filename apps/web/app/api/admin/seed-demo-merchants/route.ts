import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authFromRequest } from "../../../../lib/wallet-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-shot seeder for the 3 demo merchants used by /api/x402/proxy/<merchant>.
 *
 * Idempotent. Auth: deployer wallet sig (same pattern as /api/capabilities POST).
 * Only the deployer pubkey is allowed to call this; everyone else gets 403.
 *
 * Inserts arxiv-fetch / translate / summarize into verified_merchants with
 * verification_method='manual_devnet_seed' so the proxy's
 * checkMerchantSasAttestation → trusted_db fallback returns verified=true.
 */

const DEMO_MERCHANTS = [
  {
    merchant_pubkey: "5xyG5PpFZYwVsR5mzec1Yg4HbyqqacUSPvW9oGeUDFnm",
    domain: "arxiv-fetch.demo.settle",
    display_name: "ArxivFetch (Settle demo)",
    verification_method: "manual_devnet_seed" as const,
  },
  {
    merchant_pubkey: "ARyNYt1pavsDYSLFqUQEHreFY5df4LsWHxD27uXTnRrd",
    domain: "translate.demo.settle",
    display_name: "TranslateAPI (Settle demo)",
    verification_method: "manual_devnet_seed" as const,
  },
  {
    merchant_pubkey: "2MWU5oGWseQpLzCqauh5zU1HewyiEgMUy1q3MirWVSZE",
    domain: "summarize.demo.settle",
    display_name: "SummaryLLM (Settle demo)",
    verification_method: "manual_devnet_seed" as const,
  },
];

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth?.ok === false ? auth.reason : "missing" },
      { status: 401 },
    );
  }
  const allowed = process.env.SETTLE_DEPLOYER_PUBKEY;
  if (!allowed || auth.pubkey !== allowed) {
    return NextResponse.json(
      { error: "forbidden", message: "only the deployer pubkey can seed demo merchants" },
      { status: 403 },
    );
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const results: Array<{
    merchant_pubkey: string;
    inserted: boolean;
    error?: string;
  }> = [];
  for (const m of DEMO_MERCHANTS) {
    const { error } = await sb.from("verified_merchants").insert(m);
    if (!error) {
      results.push({ merchant_pubkey: m.merchant_pubkey, inserted: true });
    } else if (error.code === "23505") {
      results.push({ merchant_pubkey: m.merchant_pubkey, inserted: false });
    } else {
      results.push({
        merchant_pubkey: m.merchant_pubkey,
        inserted: false,
        error: error.message,
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
