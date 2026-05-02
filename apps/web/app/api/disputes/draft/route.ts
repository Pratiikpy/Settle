import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/disputes/draft
 *   body: { request_id: string }
 *
 * F29.7 — AI dispute drafter.
 *
 * Reads the receipt + refund_request for a given request_id and returns
 * a polite, factual draft response a merchant can paste into an email
 * or chat. Provider chain (NIM → Anthropic → template).
 *
 * The drafter is deliberately conservative:
 *   - Never claims the merchant is at fault.
 *   - Never offers a refund — that's a separate decision.
 *   - References the on-chain proof + the customer's emoji/reason verbatim.
 *
 * Public read; no auth. The receipt fields used are public-safe.
 */

interface ReceiptRow {
  request_id: string;
  amount_lamports: string;
  receipt_kind: string | null;
  decision: string | null;
  narration_text: string | null;
  merchant_pubkey: string;
  card_pubkey: string;
  created_at: string;
}

interface RefundRow {
  reason: string;
  emoji: string | null;
  authority_pubkey: string;
  created_at: string;
}

function templateDraft(args: {
  receipt: ReceiptRow;
  refund: RefundRow;
}): string {
  const usdc = (Number(args.receipt.amount_lamports) / 1e6).toFixed(2);
  const when = new Date(args.receipt.created_at).toLocaleString();
  const emoji = args.refund.emoji ?? "";
  const reason = args.refund.reason || "(no reason given)";
  return [
    `Hi —`,
    ``,
    `Thanks for flagging your concern about the $${usdc} USDC payment from ${when}.`,
    ``,
    `Your note read: ${emoji} "${reason}"`,
    ``,
    `Every Settle payment leaves a 4-hash on-chain receipt; I've reviewed`,
    `yours (request_id ${args.receipt.request_id.slice(0, 8)}…) and want to`,
    `understand what didn't meet expectations before deciding next steps.`,
    ``,
    `Could you share a bit more about what you expected vs what you got?`,
    `If a refund is the right outcome here, I'd like to make that happen`,
    `quickly; if there's a misunderstanding I want to clear it up.`,
    ``,
    `Thanks for the patience —`,
  ].join("\n");
}

async function tryNvidia(prompt: string): Promise<string | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.NVIDIA_NIM_MODEL ?? "minimaxai/minimax-m2.5",
        temperature: 0.4,
        max_tokens: 360,
        messages: [
          {
            role: "system",
            content:
              [
                "You are a merchant's polite, factual dispute-reply drafter.",
                "Rules — follow strictly:",
                "1. Acknowledge the customer's emoji + reason verbatim.",
                "2. Reference the receipt amount + date.",
                "3. Ask one clarifying question.",
                "4. Do NOT offer a refund. Do NOT claim fault. Do NOT add legalese.",
                "5. Keep under 150 words. Plain English. Warm, not corporate.",
              ].join(" "),
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const t = String(j.choices?.[0]?.message?.content ?? "").trim();
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

async function tryAnthropic(prompt: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system:
          "You are a merchant's polite, factual dispute-reply drafter. Acknowledge the customer's emoji + reason verbatim, reference amount + date, ask ONE clarifying question, do NOT offer refunds or claim fault, under 150 words, plain English.",
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const t = String(j.content?.[0]?.text ?? "").trim();
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: { request_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = body.request_id;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: receipt } = await sb
    .from("receipts")
    .select(
      "request_id, amount_lamports, receipt_kind, decision, narration_text, merchant_pubkey, card_pubkey, created_at",
    )
    .eq("request_id", id)
    .maybeSingle<ReceiptRow>();
  if (!receipt) {
    return NextResponse.json({ error: "receipt_not_found" }, { status: 404 });
  }

  const { data: refunds } = await sb
    .from("refund_requests")
    .select("reason, emoji, authority_pubkey, created_at")
    .eq("request_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  const refund = (refunds ?? [])[0] as RefundRow | undefined;
  if (!refund) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_refund_request",
        message: "No refund_request rows for this receipt — nothing to draft from.",
      },
      { status: 404 },
    );
  }

  const usdc = (Number(receipt.amount_lamports) / 1e6).toFixed(2);
  const prompt = JSON.stringify({
    amount_usdc: usdc,
    receipt_when: receipt.created_at,
    receipt_narration: receipt.narration_text,
    receipt_kind: receipt.receipt_kind,
    customer_emoji: refund.emoji,
    customer_reason: refund.reason,
    instruction:
      "Draft a polite reply the merchant can send. Acknowledge the emoji + reason. Reference amount + date. Ask one clarifying question. No refund offers, no fault claims. <= 150 words.",
  });

  let draft = await tryNvidia(prompt);
  let provider: "nvidia_nim" | "anthropic" | "template" = "template";
  if (draft) provider = "nvidia_nim";
  if (!draft) {
    draft = await tryAnthropic(prompt);
    if (draft) provider = "anthropic";
  }
  if (!draft) {
    draft = templateDraft({ receipt, refund });
    provider = "template";
  }

  return NextResponse.json({
    ok: true,
    request_id: id,
    provider,
    draft,
  });
}
