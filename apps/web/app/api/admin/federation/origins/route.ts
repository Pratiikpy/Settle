import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    /api/admin/federation/origins  — list with counts
 * PATCH  /api/admin/federation/origins  — flip trusted on a specific origin
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Same gate as
 * /api/cron/* and /api/admin/federation/retry — operator-only.
 *
 * Counts include verified + untrusted + invalid receipts per origin so
 * the operator can see how much traffic an origin has BEFORE deciding
 * whether to promote.
 */

interface OriginRow {
  origin_id: string;
  label: string;
  attestation_pubkey: string;
  trusted: boolean;
  homepage_url: string | null;
  notes: string | null;
  created_at: string;
  counts: {
    verified: number;
    untrusted: number;
    invalid: number;
  };
}

const PatchBody = z.object({
  origin_id: z.string().min(1).max(80),
  trusted: z.boolean(),
});

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  return Boolean(expected && auth === `Bearer ${expected}`);
}

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { data: origins, error } = await sb
    .from("federation_origins")
    .select(
      "origin_id, label, attestation_pubkey, trusted, homepage_url, notes, created_at",
    )
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Per-origin counts. Three queries in parallel — cheap.
  const ids = (origins ?? []).map((o) => o.origin_id);
  const [verified, untrusted, invalid] = await Promise.all([
    sb
      .from("federated_receipts")
      .select("origin_id", { count: "exact", head: false })
      .in("origin_id", ids)
      .eq("status", "verified"),
    sb
      .from("federated_receipts")
      .select("origin_id", { count: "exact", head: false })
      .in("origin_id", ids)
      .eq("status", "untrusted"),
    sb
      .from("federated_receipts")
      .select("origin_id", { count: "exact", head: false })
      .in("origin_id", ids)
      .eq("status", "invalid"),
  ]);

  const tally = (rows: { data: Array<{ origin_id: string }> | null }) => {
    const m = new Map<string, number>();
    for (const r of rows.data ?? []) {
      m.set(r.origin_id, (m.get(r.origin_id) ?? 0) + 1);
    }
    return m;
  };
  const verifiedMap = tally(verified);
  const untrustedMap = tally(untrusted);
  const invalidMap = tally(invalid);

  const enriched: OriginRow[] = (origins ?? []).map((o) => ({
    origin_id: o.origin_id,
    label: o.label,
    attestation_pubkey: o.attestation_pubkey,
    trusted: Boolean(o.trusted),
    homepage_url: o.homepage_url,
    notes: o.notes,
    created_at: o.created_at,
    counts: {
      verified: verifiedMap.get(o.origin_id) ?? 0,
      untrusted: untrustedMap.get(o.origin_id) ?? 0,
      invalid: invalidMap.get(o.origin_id) ?? 0,
    },
  }));

  return NextResponse.json({ ok: true, origins: enriched });
}

export async function PATCH(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const v = parsed.data;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("federation_origins")
    .update({ trusted: v.trusted })
    .eq("origin_id", v.origin_id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // C61 side-effect: when promoting an origin to trusted, retroactively
  // flip its existing 'untrusted' receipts to 'verified' so they show
  // up in /ledger immediately — no need to re-import. The signatures
  // are still valid (we already verified them at import time); only the
  // trust gate moved.
  if (v.trusted) {
    await sb
      .from("federated_receipts")
      .update({ status: "verified" })
      .eq("origin_id", v.origin_id)
      .eq("status", "untrusted");
  } else {
    // Demoting: send all verified rows back to untrusted. They're
    // hidden from /ledger until re-promoted, but stay in the table
    // so operators can audit what was previously visible.
    await sb
      .from("federated_receipts")
      .update({ status: "untrusted" })
      .eq("origin_id", v.origin_id)
      .eq("status", "verified");
  }

  return NextResponse.json({ ok: true, origin: data });
}
