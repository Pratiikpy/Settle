import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/search/receipts?q=<query>&pubkey=<base58>&limit=20
 *
 * F2.10 — Receipt full-text search.
 *
 * Searches over `receipts.search_tsv` (auto-maintained tsvector covering
 * merchant + method + path + kind + narration). Filters to receipts the
 * caller is involved in (as buyer via cards or as merchant), so it's
 * effectively "search MY receipts" — no cross-tenant leakage.
 *
 * Empty `q` returns the most recent 20 receipts for the caller.
 *
 * The query is parsed with plainto_tsquery to keep user input safe (no
 * raw &/|/! operators escape into SQL injection territory).
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const pubkey = url.searchParams.get("pubkey")?.trim();
  const limit = Math.max(
    1,
    Math.min(50, Number(url.searchParams.get("limit") ?? 20)),
  );
  if (!pubkey) {
    return NextResponse.json({ error: "missing_pubkey" }, { status: 400 });
  }
  if (!PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

  // Find the user's card pubkeys so we can scope the search.
  const { data: ownedCards } = await sb
    .from("agent_cards")
    .select("card_pubkey")
    .eq("authority_pubkey", pubkey);
  const cardPubkeys = (ownedCards ?? []).map((c) => c.card_pubkey);

  const SELECT =
    "request_id, merchant_pubkey, card_pubkey, amount_lamports, decision, receipt_kind, target_method, target_path, narration_text, created_at";

  // Two scoped queries: receipts they bought (via card_pubkey IN) +
  // receipts they were paid for (merchant_pubkey = pubkey). UNION at
  // the application layer because Supabase doesn't expose UNION.
  type RowLike = Record<string, unknown> & { request_id: string };
  const queryBuilders: PromiseLike<{ data: RowLike[] | null }>[] = [];

  if (cardPubkeys.length > 0) {
    let qb = sb
      .from("receipts")
      .select(SELECT)
      .in("card_pubkey", cardPubkeys)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (q) qb = qb.textSearch("search_tsv", q, { type: "plain" });
    queryBuilders.push(qb as unknown as PromiseLike<{ data: RowLike[] | null }>);
  }

  {
    let qb = sb
      .from("receipts")
      .select(SELECT)
      .eq("merchant_pubkey", pubkey)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (q) qb = qb.textSearch("search_tsv", q, { type: "plain" });
    queryBuilders.push(qb as unknown as PromiseLike<{ data: RowLike[] | null }>);
  }

  const responses = await Promise.all(queryBuilders.map((p) => Promise.resolve(p)));
  const results: RowLike[] = responses.flatMap((r) => r.data ?? []);

  // Dedupe by request_id (a receipt where user is BOTH buyer and merchant
  // shouldn't appear twice) and sort by created_at desc.
  const dedupedById = new Map<string, (typeof results)[number]>();
  for (const r of results) {
    if (!dedupedById.has(r.request_id)) dedupedById.set(r.request_id, r);
  }
  const merged = Array.from(dedupedById.values())
    .sort((a, b) => {
      const ta = String(a.created_at ?? "");
      const tb = String(b.created_at ?? "");
      return tb.localeCompare(ta);
    })
    .slice(0, limit);

  return NextResponse.json({
    ok: true,
    query: q,
    count: merged.length,
    results: merged,
  });
}
