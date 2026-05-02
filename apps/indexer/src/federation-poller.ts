import type { SupabaseClient } from "@supabase/supabase-js";
import { signWebhookPayload } from "@settle/sdk";

/**
 * F9.3 + F5.6 — Federation poller + webhook fanout.
 *
 * Two concerns, one process:
 *
 *   1. WATERMARK: track the highest `imported_at` we've SEEN among
 *      verified rows, so the indexer log doesn't replay history on
 *      restart. Watermark is in-memory; small replay windows on
 *      restart are fine because downstream actions are idempotent.
 *
 *   2. DELIVERY: for each verified row whose
 *      webhook_delivery_status='pending', look up a merchant webhook
 *      URL (currently env-var-based, future: verified_merchants
 *      table), POST a Stripe-shaped envelope, and advance state. Same
 *      pattern as `webhook-worker.ts` for native receipts.
 *
 * Why two passes: the watermark advance and the delivery state machine
 * are decoupled. The watermark answers "have I LOGGED this?" while the
 * delivery state answers "have I FANNED this OUT?" — different
 * questions with different retry policies. Sharing them would make a
 * delivery retry replay the log, which is misleading.
 */

const POLL_INTERVAL_MS = 60_000;
const MAX_ATTEMPTS = 5;

interface FederatedRow {
  federated_id: string;
  origin_id: string;
  remote_request_id: string;
  sender_pubkey: string | null;
  recipient_pubkey: string | null;
  amount_lamports: string | null;
  asset: string | null;
  status: string;
  imported_at: string;
  payload_hash: string | null;
  webhook_delivery_status?: string;
  webhook_attempts?: number;
}

async function getMerchantWebhookUrl(
  supabase: SupabaseClient,
  pubkey: string | null,
): Promise<{ url: string; secret: string | null } | null> {
  if (!pubkey) return null;
  // AU-07-003 fix — symmetric with webhook-worker.ts: query
  // verified_merchants.webhook_url FIRST, then fall back to operator
  // env var. Previously this poller only checked the env, ignoring
  // the self-serve URL merchants set via /m/[handle]/webhook.
  try {
    const { data } = await supabase
      .from("verified_merchants")
      .select("webhook_url, webhook_signing_secret")
      .eq("pubkey", pubkey)
      .maybeSingle();
    if (data?.webhook_url) {
      return {
        url: data.webhook_url as string,
        secret: (data.webhook_signing_secret as string | null) ?? null,
      };
    }
  } catch {
    // fall through to env fallback
  }
  const truncated = pubkey.slice(0, 8).toUpperCase();
  const envUrl = process.env[`MERCHANT_WEBHOOK_URL_${truncated}`];
  if (envUrl) return { url: envUrl, secret: null };
  return null;
}

function signPayload(payload: string): string {
  const secret = process.env.SETTLE_WEBHOOK_SIGNING_SECRET;
  if (!secret) return "unsigned";
  return signWebhookPayload(payload, secret);
}

async function deliverWebhook(
  supabase: SupabaseClient,
  row: FederatedRow,
): Promise<{ delivered: boolean; reason?: string }> {
  // Recipient is the natural webhook target — they're the merchant
  // (or wallet) the federated tx was addressed to. If neither sender
  // nor recipient has a registered webhook, we mark the row 'na'.
  const target =
    (await getMerchantWebhookUrl(supabase, row.recipient_pubkey)) ??
    (await getMerchantWebhookUrl(supabase, row.sender_pubkey));
  if (!target) {
    await supabase
      .from("federated_receipts")
      .update({ webhook_delivery_status: "na" })
      .eq("federated_id", row.federated_id);
    return { delivered: false, reason: "no_webhook_configured" };
  }
  const url = target.url;

  const eventType = "federated.imported" as const;
  const payload = JSON.stringify({
    api_version: "settle.v1",
    id: `evt_fed_${row.federated_id}`,
    event_type: eventType,
    created: Math.floor(new Date(row.imported_at).getTime() / 1000),
    data: {
      object: "federated_receipt",
      federated_id: row.federated_id,
      origin_id: row.origin_id,
      remote_request_id: row.remote_request_id,
      sender_pubkey: row.sender_pubkey,
      recipient_pubkey: row.recipient_pubkey,
      amount_lamports: row.amount_lamports,
      asset: row.asset,
      payload_hash: row.payload_hash,
      // Provenance flag — consumers MUST treat this differently than a
      // native receipt, since the kernel commit chain doesn't apply.
      provenance: "federated_trusted",
      imported_at: row.imported_at,
    },
  });

  const signature = signPayload(payload);
  const attempts = (row.webhook_attempts ?? 0) + 1;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Settle-Signature": signature,
        "X-Settle-Federated-Id": row.federated_id,
        "X-Settle-Event-Type": eventType,
        "X-Settle-Api-Version": "settle.v1",
      },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    await supabase
      .from("federated_receipts")
      .update({
        webhook_delivery_status: "delivered",
        webhook_attempts: attempts,
        webhook_last_attempt_at: new Date().toISOString(),
      })
      .eq("federated_id", row.federated_id);
    return { delivered: true };
  } catch (e) {
    const finalStatus = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
    await supabase
      .from("federated_receipts")
      .update({
        webhook_delivery_status: finalStatus,
        webhook_attempts: attempts,
        webhook_last_attempt_at: new Date().toISOString(),
        webhook_last_error: String((e as Error).message ?? e),
      })
      .eq("federated_id", row.federated_id);
    return { delivered: false, reason: `${(e as Error).message} (attempts=${attempts})` };
  }
}

export function startFederationPoller(supabase: SupabaseClient) {
  let watermark: string | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      // PASS 1 — log new verified rows for observability + advance watermark.
      let logQ = supabase
        .from("federated_receipts")
        .select(
          "federated_id, origin_id, remote_request_id, sender_pubkey, recipient_pubkey, amount_lamports, asset, status, imported_at, payload_hash",
        )
        .eq("status", "verified")
        .order("imported_at", { ascending: true })
        .limit(50);
      if (watermark) logQ = logQ.gt("imported_at", watermark);

      const { data: newRows, error: logErr } = await logQ;
      if (logErr) {
        console.warn(`[fed-poller] log query failed: ${logErr.message}`);
      } else {
        for (const row of (newRows as FederatedRow[] | null) ?? []) {
          console.log(
            `[fed-poller] verified federated receipt: origin=${row.origin_id} remote=${row.remote_request_id.slice(0, 16)}… amount=${row.amount_lamports} asset=${row.asset}`,
          );
          watermark = row.imported_at;
        }
      }

      // PASS 2 — drain pending webhook deliveries (independent of watermark).
      // We pull all pending verified rows up to a batch limit; a row may have
      // been logged on a previous tick but not yet delivered. The retry logic
      // in deliverWebhook caps per-row attempts at MAX_ATTEMPTS.
      const { data: pendingRows, error: pendErr } = await supabase
        .from("federated_receipts")
        .select(
          "federated_id, origin_id, remote_request_id, sender_pubkey, recipient_pubkey, amount_lamports, asset, status, imported_at, payload_hash, webhook_delivery_status, webhook_attempts",
        )
        .eq("status", "verified")
        .eq("webhook_delivery_status", "pending")
        .order("imported_at", { ascending: true })
        .limit(20);
      if (pendErr) {
        console.warn(`[fed-poller] pending query failed: ${pendErr.message}`);
      } else {
        let delivered = 0;
        let failed = 0;
        for (const row of (pendingRows as FederatedRow[] | null) ?? []) {
          const r = await deliverWebhook(supabase, row);
          if (r.delivered) delivered += 1;
          else failed += 1;
        }
        if (delivered + failed > 0) {
          console.log(
            `[fed-poller] webhook fanout: delivered=${delivered} failed=${failed}`,
          );
        }
      }
    } finally {
      running = false;
    }
  }

  // Initialize watermark to current max so we don't replay history on first start.
  void supabase
    .from("federated_receipts")
    .select("imported_at")
    .eq("status", "verified")
    .order("imported_at", { ascending: false })
    .limit(1)
    .then(({ data }) => {
      const rows = (data as Array<{ imported_at: string }> | null) ?? [];
      if (rows.length > 0) {
        watermark = rows[0]!.imported_at;
        console.log(`[fed-poller] watermark initialized to ${watermark}`);
      } else {
        console.log("[fed-poller] no verified federated receipts yet — watermark=null");
      }
      // Begin polling AFTER we know the watermark.
      interval = setInterval(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    });

  return {
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  };
}
