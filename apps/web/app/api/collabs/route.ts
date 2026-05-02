import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { authFromRequest } from "../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * Collabs CRUD (F20).
 *
 *   GET  /api/collabs?organizer=<pubkey>  — list this organizer's collabs (public)
 *   POST /api/collabs                     — create (wallet-sig auth = creator_a)
 *
 * The organizer is creator_a by default; ratio_bps_a is creator A's share in basis
 * points. ratio_bps_b is implicit (10000 - ratio_bps_a). Both must be > 0.
 */

const Body = z.object({
  creator_a_pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  creator_b_pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  ratio_bps_a: z.number().int().min(1).max(9999),
  label: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
});

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const organizer = req.nextUrl.searchParams.get("organizer");
  if (!organizer || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(organizer)) {
    return NextResponse.json({ error: "invalid_organizer" }, { status: 400 });
  }
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data, error } = await supabase
    .from("collabs")
    .select(
      "id, organizer_pubkey, creator_a_pubkey, creator_b_pubkey, ratio_bps_a, label, description, created_at, active",
    )
    .eq("organizer_pubkey", organizer)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: (e as Error).message },
      { status: 400 },
    );
  }

  // Caller must be one of the creators (and is recorded as the organizer).
  if (auth.pubkey !== parsed.creator_a_pubkey && auth.pubkey !== parsed.creator_b_pubkey) {
    return NextResponse.json(
      {
        error: "caller_not_a_creator",
        message: "Authority must be either creator_a or creator_b on the collab.",
      },
      { status: 403 },
    );
  }
  if (parsed.creator_a_pubkey === parsed.creator_b_pubkey) {
    return NextResponse.json(
      { error: "duplicate_creators", message: "creator_a and creator_b must differ" },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data, error } = await supabase
    .from("collabs")
    .insert({
      organizer_pubkey: auth.pubkey,
      creator_a_pubkey: parsed.creator_a_pubkey,
      creator_b_pubkey: parsed.creator_b_pubkey,
      ratio_bps_a: parsed.ratio_bps_a,
      label: parsed.label,
      description: parsed.description ?? null,
    })
    .select("id, ratio_bps_a, label, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: data.id, label: data.label });
}
