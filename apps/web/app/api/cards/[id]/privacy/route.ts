import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authFromRequest } from "../../../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * POST /api/cards/[id]/privacy
 * body: { public_feed_default: boolean, apply_to_existing?: boolean }
 *
 * Auth: card.authority must sign a wallet challenge first.
 *
 * Updates the card's `public_feed_default`. If apply_to_existing=true, also updates all
 * existing receipts for this card to match. New receipts inherit via the migration trigger.
 */

const BodySchema = z.object({
  public_feed_default: z.boolean(),
  apply_to_existing: z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) {
    return NextResponse.json({ error: "invalid_card_id" }, { status: 400 });
  }

  // Auth — only the card.authority can toggle privacy
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json(
      { error: "auth_required", reason: auth?.ok === false ? auth.reason : "missing" },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parse = BodySchema.safeParse(raw);
  if (!parse.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parse.error.issues },
      { status: 400 },
    );
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Verify the signed pubkey is the card.authority
  const { data: card, error: cErr } = await supabase
    .from("agent_cards")
    .select("authority_pubkey")
    .eq("card_pubkey", id)
    .maybeSingle();
  if (cErr) return NextResponse.json({ error: "supabase_error", message: cErr.message }, { status: 502 });
  if (!card) return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  if (card.authority_pubkey !== auth.pubkey) {
    return NextResponse.json(
      { error: "forbidden", message: "Not the card authority" },
      { status: 403 },
    );
  }

  // Update card default
  const { error: uErr } = await supabase
    .from("agent_cards")
    .update({ public_feed_default: parse.data.public_feed_default })
    .eq("card_pubkey", id);
  if (uErr) {
    return NextResponse.json({ error: "update_failed", message: uErr.message }, { status: 502 });
  }

  let existingUpdated = 0;
  if (parse.data.apply_to_existing) {
    const { data: updated, error: rErr } = await supabase
      .from("receipts")
      .update({ public_feed: parse.data.public_feed_default })
      .eq("card_pubkey", id)
      .select("request_id");
    if (rErr) {
      return NextResponse.json(
        { error: "receipts_update_failed", message: rErr.message },
        { status: 502 },
      );
    }
    existingUpdated = updated?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    card_pubkey: id,
    public_feed_default: parse.data.public_feed_default,
    existing_receipts_updated: existingUpdated,
  });
}
