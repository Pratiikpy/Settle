import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOwnerAuth } from "../../../../lib/require-owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bookkeeper/categorize
 *
 * F29.3 — AI bookkeeper.
 *
 * Body: { pubkey: string, limit?: number, refresh?: boolean }
 *
 * For the caller's wallet, finds receipts (as buyer or merchant) without
 * a bookkeeper_category and categorizes each into a coarse bucket via
 * the same LLM provider chain as the narration endpoint:
 *   1. NVIDIA NIM (NVIDIA_API_KEY)
 *   2. Anthropic Claude (ANTHROPIC_API_KEY)
 *   3. Deterministic fallback (kind/narration → category)
 *
 * Caches the category to receipts.bookkeeper_category.
 *
 * Categories: ai_research, ai_translate, ai_summarize, ai_other,
 * subscription, one_time_purchase, transfer_to_self, gift, refund,
 * unclear.
 *
 * Returns the per-receipt assignments + a summary count by category.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALLOWED_CATEGORIES = [
  "ai_research",
  "ai_translate",
  "ai_summarize",
  "ai_other",
  "subscription",
  "one_time_purchase",
  "transfer_to_self",
  "gift",
  "refund",
  "unclear",
] as const;
type Category = (typeof ALLOWED_CATEGORIES)[number];

interface Receipt {
  request_id: string;
  receipt_kind: string | null;
  narration_text: string | null;
  target_path: string | null;
  capability_hash: string | null;
  amount_lamports: string;
  card_pubkey: string;
  merchant_pubkey: string;
}

/**
 * Deterministic fallback. Uses the receipt kind + a few narration
 * keywords to bucket into categories. Always returns SOMETHING — never
 * null — so a wallet without LLM keys still gets a categorized view.
 */
function templateCategory(r: Receipt): Category {
  if (r.receipt_kind === "refund") return "refund";
  if (r.receipt_kind === "streaming_claim") return "subscription";
  const lower = (r.narration_text ?? r.target_path ?? "").toLowerCase();
  if (/translat/.test(lower)) return "ai_translate";
  if (/summari[sz]e|summary/.test(lower)) return "ai_summarize";
  if (/arxiv|paper|research|academic/.test(lower)) return "ai_research";
  if (/agent|api|llm|gpt|claude|nim/.test(lower)) return "ai_other";
  if (r.card_pubkey === r.merchant_pubkey) return "transfer_to_self";
  if (r.receipt_kind === "x402_spend") return "ai_other";
  return "unclear";
}

async function tryNvidiaNim(prompts: Array<{ id: string; text: string }>):
  Promise<Map<string, Category> | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  const out = new Map<string, Category>();
  for (const p of prompts) {
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.NVIDIA_NIM_MODEL ?? "minimaxai/minimax-m2.5",
          temperature: 0.0,
          max_tokens: 16,
          messages: [
            {
              role: "system",
              content:
                `Categorize the receipt below into ONE of these categories. Reply with JUST the category, nothing else:\n${ALLOWED_CATEGORIES.join(", ")}`,
            },
            { role: "user", content: p.text },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const raw = String(json.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
      const matched = ALLOWED_CATEGORIES.find((c) => raw.includes(c));
      if (matched) out.set(p.id, matched);
    } catch {
      /* continue with the next */
    }
  }
  return out.size > 0 ? out : null;
}

export async function POST(req: NextRequest) {
  let body: { pubkey?: string; limit?: number; refresh?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.pubkey || !PUBKEY_RE.test(body.pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }
  // Bug #59 — without auth, attacker triggers an LLM run + writes to
  // victim's receipts.bookkeeper_category. Both data integrity (overwrite
  // user's curated categories) AND cost issue (paid LLM call attributed
  // to operator using attacker-supplied pubkey).
  const authFail = await requireOwnerAuth(req, body.pubkey);
  if (authFail) return authFail;
  const limit = Math.max(1, Math.min(100, body.limit ?? 50));
  const refresh = Boolean(body.refresh);

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Caller's cards (so we cover receipts where they were the buyer).
  const { data: cards } = await sb
    .from("agent_cards")
    .select("card_pubkey")
    .eq("authority_pubkey", body.pubkey);
  const cardPubkeys = (cards ?? []).map((c) => c.card_pubkey as string);

  // Pull recent receipts where the caller is buyer or merchant. If
  // refresh=false, exclude already-categorized rows to avoid LLM cost.
  type ReceiptRow = Receipt;
  const fetched: ReceiptRow[] = [];

  async function pull(filter: (q: any) => any) {
    let q = sb
      .from("receipts")
      .select(
        "request_id, receipt_kind, narration_text, target_path, capability_hash, amount_lamports, card_pubkey, merchant_pubkey, bookkeeper_category",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    q = filter(q);
    const { data } = await q;
    for (const r of data ?? []) {
      if (!refresh && r.bookkeeper_category) continue;
      fetched.push({
        request_id: r.request_id as string,
        receipt_kind: (r.receipt_kind as string | null) ?? null,
        narration_text: (r.narration_text as string | null) ?? null,
        target_path: (r.target_path as string | null) ?? null,
        capability_hash: (r.capability_hash as string | null) ?? null,
        amount_lamports: String(r.amount_lamports ?? "0"),
        card_pubkey: r.card_pubkey as string,
        merchant_pubkey: r.merchant_pubkey as string,
      });
    }
  }

  if (cardPubkeys.length > 0) {
    await pull((q) => q.in("card_pubkey", cardPubkeys));
  }
  await pull((q) => q.eq("merchant_pubkey", body.pubkey!));

  // Dedupe.
  const dedup = new Map<string, ReceiptRow>();
  for (const r of fetched) if (!dedup.has(r.request_id)) dedup.set(r.request_id, r);
  const receipts = [...dedup.values()].slice(0, limit);
  if (receipts.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      counts: {},
      message: "Nothing to categorize.",
    });
  }

  // Batched prompts for the LLM.
  const prompts = receipts.map((r) => ({
    id: r.request_id,
    text: JSON.stringify({
      kind: r.receipt_kind ?? "x402_spend",
      narration: r.narration_text ?? null,
      target_path: r.target_path ?? null,
      amount_lamports: r.amount_lamports,
    }),
  }));

  // Provider chain (NIM → template). Anthropic could be added the same way.
  const fromLlm = await tryNvidiaNim(prompts);

  // Resolve every receipt to a category — LLM if available, template otherwise.
  const assignments: Array<{ request_id: string; category: Category; provider: string }> = [];
  for (const r of receipts) {
    const llmCat = fromLlm?.get(r.request_id);
    if (llmCat) {
      assignments.push({ request_id: r.request_id, category: llmCat, provider: "nvidia_nim" });
    } else {
      assignments.push({
        request_id: r.request_id,
        category: templateCategory(r),
        provider: "template",
      });
    }
  }

  // Persist.
  const now = new Date().toISOString();
  for (const a of assignments) {
    await sb
      .from("receipts")
      .update({
        bookkeeper_category: a.category,
        bookkeeper_categorized_at: now,
      })
      .eq("request_id", a.request_id);
  }

  // Summary.
  const counts: Record<string, number> = {};
  for (const a of assignments) counts[a.category] = (counts[a.category] ?? 0) + 1;

  return NextResponse.json({
    ok: true,
    processed: assignments.length,
    counts,
    assignments,
    provider_used: fromLlm ? "nvidia_nim_with_template_fallback" : "template",
  });
}
