import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireOwnerAuth } from "../../../../../lib/require-owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receipt tags API (F2.11).
 *
 *   GET    /api/receipts/[requestId]/tags?pubkey=… → list this user's tags
 *   POST   /api/receipts/[requestId]/tags          → add a tag
 *   DELETE /api/receipts/[requestId]/tags          → remove a tag
 *
 * Tags are per-tagger: Alice's "rent" tag and Bob's "rent" tag on the
 * same receipt are different rows. Removing only deletes YOUR tag — never
 * someone else's.
 *
 * Auth: GET is open if you supply a pubkey (the table only contains your
 * own tags by design — there's no risk of leakage). POST/DELETE require
 * a Bearer wallet-signed auth header (asAuthHeaders pattern); we accept
 * a body-level pubkey for now and add real signature verification in the
 * next pass when we wire up the broader auth refactor.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG_RE = /^[a-z0-9_-]{1,32}$/;

const Body = z.object({
  pubkey: z.string().regex(PUBKEY_RE),
  tag: z.string().regex(TAG_RE),
});

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!UUID_RE.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
  }
  const pubkey = new URL(req.url).searchParams.get("pubkey");
  if (!pubkey || !PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: "missing_pubkey" }, { status: 400 });
  }
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("receipt_tags")
    .select("tag, created_at")
    .eq("request_id", requestId)
    .eq("tagger_pubkey", pubkey)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, tags: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!UUID_RE.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
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
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const authFail = await requireOwnerAuth(req, parsed.data.pubkey);
  if (authFail) return authFail;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { error } = await sb.from("receipt_tags").insert({
    request_id: requestId,
    tagger_pubkey: parsed.data.pubkey,
    tag: parsed.data.tag,
  });
  if (error) {
    // Postgres unique-violation = idempotent success
    if (error.code === "23505") return NextResponse.json({ ok: true, idempotent: true });
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!UUID_RE.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
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
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const authFail = await requireOwnerAuth(req, parsed.data.pubkey);
  if (authFail) return authFail;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { error } = await sb
    .from("receipt_tags")
    .delete()
    .eq("request_id", requestId)
    .eq("tagger_pubkey", parsed.data.pubkey)
    .eq("tag", parsed.data.tag);
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
