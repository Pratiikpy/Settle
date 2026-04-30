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
}

function getMerchantWebhookUrl(merchantPubkey: string): string | null {
  // V1: lookup via env var like MERCHANT_WEBHOOK_URL_<TRUNCATED_PUBKEY>
  // V2: query verified_merchants.webhook_url
  const truncated = merchantPubkey.slice(0, 8).toUpperCase();
  const envVar = `MERCHANT_WEBHOOK_URL_${truncated}`;
  return process.env[envVar] ?? null;
}

function signPayload(payload: string): string {
  const secret = process.env.SETTLE_WEBHOOK_SIGNING_SECRET;
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
  const url = getMerchantWebhookUrl(receipt.merchant_pubkey);
  if (!url) {
    // No webhook configured for this merchant — mark "na" so we don't keep polling.
    await supabase
      .from("receipts")
      .update({ webhook_delivery_status: "na" })
      .eq("request_id", receipt.request_id);
    return { delivered: false, reason: "no_webhook_configured" };
  }

  const payload = JSON.stringify({
    request_id: receipt.request_id,
    card_pubkey: receipt.card_pubkey,
    pact_pubkey: receipt.pact_pubkey,
    merchant_pubkey: receipt.merchant_pubkey,
    amount_lamports: receipt.amount_lamports,
    decision: receipt.decision,
    receipt_hash: stripBytea(receipt.receipt_hash),
    reason_hash: stripBytea(receipt.reason_hash),
    policy_snapshot_hash: stripBytea(receipt.policy_snapshot_hash),
    sig_solscan: receipt.sig_solscan,
    created_at: receipt.created_at,
  });

  const signature = signPayload(payload);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Settle-Signature": signature,
        "X-Settle-Request-Id": receipt.request_id,
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
      "request_id, card_pubkey, pact_pubkey, merchant_pubkey, amount_lamports, decision, receipt_hash, reason_hash, policy_snapshot_hash, sig_solscan, webhook_attempts, created_at",
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
