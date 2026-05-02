import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { authFromRequest } from "../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * F10 — One-time-use payment link creation (creator side).
 *
 *   POST /api/payment-links     create a fresh single-use link (auth = creator)
 *   GET  /api/payment-links?creator=<pk>   list creator's links
 *
 * Buyer-side (claim) lives at /api/payment-links/[token].
 */

const Create = z.object({
  amount_usdc: z.number().positive().max(10_000),
  label: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  expires_in_minutes: z.number().int().positive().max(60 * 24 * 30).optional(), // up to 30 days
});

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function makeToken(): string {
  // 18 random bytes → 24-char base64url. Unguessable, URL-safe, fits in QR comfortably.
  return randomBytes(18)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  let parsed: z.infer<typeof Create>;
  try {
    parsed = Create.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: (e as Error).message },
      { status: 400 },
    );
  }

  const token = makeToken();
  const expiresAt = parsed.expires_in_minutes
    ? new Date(Date.now() + parsed.expires_in_minutes * 60_000).toISOString()
    : null;

  const { error } = await supabase.from("payment_links").insert({
    token,
    creator_pubkey: auth.pubkey,
    amount_usdc: parsed.amount_usdc,
    label: parsed.label,
    description: parsed.description ?? null,
    expires_at: expiresAt,
  });
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://settle.so";
  return NextResponse.json({
    ok: true,
    token,
    url: `${origin}/pay/${token}`,
    expires_at: expiresAt,
  });
}

export async function GET(req: NextRequest) {
  const creator = req.nextUrl.searchParams.get("creator");
  if (!creator || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(creator)) {
    return NextResponse.json({ error: "invalid_creator" }, { status: 400 });
  }
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data, error } = await supabase
    .from("payment_links")
    .select("token, label, amount_usdc, description, claimed_at, claimed_by_pubkey, claim_tx_sig, expires_at, created_at")
    .eq("creator_pubkey", creator)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}
