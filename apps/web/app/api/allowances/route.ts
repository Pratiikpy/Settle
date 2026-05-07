import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireOwnerAuth } from "../../../lib/require-owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F7.9 — Allowances CRUD.
 *
 *   GET    /api/allowances?parent=<pubkey>      — list allowances I'm paying
 *   GET    /api/allowances?kid=<pubkey>          — list allowances I receive
 *   POST   /api/allowances
 *   PATCH  /api/allowances { allowance_id, parent_pubkey, ...partial }
 *   DELETE /api/allowances { allowance_id, parent_pubkey }
 *
 * Only the parent can mutate; the kid GETs by their own pubkey.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const CreateBody = z.object({
  parent_pubkey: z.string().regex(PUBKEY_RE),
  kid_pubkey: z.string().regex(PUBKEY_RE),
  weekly_lamports: z.string().regex(/^\d+$/),
  daily_cap_lamports: z.string().regex(/^\d+$/),
  kid_card: z.string().regex(PUBKEY_RE).optional(),
  /**
   * Parent's delegated card (agent=relayer). Required for the underlying
   * scheduled_send to fire — without it the cron writes "no card" failure
   * rows into phase5_executions every week.
   */
  parent_card_pubkey: z.string().regex(PUBKEY_RE).optional(),
  /**
   * UTC HH:MM the weekly fire happens. Default Sundays at noon.
   */
  time_of_day: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("12:00"),
});

const PatchBody = z.object({
  allowance_id: z.string().uuid(),
  parent_pubkey: z.string().regex(PUBKEY_RE),
  weekly_lamports: z.string().regex(/^\d+$/).optional(),
  daily_cap_lamports: z.string().regex(/^\d+$/).optional(),
  kid_card: z.string().regex(PUBKEY_RE).optional(),
  enabled: z.boolean().optional(),
});

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parent = url.searchParams.get("parent");
  const kid = url.searchParams.get("kid");
  if (!parent && !kid) {
    return NextResponse.json({ error: "parent_or_kid_required" }, { status: 400 });
  }
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  let q = sb
    .from("allowances")
    .select(
      "allowance_id, parent_pubkey, kid_pubkey, kid_card, weekly_lamports, daily_cap_lamports, enabled, last_funded_at, created_at",
    );
  if (parent) {
    if (!PUBKEY_RE.test(parent))
      return NextResponse.json({ error: "invalid_parent" }, { status: 400 });
    q = q.eq("parent_pubkey", parent);
  } else if (kid) {
    if (!PUBKEY_RE.test(kid))
      return NextResponse.json({ error: "invalid_kid" }, { status: 400 });
    q = q.eq("kid_pubkey", kid);
  }
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, allowances: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const v = parsed.data;
  const authFail = await requireOwnerAuth(req, v.parent_pubkey);
  if (authFail) return authFail;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  // C49 — also create the underlying scheduled_send so the existing
  // Phase 5 cron actually fires this allowance weekly. Sundays at the
  // requested time (default noon UTC). day_of_period=0 = Sunday.
  // We compute next_fire_at server-side (matches /api/scheduled-sends
  // logic) so the signer can pick it up immediately.
  const [hh, mm] = v.time_of_day.split(":").map((n) => parseInt(n, 10));
  const nextSundayUtc = (() => {
    const now = new Date();
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0),
    );
    const dow = d.getUTCDay();
    let delta = (0 - dow + 7) % 7;
    if (delta === 0 && d <= now) delta = 7;
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString();
  })();

  const { data: scheduleRow, error: schedErr } = await sb
    .from("scheduled_sends")
    .insert({
      owner_pubkey: v.parent_pubkey,
      card_pubkey: v.parent_card_pubkey ?? null,
      dest_pubkey: v.kid_pubkey,
      amount_lamports: v.weekly_lamports,
      cadence: "WEEKLY",
      day_of_period: 0, // Sunday
      time_of_day: v.time_of_day,
      note: `Allowance to ${v.kid_pubkey.slice(0, 6)}…`,
      next_fire_at: nextSundayUtc,
    })
    .select()
    .single();
  if (schedErr || !scheduleRow) {
    return NextResponse.json(
      { error: "schedule_insert_failed", detail: schedErr?.message },
      { status: 500 },
    );
  }

  const { data, error } = await sb
    .from("allowances")
    .insert({
      parent_pubkey: v.parent_pubkey,
      kid_pubkey: v.kid_pubkey,
      weekly_lamports: v.weekly_lamports,
      daily_cap_lamports: v.daily_cap_lamports,
      kid_card: v.kid_card ?? null,
      schedule_id: scheduleRow.schedule_id,
    })
    .select()
    .single();
  if (error) {
    // Roll back the schedule we just created so we don't leave orphans.
    await sb.from("scheduled_sends").delete().eq("schedule_id", scheduleRow.schedule_id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    allowance: data,
    schedule: scheduleRow,
    hint: v.parent_card_pubkey
      ? "Spawn a Pact for the underlying schedule on /wishes to enable firing."
      : "No parent_card_pubkey supplied — set one on the schedule before the cron can fire it.",
  });
}

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const v = parsed.data;
  const authFail = await requireOwnerAuth(req, v.parent_pubkey);
  if (authFail) return authFail;
  const update: Record<string, unknown> = {};
  if (v.weekly_lamports !== undefined) update.weekly_lamports = v.weekly_lamports;
  if (v.daily_cap_lamports !== undefined) update.daily_cap_lamports = v.daily_cap_lamports;
  if (v.kid_card !== undefined) update.kid_card = v.kid_card;
  if (v.enabled !== undefined) update.enabled = v.enabled;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data, error } = await sb
    .from("allowances")
    .update(update)
    .eq("allowance_id", v.allowance_id)
    .eq("parent_pubkey", v.parent_pubkey)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, allowance: data });
}

export async function DELETE(req: NextRequest) {
  let body: { allowance_id?: string; parent_pubkey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.allowance_id || !body.parent_pubkey) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const authFail = await requireOwnerAuth(req, body.parent_pubkey);
  if (authFail) return authFail;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  // First fetch to get the schedule_id so we can delete both.
  const { data: existing } = await sb
    .from("allowances")
    .select("schedule_id")
    .eq("allowance_id", body.allowance_id)
    .eq("parent_pubkey", body.parent_pubkey)
    .maybeSingle();

  // Delete the schedule first (best-effort) — its FK is set null on
  // delete, so order doesn't matter for referential integrity, but
  // doing schedule first avoids the brief window where the allowance
  // is gone but its cron firing continues.
  if (existing?.schedule_id) {
    await sb
      .from("scheduled_sends")
      .delete()
      .eq("schedule_id", existing.schedule_id)
      .eq("owner_pubkey", body.parent_pubkey);
  }

  const { error } = await sb
    .from("allowances")
    .delete()
    .eq("allowance_id", body.allowance_id)
    .eq("parent_pubkey", body.parent_pubkey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
