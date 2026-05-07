import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireOwnerAuth } from "../../../lib/require-owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F7.3 — Scheduled sends CRUD.
 *
 *   GET    /api/scheduled-sends?owner=<pubkey>
 *   POST   /api/scheduled-sends
 *   DELETE /api/scheduled-sends   { schedule_id, owner_pubkey }
 *
 * The endpoint stores rules; a separate cron worker fires the
 * `direct_send` ix at next_fire_at. We compute next_fire_at server-side
 * from cadence + day_of_period + time_of_day so the worker doesn't have
 * to re-derive cadence semantics every tick.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const CreateBody = z.object({
  owner_pubkey: z.string().regex(PUBKEY_RE),
  card_pubkey: z.string().regex(PUBKEY_RE).optional(),
  dest_pubkey: z.string().regex(PUBKEY_RE),
  amount_lamports: z.string().regex(/^\d+$/),
  cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  day_of_period: z.number().int().min(0).max(28).optional(),
  time_of_day: z.string().regex(HHMM_RE).default("12:00"),
  note: z.string().max(140).optional(),
});

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Compute the next UTC fire time given a cadence + day_of_period + time_of_day.
 * For DAILY: next occurrence of HH:MM today (or tomorrow if past).
 * For WEEKLY: next occurrence of (day_of_period = 0..6) at HH:MM (Sun..Sat).
 * For MONTHLY: next occurrence of day-of-month (1..28) at HH:MM.
 */
function nextFireAt(args: {
  cadence: "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfPeriod?: number;
  timeOfDay: string;
}): Date {
  const [hh, mm] = args.timeOfDay.split(":").map((n) => parseInt(n, 10));
  const now = new Date();
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0),
  );
  if (args.cadence === "DAILY") {
    if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate;
  }
  if (args.cadence === "WEEKLY") {
    const wantDow = args.dayOfPeriod ?? 0;
    const curDow = candidate.getUTCDay();
    let delta = (wantDow - curDow + 7) % 7;
    if (delta === 0 && candidate <= now) delta = 7;
    candidate.setUTCDate(candidate.getUTCDate() + delta);
    return candidate;
  }
  // MONTHLY
  const wantDom = args.dayOfPeriod ?? 1;
  candidate.setUTCDate(wantDom);
  if (candidate <= now) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  return candidate;
}

export async function GET(req: NextRequest) {
  const owner = new URL(req.url).searchParams.get("owner");
  if (!owner || !PUBKEY_RE.test(owner)) {
    return NextResponse.json({ error: "invalid_owner" }, { status: 400 });
  }
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { data, error } = await sb
    .from("scheduled_sends")
    .select(
      "schedule_id, owner_pubkey, card_pubkey, dest_pubkey, amount_lamports, cadence, day_of_period, time_of_day, note, enabled, last_fired_at, next_fire_at, created_at",
    )
    .eq("owner_pubkey", owner)
    .order("next_fire_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, schedules: data ?? [] });
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
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;
  // Guardrail: WEEKLY requires day_of_period 0..6, MONTHLY requires 1..28.
  if (v.cadence === "WEEKLY" && (v.day_of_period === undefined || v.day_of_period > 6)) {
    return NextResponse.json({ error: "weekly_dow_required" }, { status: 400 });
  }
  if (
    v.cadence === "MONTHLY" &&
    (v.day_of_period === undefined || v.day_of_period < 1 || v.day_of_period > 28)
  ) {
    return NextResponse.json({ error: "monthly_dom_required" }, { status: 400 });
  }
  const authFail = await requireOwnerAuth(req, v.owner_pubkey);
  if (authFail) return authFail;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const fireArgs: Parameters<typeof nextFireAt>[0] = {
    cadence: v.cadence,
    timeOfDay: v.time_of_day,
  };
  if (v.day_of_period !== undefined) fireArgs.dayOfPeriod = v.day_of_period;
  const next = nextFireAt(fireArgs).toISOString();

  const { data, error } = await sb
    .from("scheduled_sends")
    .insert({
      owner_pubkey: v.owner_pubkey,
      card_pubkey: v.card_pubkey ?? null,
      dest_pubkey: v.dest_pubkey,
      amount_lamports: v.amount_lamports,
      cadence: v.cadence,
      day_of_period: v.day_of_period ?? null,
      time_of_day: v.time_of_day,
      note: v.note ?? null,
      next_fire_at: next,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, schedule: data });
}

export async function DELETE(req: NextRequest) {
  let body: { schedule_id?: string; owner_pubkey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.schedule_id || !body.owner_pubkey) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const authFail = await requireOwnerAuth(req, body.owner_pubkey);
  if (authFail) return authFail;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const { error } = await sb
    .from("scheduled_sends")
    .delete()
    .eq("schedule_id", body.schedule_id)
    .eq("owner_pubkey", body.owner_pubkey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
