import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { parseHandleInput } from "@settle/sdk";
import { authFromRequest } from "../../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * Follow / unfollow / inspect a handle (P7).
 *
 *   POST   /api/follows/[handle]      — wallet-sig auth, follower follows handle's pubkey
 *   DELETE /api/follows/[handle]      — wallet-sig auth, follower unfollows
 *   GET    /api/follows/[handle]      — public, returns is_following=true|false (if
 *                                       caller is authed) + handle's pubkey
 *
 * Push behavior: when a public_feed receipt is inserted for a followed pubkey, the
 * proxy/insert path fans out push notifications to every follower with
 * push_on_receipt=true. That fan-out lives in the proxy receipt-insert path; this
 * endpoint just owns the row.
 */

const Body = z
  .object({
    push_on_receipt: z.boolean().optional(),
  })
  .strict();

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
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const targetPubkey = await resolveHandleToPubkey(handle);
  if (!targetPubkey) {
    return NextResponse.json({ error: "handle_not_resolvable" }, { status: 404 });
  }

  const auth = await authFromRequest(req);
  let isFollowing = false;
  if (auth?.ok) {
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase
        .from("follows")
        .select("follower_pubkey")
        .eq("follower_pubkey", auth.pubkey)
        .eq("following_pubkey", targetPubkey)
        .maybeSingle();
      isFollowing = Boolean(data);
    }
  }

  return NextResponse.json({
    ok: true,
    handle,
    pubkey: targetPubkey,
    is_following: isFollowing,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { handle } = await params;
  const targetPubkey = await resolveHandleToPubkey(handle);
  if (!targetPubkey) {
    return NextResponse.json({ error: "handle_not_resolvable" }, { status: 404 });
  }
  if (targetPubkey === auth.pubkey) {
    return NextResponse.json({ error: "cannot_follow_self" }, { status: 400 });
  }

  let body: z.infer<typeof Body> = {};
  if (req.headers.get("content-type")?.includes("application/json")) {
    try {
      body = Body.parse(await req.json());
    } catch (e) {
      return NextResponse.json(
        { error: "invalid_body", message: (e as Error).message },
        { status: 400 },
      );
    }
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { error } = await supabase.from("follows").upsert(
    {
      follower_pubkey: auth.pubkey,
      following_pubkey: targetPubkey,
      push_on_receipt: body.push_on_receipt ?? true,
    },
    { onConflict: "follower_pubkey,following_pubkey" },
  );
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, handle, pubkey: targetPubkey, is_following: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { handle } = await params;
  const targetPubkey = await resolveHandleToPubkey(handle);
  if (!targetPubkey) {
    return NextResponse.json({ error: "handle_not_resolvable" }, { status: 404 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_pubkey", auth.pubkey)
    .eq("following_pubkey", targetPubkey);
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, handle, pubkey: targetPubkey, is_following: false });
}
