import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit/phase5?wallet=<pubkey>&limit=50
 *
 * Returns recent phase5_executions rows that involve the given wallet,
 * grouped by intent_kind. The wallet match is fuzzy by design: a row
 * shows up if the wallet appears as owner, source, dest, or refund
 * target. We don't enforce wallet auth here because the rows are
 * already public-shape data (no sealed metadata, no balances) and
 * users frequently need to share their audit log with collaborators
 * (parent showing kid the allowance fired, etc).
 *
 * Joining strategy: phase5_executions stores `intent_id` keyed by the
 * intent table — schedule_id, rule_id, gift_id. We join in a follow-up
 * query per intent kind so we can surface the "what was this rule's
 * actual config?" alongside the execution outcome.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface ExecutionRow {
  execution_id: string;
  intent_kind: string;
  intent_id: string;
  mode: string;
  status: string;
  signature: string | null;
  plan_json: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  if (!wallet || !PUBKEY_RE.test(wallet)) {
    return NextResponse.json({ error: "invalid_wallet" }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  // 1. Find the wallet's intent_ids across the four source tables.
  //    Then we filter phase5_executions by intent_id IN (those).
  //    Why not query phase5_executions directly with a wallet filter?
  //    Because plan_json is jsonb and querying nested keys with
  //    indexed performance is fiddly; the source-table filter is
  //    indexed and faster.

  const intentIds = new Map<string, string>(); // intent_id → intent_kind

  const [scheduledSends, autoRefills, giftsSender, giftsClaimer] = await Promise.all([
    sb
      .from("scheduled_sends")
      .select("schedule_id")
      .eq("owner_pubkey", wallet)
      .limit(200),
    sb
      .from("auto_refill_rules")
      .select("rule_id")
      .eq("owner_pubkey", wallet)
      .limit(200),
    sb.from("gift_sends").select("gift_id").eq("sender_pubkey", wallet).limit(200),
    sb.from("gift_sends").select("gift_id").eq("claimer_pubkey", wallet).limit(200),
  ]);

  for (const row of scheduledSends.data ?? []) {
    intentIds.set(row.schedule_id, "scheduled_send");
  }
  for (const row of autoRefills.data ?? []) {
    intentIds.set(row.rule_id, "auto_refill");
  }
  for (const row of giftsSender.data ?? []) {
    intentIds.set(row.gift_id, "gift_sender");
  }
  for (const row of giftsClaimer.data ?? []) {
    intentIds.set(row.gift_id, "gift_claim");
  }

  if (intentIds.size === 0) {
    return NextResponse.json({
      ok: true,
      wallet,
      executions: [],
      summary: { dry_run_logged: 0, sent: 0, confirmed: 0, failed: 0 },
    });
  }

  const { data: executions, error } = await sb
    .from("phase5_executions")
    .select(
      "execution_id, intent_kind, intent_id, mode, status, signature, plan_json, error_message, created_at, confirmed_at",
    )
    .in("intent_id", Array.from(intentIds.keys()))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (executions as ExecutionRow[] | null) ?? [];

  // Summary counts. Useful for the UI's hero band.
  const summary = {
    dry_run_logged: 0,
    sent: 0,
    confirmed: 0,
    failed: 0,
  };
  for (const r of rows) {
    if (r.status === "dry_run_logged") summary.dry_run_logged += 1;
    else if (r.status === "sent") summary.sent += 1;
    else if (r.status === "confirmed") summary.confirmed += 1;
    else if (r.status === "failed") summary.failed += 1;
  }

  return NextResponse.json({
    ok: true,
    wallet,
    executions: rows,
    summary,
  });
}
