import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/receipts/[requestId]/narrate
 *
 * F2.3 Receipt-as-story — returns a plain-English paragraph describing
 * the receipt. Cached to receipts.narration_text on first generation;
 * subsequent calls return the cached text instantly.
 *
 * Provider chain (ordered, first that succeeds wins):
 *   1. NVIDIA NIM     — if NVIDIA_API_KEY is set
 *   2. Anthropic      — if ANTHROPIC_API_KEY is set
 *   3. Template       — deterministic fallback, always available.
 *
 * The provider used is recorded in receipts.narration_provider so a future
 * /api/receipts/[id]/re-narrate endpoint can prefer LLM over template when
 * keys come back online.
 *
 * Auth: public read. The narration is derived solely from public-safe
 * columns (decision, amount, kind, hashes — but never plaintext purpose
 * or sealed metadata). Aligns with the public-feed posture.
 *
 * ?refresh=1 forces re-generation even if cached.
 */

interface ReceiptRow {
  request_id: string;
  card_pubkey: string | null;
  pact_pubkey: string | null;
  merchant_pubkey: string;
  amount_lamports: string;
  decision: "ALLOW" | "DENY" | "REVIEW";
  deny_code: number | null;
  receipt_kind: string | null;
  target_method: string | null;
  target_path: string | null;
  decision_slot: number;
  policy_version: number;
  created_at: string;
  narration_text: string | null;
  narration_provider: string | null;
  narration_generated_at: string | null;
}

interface NameResolution {
  merchant_label: string;
  sender_label: string | null;
  merchant_handle: string | null;
  sender_handle: string | null;
}

function shortPubkey(p: string): string {
  return `${p.slice(0, 4)}…${p.slice(-4)}`;
}

function formatUsdc(lamports: string): string {
  const n = Number(lamports);
  return (n / 1e6).toFixed(n % 1_000_000 === 0 ? 0 : 2);
}

function timeWords(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const hour = d.getHours();
  const ampm = hour >= 12 ? "pm" : "am";
  const h12 = ((hour + 11) % 12) + 1;
  return `${month} ${day} at ${h12}${ampm}`;
}

function denyReason(code: number | null): string {
  if (!code) return "policy violation";
  const map: Record<number, string> = {
    1: "card was revoked",
    2: "card has expired",
    3: "amount exceeded the per-call cap",
    4: "amount would exceed the daily cap",
    5: "merchant wasn't on the allowlist",
    6: "the request looked like a duplicate or loop",
    7: "the capability hash didn't match what was pinned",
    8: "the merchant wasn't in the verified registry",
  };
  return map[code] ?? "policy violation";
}

/**
 * Deterministic narration. Always available; no API key needed. Uses ONLY
 * public-safe columns — the wire-level facts. Reads natural because the
 * canonical receipt has enough structure that a template can sound human.
 */
function templateNarration(r: ReceiptRow, names: NameResolution): string {
  const when = timeWords(r.created_at);
  const amount = formatUsdc(r.amount_lamports);
  const merchant = names.merchant_label;
  const kind = r.receipt_kind ?? "x402_spend";

  const action: Record<string, string> = {
    x402_spend: `paid ${merchant} ${amount} USDC for an agent task`,
    direct_send: `sent ${amount} USDC to ${merchant}`,
    link_send: `funded a payment link for ${amount} USDC`,
    streaming_claim: `streamed ${amount} USDC to ${merchant}`,
    escrow_release: `released ${amount} USDC from escrow to ${merchant}`,
    escrow_dispute: `disputed an escrow and got ${amount} USDC refunded`,
    refund: `received a refund of ${amount} USDC`,
  };
  const verb = action[kind] ?? action.x402_spend!;

  if (r.decision === "DENY") {
    return `On ${when}, Settle blocked a ${amount} USDC payment to ${merchant} because ${denyReason(r.deny_code)}. The funds never moved — the on-chain policy caught it before the transfer.`;
  }

  if (r.decision === "REVIEW") {
    return `On ${when}, a ${amount} USDC payment to ${merchant} was flagged for review. Settle paused it before settlement so you could decide.`;
  }

  // ALLOW happy path
  const trustLine = r.pact_pubkey
    ? "An on-chain Pact authorized the spend without a per-payment signature from you."
    : r.card_pubkey
      ? "The on-chain AgentCard pre-authorized this category, so no extra signature was needed."
      : "You signed it directly.";

  const proofLine =
    "Every step is bound to the receipt's 4-hash commit chain — anyone can verify it from Solscan without trusting Settle.";

  return `On ${when}, you ${verb}. ${trustLine} ${proofLine}`;
}

async function tryNvidiaNim(prompt: string): Promise<string | null> {
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
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 280,
        messages: [
          {
            role: "system",
            content:
              "You are Settle's receipt narrator. Convert the receipt facts into a single warm paragraph (<= 90 words) that a real person would read about their own payment. No marketing language. No bullet points. No headers. Plain prose. Reference specific facts. Never invent details — stick to what's in the input.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim();
    return typeof text === "string" && text.length > 0 ? text : null;
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
        max_tokens: 320,
        system:
          "You are Settle's receipt narrator. Convert the receipt facts into a single warm paragraph (<= 90 words) that a real person would read about their own payment. No marketing language. No bullet points. No headers. Plain prose. Reference specific facts. Never invent details — stick to what's in the input.",
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = json.content?.[0]?.text?.trim();
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function buildPrompt(r: ReceiptRow, names: NameResolution): string {
  return JSON.stringify({
    when: r.created_at,
    decision: r.decision,
    deny_code: r.deny_code,
    deny_reason_human: r.decision === "DENY" ? denyReason(r.deny_code) : null,
    amount_usdc: formatUsdc(r.amount_lamports),
    merchant: names.merchant_label,
    sender: names.sender_label,
    merchant_is_handle: names.merchant_handle !== null,
    sender_is_handle: names.sender_handle !== null,
    kind: r.receipt_kind ?? "x402_spend",
    has_pact: r.pact_pubkey !== null,
    has_card: r.card_pubkey !== null,
    target_method: r.target_method,
    target_path: r.target_path,
    instruction:
      "Render a single-paragraph narration. <= 90 words. Plain English. Mention the date, what happened, who (use the @handle when provided, otherwise the short pubkey), the amount, and one note about how the cryptographic proof works. Do NOT add disclaimers or marketing language.",
  });
}

/**
 * Build a NameResolution from a pre-fetched handles array.
 * Splitting the SB call from the resolve logic keeps the types clean —
 * the SB filter builder's PromiseLike-not-Promise quirk fights generic
 * helper signatures, but a plain in-memory map is just data.
 */
function resolveNamesFrom(
  rawHandles: Array<{ pubkey: string; handle: string }>,
  r: ReceiptRow,
): NameResolution {
  const map = new Map<string, string>();
  for (const h of rawHandles) map.set(h.pubkey, h.handle);
  const merchantHandle = map.get(r.merchant_pubkey) ?? null;
  // The on-chain receipts table commits the agent card pubkey, not a separate sender.
  // The card pubkey is the closest stable identifier for "who paid".
  const senderPubkey = r.card_pubkey;
  const senderHandle = senderPubkey ? (map.get(senderPubkey) ?? null) : null;
  return {
    merchant_label: merchantHandle ? `@${merchantHandle}` : shortPubkey(r.merchant_pubkey),
    sender_label: senderPubkey
      ? senderHandle
        ? `@${senderHandle}`
        : shortPubkey(senderPubkey)
      : null,
    merchant_handle: merchantHandle,
    sender_handle: senderHandle,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
  }
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("receipts")
    .select(
      "request_id, card_pubkey, pact_pubkey, merchant_pubkey, amount_lamports, decision, deny_code, receipt_kind, target_method, target_path, decision_slot, policy_version, created_at, narration_text, narration_provider, narration_generated_at",
    )
    .eq("request_id", requestId)
    .maybeSingle<ReceiptRow>();

  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "receipt_not_found" }, { status: 404 });
  }

  // Cache hit: return immediately unless caller forced refresh.
  if (!refresh && data.narration_text) {
    return NextResponse.json({
      ok: true,
      narration: data.narration_text,
      provider: data.narration_provider,
      generated_at: data.narration_generated_at,
      cached: true,
    });
  }

  // Resolve handles before generating — turns "B4cA…to2Cp" into "@alice"
  // in the prompt + template fallback. Single batched read for both pubkeys.
  const pubkeysToResolve = [data.merchant_pubkey];
  if (data.card_pubkey && data.card_pubkey !== data.merchant_pubkey) {
    pubkeysToResolve.push(data.card_pubkey);
  }
  const { data: handlesData } = await sb
    .from("handles")
    .select("handle, pubkey")
    .in("pubkey", pubkeysToResolve);
  const names = resolveNamesFrom(
    (handlesData as Array<{ pubkey: string; handle: string }> | null) ?? [],
    data,
  );

  // Generate via the provider chain.
  const prompt = buildPrompt(data, names);
  let narration: string | null = null;
  let provider: "nvidia_nim" | "anthropic" | "template" = "template";

  narration = await tryNvidiaNim(prompt);
  if (narration) provider = "nvidia_nim";

  if (!narration) {
    narration = await tryAnthropic(prompt);
    if (narration) provider = "anthropic";
  }

  if (!narration) {
    narration = templateNarration(data, names);
    provider = "template";
  }

  // Cache. If the column doesn't exist yet (pre-migration-0020), the update
  // fails gracefully — we still return the freshly generated narration.
  const { error: upErr } = await sb
    .from("receipts")
    .update({
      narration_text: narration,
      narration_provider: provider,
      narration_generated_at: new Date().toISOString(),
    })
    .eq("request_id", requestId);
  const cacheStored = !upErr;

  return NextResponse.json({
    ok: true,
    narration,
    provider,
    generated_at: new Date().toISOString(),
    cached: false,
    cache_stored: cacheStored,
    ...(upErr ? { cache_error: upErr.message } : {}),
  });
}
