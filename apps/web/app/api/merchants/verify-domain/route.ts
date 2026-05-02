import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { promises as dns } from "node:dns";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authFromRequest } from "../../../../lib/wallet-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Domain verification for verified_merchants via DNS TXT record.
 *
 *   POST /api/merchants/verify-domain { handle, domain, action: "init" }
 *     → returns the TXT token the merchant needs to publish at
 *       _settle.<domain>. The token is bound to the merchant_pubkey
 *       so it can't be reused across handles.
 *
 *   POST /api/merchants/verify-domain { handle, domain, action: "check" }
 *     → fetches DNS TXT for _settle.<domain>, validates the token
 *       matches what we issued, marks the merchant as verified +
 *       inserts/updates verified_merchants with verification_method='dns_txt'.
 *
 * Auth: wallet-sig auth. The signed pubkey must match the handle's
 * resolved pubkey. Same pattern as the webhook endpoint.
 *
 * Token storage: domain_verification_tokens table — issued tokens
 * with TTL, marked consumed once successfully verified.
 */

const DOMAIN_RE =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const Body = z.object({
  handle: z.string().regex(/^[a-z0-9_-]{2,32}$/i),
  domain: z.string().regex(DOMAIN_RE).max(253),
  action: z.enum(["init", "check"]),
});

const TOKEN_PREFIX = "settle-verify=";
const TOKEN_TTL_HOURS = 72;

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function generateToken(): string {
  // 16 random bytes hex = 32 chars. Plenty of entropy for non-replayable.
  return randomBytes(16).toString("hex");
}

export async function POST(req: NextRequest) {
  // 1. Wallet sig — only the @handle's owner can register a domain for it.
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth?.reason ?? "missing_signature" },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;

  const sb = getSb();
  if (!sb)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  // 2. Resolve handle → pubkey + verify caller IS that pubkey.
  const { data: handleRow } = await sb
    .from("handles")
    .select("pubkey")
    .eq("handle", v.handle.toLowerCase())
    .maybeSingle();
  if (!handleRow) {
    return NextResponse.json({ error: "handle_not_found" }, { status: 404 });
  }
  if (handleRow.pubkey !== auth.pubkey) {
    return NextResponse.json(
      { error: "wallet_handle_mismatch" },
      { status: 403 },
    );
  }
  const merchantPubkey = handleRow.pubkey as string;

  // ─── INIT: issue a fresh token + return the TXT record to publish ───
  if (v.action === "init") {
    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + TOKEN_TTL_HOURS * 3600_000,
    ).toISOString();

    // Upsert: a merchant who lost track of their token re-inits and gets a
    // fresh one. Old tokens for the same (merchant, domain) become stale
    // (we just overwrite the row).
    const { error } = await sb
      .from("domain_verification_tokens")
      .upsert(
        {
          merchant_pubkey: merchantPubkey,
          domain: v.domain.toLowerCase(),
          token,
          expires_at: expiresAt,
          consumed_at: null,
        },
        { onConflict: "merchant_pubkey,domain" },
      );
    if (error) {
      return NextResponse.json(
        { error: "supabase_error", message: error.message },
        { status: 500 },
      );
    }

    const txtName = `_settle.${v.domain.toLowerCase()}`;
    const txtValue = `${TOKEN_PREFIX}${token}`;

    return NextResponse.json({
      ok: true,
      action: "init",
      txt_record_name: txtName,
      txt_record_value: txtValue,
      expires_at: expiresAt,
      message: `Add a TXT record at ${txtName} with value "${txtValue}". Then POST again with action="check" within ${TOKEN_TTL_HOURS}h to verify.`,
    });
  }

  // ─── CHECK: fetch DNS TXT and validate ───
  const txtName = `_settle.${v.domain.toLowerCase()}`;

  // Look up the issued token.
  const { data: tokenRow } = await sb
    .from("domain_verification_tokens")
    .select("token, expires_at, consumed_at")
    .eq("merchant_pubkey", merchantPubkey)
    .eq("domain", v.domain.toLowerCase())
    .maybeSingle();
  if (!tokenRow) {
    return NextResponse.json(
      {
        error: "no_token_issued",
        hint: "POST with action='init' first to get a TXT record to publish.",
      },
      { status: 404 },
    );
  }
  if (
    tokenRow.expires_at &&
    new Date(tokenRow.expires_at).getTime() < Date.now()
  ) {
    return NextResponse.json(
      {
        error: "token_expired",
        hint: "Re-init to get a fresh token.",
      },
      { status: 410 },
    );
  }

  // Resolve TXT records. Node's dns/promises returns string[][] — each
  // record can be split into multiple chunks; concat them per record.
  let records: string[][];
  try {
    records = await dns.resolveTxt(txtName);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return NextResponse.json(
      {
        error: "dns_lookup_failed",
        code,
        hint:
          code === "ENOTFOUND" || code === "ENODATA"
            ? `No TXT record at ${txtName}. Add the record from action='init' and try again.`
            : `DNS error: ${(e as Error).message}`,
      },
      { status: 422 },
    );
  }

  const expectedValue = `${TOKEN_PREFIX}${tokenRow.token}`;
  const flat = records.map((r) => r.join(""));
  const matched = flat.includes(expectedValue);
  if (!matched) {
    return NextResponse.json(
      {
        error: "token_mismatch",
        hint: `Expected TXT value "${expectedValue}" but found ${flat.length} record(s) without a match.`,
        observed: flat,
      },
      { status: 422 },
    );
  }

  // 3. Insert/update verified_merchants row.
  await sb.from("verified_merchants").upsert(
    {
      merchant_pubkey: merchantPubkey,
      domain: v.domain.toLowerCase(),
      display_name: v.handle, // default display = handle; merchant can edit later
      verification_method: "dns_txt",
      verified_at: new Date().toISOString(),
    },
    { onConflict: "merchant_pubkey" },
  );

  // 4. Mark the token consumed so it can't be reused.
  await sb
    .from("domain_verification_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("merchant_pubkey", merchantPubkey)
    .eq("domain", v.domain.toLowerCase());

  return NextResponse.json({
    ok: true,
    action: "check",
    verified: true,
    domain: v.domain.toLowerCase(),
    merchant_pubkey: merchantPubkey,
    message:
      "Domain verified. You can now register webhooks + capabilities under this handle.",
  });
}
