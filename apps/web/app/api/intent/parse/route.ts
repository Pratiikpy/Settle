import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseIntentRegex } from "@settle/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F7.12 — Natural-language send intent parser.
 *
 *   POST /api/intent/parse
 *     { text: string }
 *
 *   Response:
 *     { ok: true,
 *       intent: {
 *         action: "direct_send" | "save_for" | "schedule" | "unknown",
 *         recipient_handle: string | null,
 *         recipient_pubkey: string | null,
 *         amount_usdc: string | null,
 *         amount_lamports: string | null,
 *         note: string | null,
 *         confidence: 0..1,
 *         needs_confirmation: boolean,
 *       },
 *       provider: "nim" | "anthropic" | "regex"
 *     }
 *
 * The provider chain is NIM → Anthropic → regex fallback. Regex always
 * works for the canonical phrasing "send <handle> <amount> [usdc]
 * [for <note>]" so the endpoint never returns "I don't understand"
 * for the most common case.
 *
 * NB: this endpoint does NOT build or sign a tx. It's the
 * "what did the user mean?" step. The client takes the returned intent,
 * shows a confirmation modal, and only then routes to the right ix
 * builder (/api/send/build, /api/save-for, etc).
 */

const Body = z.object({
  text: z.string().min(1).max(500),
});

interface Intent {
  action: "direct_send" | "save_for" | "schedule" | "unknown";
  recipient_handle: string | null;
  recipient_pubkey: string | null;
  amount_usdc: string | null;
  amount_lamports: string | null;
  note: string | null;
  confidence: number;
  needs_confirmation: boolean;
}

const HANDLE_RE = /^[a-z0-9_-]{2,32}$/i;
const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Deterministic regex parser. Delegated to @settle/sdk's
 * `parseIntentRegex` so the SDK's vitest suite covers it. Matches:
 *   "send <recipient> <amount> [usdc|usd] [for|with note <note>]"
 *   "pay <recipient> <amount> [usdc|usd] [for|with note <note>]"
 *   "transfer <amount> [usdc|usd] to <recipient>"
 * recipient is either @handle, raw handle, or a base58 pubkey.
 */
function regexParse(raw: string): Intent | null {
  const r = parseIntentRegex(raw);
  if (!r) return null;
  return {
    // Honor the SDK's action — direct_send, save_for, or schedule.
    action: r.action,
    recipient_handle: r.recipient_handle,
    recipient_pubkey: r.recipient_pubkey,
    amount_usdc: r.amount_usdc,
    amount_lamports: r.amount_lamports,
    note: r.note,
    confidence: r.confidence,
    needs_confirmation: true,
  };
}

const LLM_SYSTEM_PROMPT = [
  "You parse short payment commands into structured JSON intents.",
  "OUTPUT ONLY a JSON object with these exact keys (no prose, no markdown):",
  '  { "action": "direct_send" | "save_for" | "schedule" | "unknown",',
  '    "recipient": string | null,           // @handle, raw handle, or base58 pubkey',
  '    "amount_usdc": string | null,          // dollar amount as decimal string, e.g. "5" or "12.34"',
  '    "note": string | null,                 // optional purpose',
  '    "confidence": 0..1                      // your confidence the parse is correct',
  "  }",
  "Rules:",
  "1. Default action is direct_send if money is moving NOW.",
  "2. Only return save_for if the user said 'save for X' or 'put aside for X'.",
  "3. Only return schedule if the user said 'every <period>' or named a recurring cadence.",
  "4. If you can't confidently extract an amount AND a recipient, return action='unknown'.",
  "5. NEVER fabricate fields. If the user didn't supply a note, return null.",
].join("\n");

async function tryNim(text: string): Promise<Intent | null> {
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
        temperature: 0.1,
        max_tokens: 240,
        messages: [
          { role: "system", content: LLM_SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const raw = j.choices?.[0]?.message?.content;
    return parseJsonIntent(raw);
  } catch {
    return null;
  }
}

async function tryAnthropic(text: string): Promise<Intent | null> {
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
        max_tokens: 280,
        system: LLM_SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const raw = j.content?.[0]?.text;
    return parseJsonIntent(raw);
  } catch {
    return null;
  }
}

function parseJsonIntent(raw: unknown): Intent | null {
  if (typeof raw !== "string") return null;
  // Strip ```json fences if the model emits them despite our instructions.
  const stripped = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    const j = JSON.parse(stripped) as {
      action?: string;
      recipient?: string | null;
      amount_usdc?: string | null;
      note?: string | null;
      confidence?: number;
    };
    if (
      !j.action ||
      !["direct_send", "save_for", "schedule", "unknown"].includes(j.action)
    ) {
      return null;
    }
    if (j.action === "unknown" || !j.recipient || !j.amount_usdc) {
      return {
        action: "unknown",
        recipient_handle: null,
        recipient_pubkey: null,
        amount_usdc: null,
        amount_lamports: null,
        note: null,
        confidence: typeof j.confidence === "number" ? j.confidence : 0,
        needs_confirmation: true,
      };
    }
    const recipientStripped = j.recipient.replace(/^@/, "");
    const isPubkey = PUBKEY_RE.test(recipientStripped);
    const isHandle = !isPubkey && HANDLE_RE.test(recipientStripped);
    const amountFloat = parseFloat(j.amount_usdc);
    const amountLamports = Number.isFinite(amountFloat)
      ? Math.round(amountFloat * 1_000_000).toString()
      : null;
    return {
      action: j.action as Intent["action"],
      recipient_handle: isHandle ? recipientStripped.toLowerCase() : null,
      recipient_pubkey: isPubkey ? recipientStripped : null,
      amount_usdc: j.amount_usdc,
      amount_lamports: amountLamports,
      note: j.note ?? null,
      confidence: typeof j.confidence === "number" ? j.confidence : 0.7,
      needs_confirmation: true,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const text = parsed.data.text;

  // Try LLMs first, regex as floor — the LLM gets context (typos, alt phrasings).
  let intent = await tryNim(text);
  let provider: "nim" | "anthropic" | "regex" = "nim";
  if (!intent) {
    intent = await tryAnthropic(text);
    if (intent) provider = "anthropic";
  }
  if (!intent || intent.action === "unknown") {
    const regexHit = regexParse(text);
    if (regexHit) {
      intent = regexHit;
      provider = "regex";
    } else if (!intent) {
      intent = {
        action: "unknown",
        recipient_handle: null,
        recipient_pubkey: null,
        amount_usdc: null,
        amount_lamports: null,
        note: null,
        confidence: 0,
        needs_confirmation: true,
      };
      provider = "regex";
    }
  }

  // Resolve handle → pubkey via the existing /api/resolve endpoint if we
  // got a handle but no pubkey. Best-effort — if resolve fails we still
  // return the handle and let the client surface the error.
  if (intent.action !== "unknown" && intent.recipient_handle && !intent.recipient_pubkey) {
    try {
      const baseUrl = req.nextUrl.origin;
      const r = await fetch(
        `${baseUrl}/api/resolve?handle=${encodeURIComponent(intent.recipient_handle)}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (r.ok) {
        const j = (await r.json()) as { pubkey?: string };
        if (j.pubkey && PUBKEY_RE.test(j.pubkey)) {
          intent.recipient_pubkey = j.pubkey;
        }
      }
    } catch {
      // Resolution failed; client decides whether to proceed.
    }
  }

  return NextResponse.json({ ok: true, intent, provider });
}
