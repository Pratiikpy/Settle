import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authFromRequest } from "../../../../../lib/wallet-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Self-serve webhook registration for verified merchants.
 *
 *   GET    /api/merchants/[handle]/webhook    — current state (no secret)
 *   PUT    /api/merchants/[handle]/webhook    — set/update URL, rotate secret
 *   DELETE /api/merchants/[handle]/webhook    — clear URL + secret
 *
 * Auth: wallet-sig auth via lib/wallet-auth. The signed pubkey must
 * match the handle's resolved merchant_pubkey AND have an entry in
 * verified_merchants. Operators can still manage URLs via the
 * /api/admin route family using CRON_SECRET.
 *
 * The signing secret is server-generated on PUT (32 random bytes hex)
 * and returned IN PLAIN ONCE. After that, the GET endpoint exposes
 * only the URL + last_delivered_at — never the secret. Same model as
 * Stripe's "secret shown once at creation."
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const PutBody = z.object({
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), {
      message: "webhook URL must be HTTPS",
    }),
  /**
   * Rotate the secret on this PUT (default true). Pass false to keep
   * the existing secret while updating only the URL — useful when a
   * merchant changes hosts but wants existing receivers to keep
   * verifying with the same key.
   */
  rotate_secret: z.boolean().default(true),
});

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

async function authorize(
  req: NextRequest,
  handle: string,
): Promise<
  | { ok: true; merchantPubkey: string }
  | { ok: false; status: number; body: object }
> {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return {
      ok: false,
      status: 401,
      body: {
        error: "unauthorized",
        reason: auth?.reason ?? "missing_signature",
      },
    };
  }

  const sb = getSb();
  if (!sb) {
    return {
      ok: false,
      status: 503,
      body: { error: "supabase_unconfigured" },
    };
  }

  // Resolve handle → pubkey + verify caller IS that pubkey + merchant is verified.
  const { data: handleRow } = await sb
    .from("handles")
    .select("pubkey")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (!handleRow) {
    return {
      ok: false,
      status: 404,
      body: { error: "handle_not_found" },
    };
  }
  if (handleRow.pubkey !== auth.pubkey) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "wallet_handle_mismatch",
        message: "signed wallet doesn't match the @handle",
      },
    };
  }

  const { data: vm } = await sb
    .from("verified_merchants")
    .select("merchant_pubkey")
    .eq("merchant_pubkey", handleRow.pubkey)
    .maybeSingle();
  if (!vm) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "not_a_verified_merchant",
        hint:
          "Webhook registration requires a verified_merchants row. Verify your domain via DNS TXT or contact the operator.",
      },
    };
  }

  return { ok: true, merchantPubkey: vm.merchant_pubkey as string };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  if (!/^[a-z0-9_-]{2,32}$/i.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }
  const a = await authorize(req, handle);
  if (!a.ok) return NextResponse.json(a.body, { status: a.status });

  const sb = getSb()!;
  const { data } = await sb
    .from("verified_merchants")
    .select(
      "merchant_pubkey, webhook_url, webhook_last_delivered_at, webhook_last_attempt_at, webhook_last_error",
    )
    .eq("merchant_pubkey", a.merchantPubkey)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    merchant_pubkey: a.merchantPubkey,
    webhook_url: data?.webhook_url ?? null,
    webhook_configured: !!data?.webhook_url,
    last_delivered_at: data?.webhook_last_delivered_at ?? null,
    last_attempt_at: data?.webhook_last_attempt_at ?? null,
    last_error: data?.webhook_last_error ?? null,
    // Secret is NEVER returned on GET — only on PUT, once.
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  if (!/^[a-z0-9_-]{2,32}$/i.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }
  const a = await authorize(req, handle);
  if (!a.ok) return NextResponse.json(a.body, { status: a.status });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PutBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sb = getSb()!;

  // Rotate the secret unless the caller asks to keep the existing one.
  const update: Record<string, unknown> = { webhook_url: parsed.data.url };
  let returnedSecret: string | null = null;
  if (parsed.data.rotate_secret) {
    returnedSecret = generateSecret();
    update.webhook_signing_secret = returnedSecret;
  }

  const { error } = await sb
    .from("verified_merchants")
    .update(update)
    .eq("merchant_pubkey", a.merchantPubkey);
  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    merchant_pubkey: a.merchantPubkey,
    webhook_url: parsed.data.url,
    // The secret is shown ONCE here. After this response, only a
    // future GET (which omits it) is available. If the merchant loses
    // it, they PUT again with rotate_secret=true to get a new one.
    webhook_signing_secret: returnedSecret,
    rotated: parsed.data.rotate_secret,
    message: returnedSecret
      ? "Webhook saved. The signing secret above is shown ONCE — copy it now. Subsequent GETs will not return it."
      : "Webhook URL updated. Existing signing secret retained.",
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  if (!/^[a-z0-9_-]{2,32}$/i.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }
  const a = await authorize(req, handle);
  if (!a.ok) return NextResponse.json(a.body, { status: a.status });

  const sb = getSb()!;
  const { error } = await sb
    .from("verified_merchants")
    .update({
      webhook_url: null,
      webhook_signing_secret: null,
      webhook_last_delivered_at: null,
      webhook_last_attempt_at: null,
      webhook_last_error: null,
    })
    .eq("merchant_pubkey", a.merchantPubkey);
  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: "Webhook cleared." });
}
