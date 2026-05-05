import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wave 6.2 — `/api/dashboard/v6?pubkey=<base58>`
 *
 * Returns the bento-grid-shaped payload the redesigned consumer home
 * consumes. Single round-trip; six small SQL queries combined.
 *
 * See WAVE_6_DATA.md §3 for the data contract. Empty wallets get a
 * zeroed payload — the UI renders "Welcome — fills in as you transact"
 * empty states rather than crashing or showing fake data.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface W6Dashboard {
  ok: true;
  pubkey: string;
  today: {
    spent_usdc: string;
    spent_count: number;
    received_usdc: string;
    received_count: number;
    agents_active: number;
  };
  agents_on_duty: Array<{
    card_pubkey: string;
    label: string;
    spent_today_usdc: string;
    cap_usdc: string;
    fill_pct: number;
  }>;
  recent_receipts: Array<{
    request_id: string;
    kind: string;
    counterparty: string;
    purpose: string;
    amount_usdc: string;
    decision: string;
    deny_code: number | null;
    ts: string;
  }>;
  active_pacts: Array<{
    pact_pubkey: string;
    kind: string;
    label: string;
    spent_usdc: string;
    cap_usdc: string;
    expiry_slot: string | null;
    fill_pct: number;
  }>;
  coming_up: Array<{
    kind: string;
    label: string;
    cadence: string;
    next_run: string | null;
    amount_usdc: string;
  }>;
  savings: Array<{
    id: string;
    label: string;
    saved_usdc: string;
    goal_usdc: string;
    fill_pct: number;
  }>;
  as_of: string;
}

function lamportsToUsdc(v: bigint | number | string | null | undefined): string {
  if (v == null) return "0.00";
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return (n / 1e6).toFixed(2);
}

function relativeTs(ts: string): string {
  const d = new Date(ts);
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const EMPTY = (pubkey: string): W6Dashboard => ({
  ok: true,
  pubkey,
  today: {
    spent_usdc: "0.00",
    spent_count: 0,
    received_usdc: "0.00",
    received_count: 0,
    agents_active: 0,
  },
  agents_on_duty: [],
  recent_receipts: [],
  active_pacts: [],
  coming_up: [],
  savings: [],
  as_of: new Date().toISOString(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const pubkey = url.searchParams.get("pubkey")?.trim();
  if (!pubkey || !PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) {
    return NextResponse.json(EMPTY(pubkey));
  }
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  // Tag-prefixed error logger for the 9 Supabase queries below. Each
  // query soft-fails to safe defaults ([] / 0) when Supabase is down,
  // but ops needs *some* signal that data went missing — matches the
  // [route/path] convention used elsewhere (balance, landing/feed, etc).
  const logErr = (tag: string, err: { message?: string } | null) => {
    if (err) console.warn(`[dashboard/v6] ${tag} query failed:`, err.message);
  };

  // Cards owned by this pubkey
  const { data: ownedCards, error: ownedCardsErr } = await sb
    .from("agent_cards")
    .select("card_pubkey, label, daily_cap_lamports, revoked, used_today")
    .eq("authority_pubkey", pubkey);
  logErr("ownedCards", ownedCardsErr);

  const cardPubkeys = (ownedCards ?? []).map((c) => c.card_pubkey as string);
  const activeCards = (ownedCards ?? []).filter((c) => !c.revoked);

  // Receipts in last 24h relevant to this user (as buyer or merchant)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  // Outbound (cards user owns OR direct sends from user's wallet, ALLOW).
  // Bug #38: include user's wallet — direct_send receipts use sender's
  // wallet as card_pubkey, so a /send → confirmed used to leave today's
  // "spent" counter at $0.
  let outboundToday: Array<{ amount_lamports: string; card_pubkey: string }> = [];
  {
    const cardKeysWithSelf = [pubkey, ...cardPubkeys];
    const { data, error } = await sb
      .from("receipts")
      .select("amount_lamports, card_pubkey")
      .in("card_pubkey", cardKeysWithSelf)
      .eq("decision", "ALLOW")
      .gte("created_at", todayIso);
    logErr("outboundToday", error);
    outboundToday = (data ?? []) as Array<{
      amount_lamports: string;
      card_pubkey: string;
    }>;
  }

  // Inbound (user is merchant, ALLOW)
  const { data: inboundTodayRaw, error: inboundErr } = await sb
    .from("receipts")
    .select("amount_lamports")
    .eq("merchant_pubkey", pubkey)
    .eq("decision", "ALLOW")
    .gte("created_at", todayIso);
  logErr("inboundToday", inboundErr);
  const inboundToday = (inboundTodayRaw ?? []) as Array<{ amount_lamports: string }>;

  const spentLamports = outboundToday.reduce(
    (acc, r) => acc + Number(r.amount_lamports ?? 0),
    0,
  );
  const receivedLamports = inboundToday.reduce(
    (acc, r) => acc + Number(r.amount_lamports ?? 0),
    0,
  );
  const agentsActive = new Set(outboundToday.map((r) => r.card_pubkey)).size;

  // agents_on_duty: top 3 cards by spend today
  const cardSpend = new Map<string, number>();
  for (const r of outboundToday) {
    cardSpend.set(
      r.card_pubkey,
      (cardSpend.get(r.card_pubkey) ?? 0) + Number(r.amount_lamports ?? 0),
    );
  }
  const agentsOnDuty = activeCards
    .map((c) => {
      const spent = cardSpend.get(c.card_pubkey as string) ?? Number(c.used_today ?? 0);
      const cap = Number(c.daily_cap_lamports ?? 0);
      const spentUsdc = (spent / 1e6).toFixed(2);
      const capUsdc = (cap / 1e6).toFixed(2);
      const fillPct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
      return {
        card_pubkey: c.card_pubkey as string,
        label: (c.label as string) ?? "Untitled card",
        spent_today_usdc: spentUsdc,
        cap_usdc: capUsdc,
        fill_pct: Math.round(fillPct),
      };
    })
    .sort((a, b) => parseFloat(b.spent_today_usdc) - parseFloat(a.spent_today_usdc))
    .slice(0, 3);

  // Recent receipts (last 5 across user's cards or merchant=pubkey)
  type ReceiptRow = {
    request_id: string;
    receipt_kind: string | null;
    merchant_pubkey: string;
    card_pubkey: string;
    amount_lamports: string;
    decision: string;
    deny_code: number | null;
    created_at: string;
  };
  let recentRows: ReceiptRow[] = [];
  // Bug #21 (real fix): use `.in("card_pubkey", […])` for the OR-of-eq
  // pattern (multiple `card_pubkey.eq.X` clauses inside `.or()` got
  // parsed as the LAST eq winning, returning 0 rows). The user's wallet
  // is included because direct sends store the sender there.
  const cardKeysForFilter = [pubkey, ...cardPubkeys];
  // Two queries unioned client-side: the OR-on-different-columns case
  // (card vs merchant) is the only one PostgREST's .or() needs to
  // express. The card_pubkey membership uses .in() which is reliable.
  {
    const [byCard, byMerchant] = await Promise.all([
      sb
        .from("receipts")
        .select(
          "request_id, receipt_kind, merchant_pubkey, card_pubkey, amount_lamports, decision, deny_code, created_at",
        )
        .in("card_pubkey", cardKeysForFilter)
        .order("created_at", { ascending: false })
        .limit(10),
      sb
        .from("receipts")
        .select(
          "request_id, receipt_kind, merchant_pubkey, card_pubkey, amount_lamports, decision, deny_code, created_at",
        )
        .eq("merchant_pubkey", pubkey)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    logErr("recentRows.byCard", byCard.error);
    logErr("recentRows.byMerchant", byMerchant.error);
    const merged = [...(byCard.data ?? []), ...(byMerchant.data ?? [])];
    // Dedupe by request_id, sort by created_at desc, take 5.
    const seen = new Set<string>();
    const deduped = merged.filter((r) => {
      if (seen.has(r.request_id)) return false;
      seen.add(r.request_id);
      return true;
    });
    deduped.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    recentRows = deduped.slice(0, 5) as ReceiptRow[];
  }

  const recentReceipts = recentRows.map((r) => ({
    request_id: r.request_id,
    kind: r.receipt_kind ?? "x402_spend",
    counterparty:
      r.merchant_pubkey === pubkey
        ? r.card_pubkey.slice(0, 8) + "…"
        : r.merchant_pubkey.slice(0, 8) + "…",
    purpose: "",
    amount_usdc: lamportsToUsdc(r.amount_lamports),
    decision: r.decision,
    deny_code: r.deny_code,
    ts: relativeTs(r.created_at),
  }));

  // Active pacts (top 3)
  let activePacts: W6Dashboard["active_pacts"] = [];
  if (cardPubkeys.length > 0) {
    const { data, error } = await sb
      .from("pacts")
      .select("pact_pubkey, mode, closed, expiry_slot, parent_card, used_lamports, max_total_lamports")
      .in("parent_card", cardPubkeys)
      .eq("closed", false)
      .order("created_at", { ascending: false })
      .limit(3);
    logErr("activePacts", error);
    activePacts = ((data ?? []) as Array<{
      pact_pubkey: string;
      mode: string;
      expiry_slot: string;
      parent_card: string;
      used_lamports: string | null;
      max_total_lamports: string | null;
    }>).map((p) => {
      const used = Number(p.used_lamports ?? 0);
      const cap = Number(p.max_total_lamports ?? 0);
      const card = (ownedCards ?? []).find((c) => c.card_pubkey === p.parent_card);
      return {
        pact_pubkey: p.pact_pubkey,
        kind: p.mode,
        label: (card?.label as string) ?? "Untitled pact",
        spent_usdc: (used / 1e6).toFixed(2),
        cap_usdc: cap > 0 ? (cap / 1e6).toFixed(2) : "—",
        expiry_slot: p.expiry_slot,
        fill_pct: cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0,
      };
    });
  }

  // Coming up: scheduled_sends + allowances merged, top 3 upcoming
  type SchedRow = {
    label: string | null;
    cadence: string | null;
    next_run_at: string | null;
    amount_lamports: string | null;
  };
  const { data: schedRowsRaw, error: schedErr } = await sb
    .from("scheduled_sends")
    .select("label, cadence, next_run_at, amount_lamports, status, owner_pubkey")
    .eq("owner_pubkey", pubkey)
    .eq("status", "active")
    .order("next_run_at", { ascending: true })
    .limit(3);
  logErr("schedRows", schedErr);
  const schedRows = (schedRowsRaw ?? []) as SchedRow[];

  const comingUp = schedRows.map((s) => ({
    kind: "scheduled_send",
    label: s.label ?? "Scheduled send",
    cadence: s.cadence ?? "once",
    next_run: s.next_run_at,
    amount_usdc: lamportsToUsdc(s.amount_lamports),
  }));

  // Savings
  type SaveRow = {
    id: string;
    label: string | null;
    saved_lamports: string | null;
    goal_lamports: string | null;
    status: string | null;
  };
  const { data: savingsRowsRaw, error: savingsErr } = await sb
    .from("save_for_buckets")
    .select("id, label, saved_lamports, goal_lamports, status, owner_pubkey")
    .eq("owner_pubkey", pubkey)
    .order("saved_lamports", { ascending: false })
    .limit(3);
  logErr("savingsRows", savingsErr);
  const savingsRows = (savingsRowsRaw ?? []) as SaveRow[];

  const savings = savingsRows
    .filter((s) => s.status === "active")
    .map((s) => {
      const saved = Number(s.saved_lamports ?? 0);
      const goal = Number(s.goal_lamports ?? 0);
      return {
        id: s.id,
        label: s.label ?? "Savings goal",
        saved_usdc: (saved / 1e6).toFixed(2),
        goal_usdc: goal > 0 ? (goal / 1e6).toFixed(2) : "—",
        fill_pct: goal > 0 ? Math.min(100, Math.round((saved / goal) * 100)) : 0,
      };
    });

  return NextResponse.json({
    ok: true,
    pubkey,
    today: {
      spent_usdc: lamportsToUsdc(spentLamports),
      spent_count: outboundToday.length,
      received_usdc: lamportsToUsdc(receivedLamports),
      received_count: inboundToday.length,
      agents_active: agentsActive,
    },
    agents_on_duty: agentsOnDuty,
    recent_receipts: recentReceipts,
    active_pacts: activePacts,
    coming_up: comingUp,
    savings,
    as_of: new Date().toISOString(),
  } satisfies W6Dashboard);
}
