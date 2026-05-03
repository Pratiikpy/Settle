import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wave 6.D — Public federation origins list.
 *
 *   GET /api/federation/origins
 *
 * Returns the set of *trusted* foreign protocols whose attested
 * receipts Settle accepts. Used by the public Federation panel on
 * /leaderboard to show readers which other networks Settle
 * cross-verifies. No auth — only `trusted=true` rows are exposed and no
 * attestation keys leak.
 */

interface PublicOrigin {
  origin_id: string;
  label: string;
  homepage_url: string | null;
  trusted_since: string;
  receipt_count: number;
}

export async function GET() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) {
    return NextResponse.json(
      { ok: true, origins: [] satisfies PublicOrigin[] },
      { status: 200 },
    );
  }
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  const { data: origins, error } = await sb
    .from("federation_origins")
    .select("origin_id, label, homepage_url, created_at, trusted")
    .eq("trusted", true)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (origins ?? []).map((o) => o.origin_id);
  let counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: rcv } = await sb
      .from("federated_receipts")
      .select("origin_id, federated_id")
      .in("origin_id", ids)
      .eq("status", "verified");
    counts = (rcv ?? []).reduce<Record<string, number>>((acc, r) => {
      const id = (r as { origin_id: string }).origin_id;
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
  }

  const result: PublicOrigin[] = (origins ?? []).map((o) => ({
    origin_id: o.origin_id as string,
    label: (o.label as string) ?? (o.origin_id as string),
    homepage_url: (o.homepage_url as string | null) ?? null,
    trusted_since: o.created_at as string,
    receipt_count: counts[o.origin_id as string] ?? 0,
  }));

  return NextResponse.json({ ok: true, origins: result });
}
