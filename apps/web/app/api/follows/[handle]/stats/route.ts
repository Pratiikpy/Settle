import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseHandleInput } from "@settle/sdk";

export const runtime = "nodejs";

/**
 * GET /api/follows/[handle]/stats
 *
 * Public follower stats for a handle. No auth required because RLS lets anyone read
 * follow rows (pubkeys are already public).
 *
 * Returns:
 *   followers_count     — total
 *   recent_followers    — most-recent 5 follower pubkeys with `since` timestamps
 */

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function resolveHandleToPubkey(handle: string): Promise<string | null> {
  let parsed;
  try {
    parsed = parseHandleInput(handle);
  } catch {
    return null;
  }
  if (parsed.kind === "pubkey") return parsed.value;
  if (parsed.kind === "settle") {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data } = await supabase
      .from("handles")
      .select("pubkey")
      .eq("handle", parsed.value)
      .maybeSingle();
    return (data?.pubkey as string | undefined) ?? null;
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const targetPubkey = await resolveHandleToPubkey(handle);
  if (!targetPubkey) {
    return NextResponse.json({ error: "handle_not_resolvable" }, { status: 404 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const [{ count }, { data: recent }] = await Promise.all([
    supabase
      .from("follows")
      .select("follower_pubkey", { count: "exact", head: true })
      .eq("following_pubkey", targetPubkey),
    supabase
      .from("follows")
      .select("follower_pubkey, since")
      .eq("following_pubkey", targetPubkey)
      .order("since", { ascending: false })
      .limit(5),
  ]);

  return NextResponse.json({
    ok: true,
    handle,
    pubkey: targetPubkey,
    followers_count: count ?? 0,
    recent_followers: (recent ?? []).map((r) => ({
      pubkey: r.follower_pubkey as string,
      since: r.since as string,
    })),
  });
}
