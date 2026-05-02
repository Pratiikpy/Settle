import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signWebhookPayload } from "@settle/sdk";

/**
 * Webhook delivery worker — runs in the same process as the indexer.
 *
 * Responsibilities:
 *   1. Poll `receipts` table where `webhook_delivery_status = 'pending'` and merchant has a
 *      registered webhook URL.
 *   2. POST the receipt JSON to the webhook with HMAC-SHA256 signature for verification.
 *   3. On success → mark `delivered`. On failure → increment `webhook_attempts` + back off.
 *      After 5 attempts → mark `failed`.
 *
 * Webhook URL lookup: from `verified_merchants.webhook_url` column (added in V2 migration).
 * For V1 we use a hardcoded merchant→URL map from env vars to keep things shippable.
 *
 * Signing: HMAC-SHA256 over the canonical JSON body using SETTLE_WEBHOOK_SIGNING_SECRET.
 * Merchants verify by recomputing HMAC + comparing the X-Settle-Signature header.
 */

const POLL_INTERVAL_MS = 30_000; // 30s
const MAX_ATTEMPTS = 5;

interface PendingReceipt {
  request_id: string;
  card_pubkey: string;
  pact_pubkey: string | null;
  merchant_pubkey: string;
  amount_lamports: string;
  decision: "ALLOW" | "DENY" | "REVIEW";
  receipt_hash: string;
  reason_hash: string;
  policy_snapshot_hash: string;
  sig_solscan: string | null;
  webhook_attempts: number;
  created_at: string;
  // F2.0 — receipt kind, used to derive Stripe-shaped event_type below.
  receipt_kind: string | null;
  refund_emoji?: string | null;
}

/**
 * F5.6 — Map an indexed receipt to a Stripe-shaped event name.
 *
 * Vocabulary (versioned by major number; v1 today):
 *   receipt.allowed       — payment succeeded
 *   receipt.denied        — on-chain DENY
 *   receipt.refunded      — refund kind specifically
 *   receipt.imported      — third-party tx mirrored into Settle (kind = direct_send + import_source set)
 *   pact.opened           — first time we see receipts under a new pact
 *   pact.closed           — pact closure (N/A from receipts directly; surfaced via separate event in indexer's pact handlers)
 *   pact.disputed         — escrow_dispute kind
 *
 * Returning null = "no Stripe-shape mapping; deliver as raw 'receipt' event."
 * The webhook payload always includes the original kind too, so consumers
 * who want fine-grained types still get them.
 */
function eventTypeFor(r: PendingReceipt): string {
  if (r.decision === "DENY") return "receipt.denied";
  const kind = r.receipt_kind ?? "x402_spend";
  if (kind === "refund") return "receipt.refunded";
  if (kind === "escrow_dispute") return "pact.disputed";
  // x402_spend, direct_send, link_send, streaming_claim, escrow_release
  // all collapse to "receipt.allowed" — the kind is in the payload for
  // anyone who wants finer detail.
  return "receipt.allowed";
}

/**
 * C104 — webhook URL lookup. Two-tier:
 *   1. verified_merchants.webhook_url (self-serve, set via /api/merchants/[handle]/webhook)
 *   2. MERCHANT_WEBHOOK_URL_<TRUNCATED_PUBKEY> env var (operator-only fallback)
 *
 * Same fall-through for the signing secret: per-merchant secret first,
 * global SETTLE_WEBHOOK_SIGNING_SECRET as fallback. Per-merchant secrets
 * isolate cross-merchant verification leakage.
 */
async function getMerchantWebhookConfig(
  supabase: SupabaseClient,
  merchantPubkey: string,
): Promise<{ url: string; signingSecret: string | null } | null> {
  // 1. self-serve lookup
  const { data } = await supabase
    .from("verified_merchants")
    .select("webhook_url, webhook_signing_secret")
    .eq("merchant_pubkey", merchantPubkey)
    .maybeSingle();
  if (data?.webhook_url) {
    return {
      url: data.webhook_url as string,
      signingSecret:
        (data.webhook_signing_secret as string | null) ??
        process.env.SETTLE_WEBHOOK_SIGNING_SECRET ??
        null,
    };
  }

  // 2. env-var fallback (V1 demo merchants)
  const truncated = merchantPubkey.slice(0, 8).toUpperCase();
  const envUrl = process.env[`MERCHANT_WEBHOOK_URL_${truncated}`];
  if (!envUrl) return null;
  return {
    url: envUrl,
    signingSecret: process.env.SETTLE_WEBHOOK_SIGNING_SECRET ?? null,
  };
}

function signPayload(payload: string, secret: string | null): string {
  if (!secret) return "unsigned";
  return signWebhookPayload(payload, secret);
}

function stripBytea(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.startsWith("\\x") ? v.slice(2) : v;
}

async function deliverOne(
  supabase: SupabaseClient,
  receipt: PendingReceipt,
): Promise<{ delivered: boolean; reason?: string }> {
  const cfg = await getMerchantWebhookConfig(supabase, receipt.merchant_pubkey);
  if (!cfg) {
    // No webhook configured for this merchant — mark "na" so we don't keep polling.
    await supabase
      .from("receipts")
      .update({ webhook_delivery_status: "na" })
      .eq("request_id", receipt.request_id);
    return { delivered: false, reason: "no_webhook_configured" };
  }
  const { url, signingSecret } = cfg;

  // F5.6 — Stripe-shaped envelope. Top level: api_version + event_type +
  // created + data. Consumers can route on `event_type`; raw fields live
  // in `data` so anyone who wants the full receipt still has it.
  const eventType = eventTypeFor(receipt);
  const payload = JSON.stringify({
    api_version: "settle.v1",
    id: `evt_${receipt.request_id}`,
    event_type: eventType,
    created: Math.floor(new Date(receipt.created_at).getTime() / 1000),
    data: {
      object: "receipt",
      request_id: receipt.request_id,
      kind: receipt.receipt_kind ?? "x402_spend",
      card_pubkey: receipt.card_pubkey,
      pact_pubkey: receipt.pact_pubkey,
      merchant_pubkey: receipt.merchant_pubkey,
      amount_lamports: receipt.amount_lamports,
      decision: receipt.decision,
      hashes: {
        receipt_hash: stripBytea(receipt.receipt_hash),
        reason_hash: stripBytea(receipt.reason_hash),
        policy_snapshot_hash: stripBytea(receipt.policy_snapshot_hash),
      },
      sig_solscan: receipt.sig_solscan,
      created_at: receipt.created_at,
    },
  });

  const signature = signPayload(payload, signingSecret);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Settle-Signature": signature,
        "X-Settle-Request-Id": receipt.request_id,
        "X-Settle-Event-Type": eventType,
        "X-Settle-Api-Version": "settle.v1",
      },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      await supabase
        .from("receipts")
        .update({
          webhook_delivery_status: "delivered",
          webhook_attempts: receipt.webhook_attempts + 1,
        })
        .eq("request_id", receipt.request_id);
      // C104 — also stamp last_delivered_at on the merchant row so the
      // merchant dashboard can show "last working" without scanning
      // receipts. Best-effort: env-var-only merchants don't have a
      // verified_merchants row, so this UPDATE matches 0 rows.
      await supabase
        .from("verified_merchants")
        .update({ webhook_last_delivered_at: new Date().toISOString() })
        .eq("merchant_pubkey", receipt.merchant_pubkey);
      return { delivered: true };
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    const newAttempts = receipt.webhook_attempts + 1;
    const finalStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";

    await supabase
      .from("receipts")
      .update({
        webhook_delivery_status: finalStatus,
        webhook_attempts: newAttempts,
      })
      .eq("request_id", receipt.request_id);

    // C104 — stamp last_attempt_at + last_error so the merchant
    // dashboard can show "last attempt failed: HTTP 502" without
    // scanning receipts.
    await supabase
      .from("verified_merchants")
      .update({
        webhook_last_attempt_at: new Date().toISOString(),
        webhook_last_error: (e as Error).message,
      })
      .eq("merchant_pubkey", receipt.merchant_pubkey);

    return { delivered: false, reason: `${(e as Error).message} (attempts=${newAttempts})` };
  }
}

export async function pollAndDeliver(supabase: SupabaseClient): Promise<{
  pulled: number;
  delivered: number;
  failed: number;
}> {
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "request_id, card_pubkey, pact_pubkey, merchant_pubkey, amount_lamports, decision, receipt_hash, reason_hash, policy_snapshot_hash, sig_solscan, webhook_attempts, created_at, receipt_kind, refund_emoji",
    )
    .eq("webhook_delivery_status", "pending")
    .lt("webhook_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error || !data) {
    console.warn("[webhook-worker] poll error:", error?.message);
    return { pulled: 0, delivered: 0, failed: 0 };
  }

  let delivered = 0;
  let failed = 0;
  for (const r of data as PendingReceipt[]) {
    const result = await deliverOne(supabase, r);
    if (result.delivered) delivered++;
    else if (r.webhook_attempts + 1 >= MAX_ATTEMPTS) failed++;
  }

  return { pulled: data.length, delivered, failed };
}

export function startWebhookWorker(supabase: SupabaseClient): { stop: () => void } {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function tick() {
    if (stopped) return;
    const result = await pollAndDeliver(supabase);
    if (result.pulled > 0) {
      console.log(
        `[webhook-worker] pulled=${result.pulled} delivered=${result.delivered} failed=${result.failed}`,
      );
    }
    if (!stopped) timer = setTimeout(tick, POLL_INTERVAL_MS);
  }

  void tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

// Standalone CLI mode: `pnpm --filter @settle/indexer tsx src/webhook-worker.ts`
if (import.meta.url.endsWith(process.argv[1] ?? "")) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  console.log(`[webhook-worker] starting · poll every ${POLL_INTERVAL_MS}ms`);
  startWebhookWorker(supabase);
}
