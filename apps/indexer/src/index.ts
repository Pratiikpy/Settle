/**
 * Settle Indexer — subscribes to events from the settle-agent-card program and writes
 * decoded rows to Supabase. The frontend `/activity` page consumes via Supabase Realtime
 * (channel: `policy_decisions`).
 *
 * Discriminator-filtered event decoding: every "Program data: <base64>" log carries an
 * 8-byte Anchor event discriminator (`sha256("event:<EventName>")[..8]`). We compute
 * those discriminators up-front and switch on the prefix — so a future event type can't
 * be mis-decoded as PolicyDecisionEvent.
 *
 * Run:
 *   pnpm --filter @settle/indexer dev
 *
 * Env required:
 *   - HELIUS_API_KEY (or RPC_URL with WS support)
 *   - SETTLE_PROGRAM_ID
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - SETTLE_CLUSTER (devnet | mainnet)
 */

import { Connection, PublicKey, type Logs } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { sha256 } from "@noble/hashes/sha2";
import bs58 from "bs58";
import { startWebhookWorker } from "./webhook-worker.js";

config();

const PLACEHOLDER = "SettLe1111111111111111111111111111111111111";
const programIdRaw = process.env.SETTLE_PROGRAM_ID;
if (!programIdRaw || programIdRaw === PLACEHOLDER) {
  console.error(
    "[indexer] SETTLE_PROGRAM_ID is not set or is still the placeholder. " +
      "Run `pnpm deploy:devnet` first.",
  );
  process.exit(1);
}
const PROGRAM_ID = new PublicKey(programIdRaw);

const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
const heliusKey = process.env.HELIUS_API_KEY;
if (!heliusKey) {
  console.warn("[indexer] HELIUS_API_KEY not set — falling back to public RPC");
}

const wsEndpoint = heliusKey
  ? `wss://${cluster}.helius-rpc.com/?api-key=${heliusKey}`
  : `wss://api.${cluster}.solana.com`;

const httpEndpoint = heliusKey
  ? `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`
  : `https://api.${cluster}.solana.com`;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("[indexer] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const connection = new Connection(httpEndpoint, {
  commitment: "confirmed",
  wsEndpoint,
});

// ─────────────────────────────────────────────────────────────────────────────
// Anchor event discriminators — sha256("event:<EventName>")[..8]
// ─────────────────────────────────────────────────────────────────────────────

function eventDiscriminator(name: string): Buffer {
  return Buffer.from(sha256(new TextEncoder().encode(`event:${name}`))).subarray(0, 8);
}

const DISC_POLICY_DECISION = eventDiscriminator("PolicyDecisionEvent");
const DISC_CARD_CREATED = eventDiscriminator("CardCreatedEvent");
const DISC_CARD_REVOKED = eventDiscriminator("CardRevokedEvent");
const DISC_PACT_OPENED = eventDiscriminator("PactOpenedEvent");
const DISC_PACT_CLOSED = eventDiscriminator("PactClosedEvent");
const DISC_PACT_SPEND = eventDiscriminator("PactSpendEvent");
// v0.3 — Streaming Pact (P1)
const DISC_STREAM_OPENED = eventDiscriminator("StreamingPactOpenedEvent");
const DISC_STREAM_CLAIM = eventDiscriminator("PactStreamClaimEvent");
const DISC_STREAM_PAUSE = eventDiscriminator("PactStreamPauseEvent");
// v0.3 — Delivery Escrow Pact (P9)
const DISC_ESCROW_OPENED = eventDiscriminator("DeliveryEscrowOpenedEvent");
const DISC_ESCROW_RELEASED = eventDiscriminator("DeliveryEscrowReleasedEvent");
const DISC_ESCROW_DISPUTED = eventDiscriminator("DeliveryEscrowDisputedEvent");

console.log(`[indexer] Subscribing to ${PROGRAM_ID.toBase58()} on ${cluster}`);
console.log(`[indexer] WS: ${wsEndpoint.replace(/api-key=[^&]+/, "api-key=***")}`);

connection.onLogs(
  PROGRAM_ID,
  async (logs: Logs) => {
    if (logs.err) return;
    const eventLogs = logs.logs.filter((l) => l.startsWith("Program data: "));
    if (eventLogs.length === 0) return;

    for (const evLog of eventLogs) {
      const base64 = evLog.replace("Program data: ", "");
      let bytes: Buffer;
      try {
        bytes = Buffer.from(base64, "base64");
      } catch {
        continue;
      }
      if (bytes.length < 8) continue;

      const disc = bytes.subarray(0, 8);
      const data = bytes.subarray(8);

      if (disc.equals(DISC_POLICY_DECISION)) {
        await handlePolicyDecision(data, logs.signature);
      } else if (disc.equals(DISC_PACT_OPENED)) {
        handlePactOpened(data, logs.signature);
      } else if (disc.equals(DISC_PACT_CLOSED)) {
        handlePactClosed(data, logs.signature);
      } else if (disc.equals(DISC_PACT_SPEND)) {
        handlePactSpend(data, logs.signature);
      } else if (disc.equals(DISC_STREAM_OPENED)) {
        handleStreamOpened(data, logs.signature);
      } else if (disc.equals(DISC_STREAM_CLAIM)) {
        handleStreamClaim(data, logs.signature);
      } else if (disc.equals(DISC_STREAM_PAUSE)) {
        handleStreamPause(data, logs.signature);
      } else if (disc.equals(DISC_ESCROW_OPENED)) {
        handleEscrowOpened(data, logs.signature);
      } else if (disc.equals(DISC_ESCROW_RELEASED)) {
        handleEscrowReleased(data, logs.signature);
      } else if (disc.equals(DISC_ESCROW_DISPUTED)) {
        handleEscrowDisputed(data, logs.signature);
      } else if (disc.equals(DISC_CARD_CREATED)) {
        await handleCardCreated(data, logs.signature);
      } else if (disc.equals(DISC_CARD_REVOKED)) {
        handleCardRevoked(data, logs.signature);
      } else {
        console.log(
          `[indexer] unknown event disc=${disc.toString("hex")} sig=${logs.signature.slice(0, 8)}…`,
        );
      }
    }
  },
  "confirmed",
);

// ─────────────────────────────────────────────────────────────────────────────
// PolicyDecisionEvent → policy_decisions table
//   layout: card(32) merchant(32) decision(u8) deny_code(u8) amount(u64)
//           receipt_hash(32) reason_hash(32) policy_snapshot_hash(32)
//           slot(u64) policy_version(u32) pact(32)
//   total: 214 bytes
// ─────────────────────────────────────────────────────────────────────────────

async function handlePolicyDecision(data: Buffer, signature: string) {
  if (data.length < 214) {
    console.warn(`[indexer] PolicyDecisionEvent: short data (${data.length}b)`);
    return;
  }
  let off = 0;
  const card = bs58.encode(data.subarray(off, off + 32));
  off += 32;
  const merchant = bs58.encode(data.subarray(off, off + 32));
  off += 32;
  const decision = data.readUInt8(off);
  off += 1;
  const deny_code = data.readUInt8(off);
  off += 1;
  const amount = data.readBigUInt64LE(off);
  off += 8;
  const receipt_hash = data.subarray(off, off + 32).toString("hex");
  off += 32;
  const reason_hash = data.subarray(off, off + 32).toString("hex");
  off += 32;
  const policy_snapshot_hash = data.subarray(off, off + 32).toString("hex");
  off += 32;
  const slot = data.readBigUInt64LE(off);
  off += 8;
  const policy_version = data.readUInt32LE(off);
  off += 4;
  const pactRaw = data.subarray(off, off + 32);
  const isDefault = pactRaw.every((b) => b === 0);
  const pact = isDefault ? null : bs58.encode(pactRaw);

  const decisionLabel = decision === 0 ? "ALLOW" : decision === 1 ? "DENY" : "REVOKE";

  const { error } = await supabase.from("policy_decisions").insert({
    card_pubkey: card,
    merchant_pubkey: merchant === "11111111111111111111111111111111" ? null : merchant,
    pact_pubkey: pact,
    decision: decisionLabel,
    deny_code: deny_code === 0 ? null : deny_code,
    amount_lamports: amount.toString(),
    receipt_hash: `\\x${receipt_hash}`,
    reason_hash: `\\x${reason_hash}`,
    policy_snapshot_hash: `\\x${policy_snapshot_hash}`,
    slot: Number(slot),
    sig_solscan: signature,
    policy_version,
  });

  if (error) {
    console.error("[indexer] supabase insert error:", error.message);
  } else {
    console.log(
      `[indexer] ${decisionLabel} ${card.slice(0, 6)}… ${amount} ${decisionLabel === "DENY" ? `(deny=${deny_code})` : ""}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PactOpenedEvent / PactClosedEvent / PactSpendEvent — log + best-effort sync
// ─────────────────────────────────────────────────────────────────────────────

function handlePactOpened(data: Buffer, signature: string) {
  // layout: pact(32) parent_card(32) vault(32) cap(u64) funded_amount(u64) expiry_slot(u64) allowlist_count(u8)
  if (data.length < 32 + 32 + 32 + 8 + 8 + 8 + 1) return;
  const pact = bs58.encode(data.subarray(0, 32));
  const parent = bs58.encode(data.subarray(32, 64));
  const vault = bs58.encode(data.subarray(64, 96));
  const cap = data.readBigUInt64LE(96);
  const funded = data.readBigUInt64LE(104);
  console.log(
    `[indexer] PactOpened pact=${pact.slice(0, 6)}… parent=${parent.slice(0, 6)}… vault=${vault.slice(0, 6)}… cap=${cap} funded=${funded} sig=${signature.slice(0, 8)}…`,
  );
  // Best-effort sync to pacts table (full row populated by /api/agents/spawn caller; this
  // is a backstop for direct on-chain calls)
  void supabase
    .from("pacts")
    .upsert(
      {
        pact_pubkey: pact,
        parent_card: parent,
        scope_label: "",
        scope_label_hash: "\\x" + "00".repeat(32),
        cap_lamports: cap.toString(),
        spent: "0",
        expiry_slot: data.readBigUInt64LE(112).toString(),
        closed: false,
      },
      { onConflict: "pact_pubkey", ignoreDuplicates: true },
    )
    .then(({ error }) => {
      if (error) console.warn("[indexer] pact upsert (open) failed:", error.message);
    });
}

function handlePactClosed(data: Buffer, signature: string) {
  // layout: pact(32) parent_card(32) spent(u64) refund_amount(u64) slot(u64)
  if (data.length < 32 + 32 + 8 + 8 + 8) return;
  const pact = bs58.encode(data.subarray(0, 32));
  const spent = data.readBigUInt64LE(64);
  const refund = data.readBigUInt64LE(72);
  console.log(
    `[indexer] PactClosed pact=${pact.slice(0, 6)}… spent=${spent} refund=${refund} sig=${signature.slice(0, 8)}…`,
  );
  void supabase
    .from("pacts")
    .update({ closed: true, spent: spent.toString() })
    .eq("pact_pubkey", pact)
    .then(({ error }) => {
      if (error) console.warn("[indexer] pact update (close) failed:", error.message);
    });
}

function handlePactSpend(data: Buffer, signature: string) {
  // layout: pact(32) card(32) merchant(32) amount(u64) spent_after(u64) cap_remaining_after(u64) slot(u64)
  if (data.length < 32 + 32 + 32 + 8 + 8 + 8 + 8) return;
  const pact = bs58.encode(data.subarray(0, 32));
  const amount = data.readBigUInt64LE(96);
  const spentAfter = data.readBigUInt64LE(104);
  console.log(
    `[indexer] PactSpend pact=${pact.slice(0, 6)}… +${amount} (spent_after=${spentAfter}) sig=${signature.slice(0, 8)}…`,
  );
  void supabase
    .from("pacts")
    .update({ spent: spentAfter.toString() })
    .eq("pact_pubkey", pact)
    .then(({ error }) => {
      if (error) console.warn("[indexer] pact update (spend) failed:", error.message);
    });
}

/**
 * CardRevokedEvent layout:
 *   card(32) authority(32) policy_version(u32) slot(u64)
 * total: 32 + 32 + 4 + 8 = 76 bytes
 *
 * Persists revoked=true + bumps policy_version on the agent_cards row. The
 * /cards page subscribes to Realtime UPDATEs on this row to drive the
 * killchain animation (every Pact under the card freezes when revoked
 * transitions false → true).
 */
/**
 * CardCreatedEvent layout (Borsh, little-endian):
 *   card(32) authority(32) agent_pubkey(32) usdc_mint(32)
 *   daily_cap(u64) per_call_max(u64) allowlist_count(u8)
 *   expiry_slot(u64) policy_version(u32)
 * total: 32*4 + 8*2 + 1 + 8 + 4 = 157 bytes
 *
 * Without this handler the agent_cards table never sees newly-created cards —
 * compress-cron can't resolve buyer authority, /api/cards/list returns empty
 * for fresh wallets, and the entire F4 reputation flow is starved. Critical.
 */
async function handleCardCreated(data: Buffer, signature: string) {
  if (data.length < 157) {
    console.warn(`[indexer] CardCreatedEvent: short data (${data.length}b, need 157)`);
    return;
  }
  let off = 0;
  const card = bs58.encode(data.subarray(off, off + 32));
  off += 32;
  const authority = bs58.encode(data.subarray(off, off + 32));
  off += 32;
  const agentPubkey = bs58.encode(data.subarray(off, off + 32));
  off += 32;
  const usdcMint = bs58.encode(data.subarray(off, off + 32));
  off += 32;
  const dailyCap = data.readBigUInt64LE(off);
  off += 8;
  const perCallMax = data.readBigUInt64LE(off);
  off += 8;
  const allowlistCount = data.readUInt8(off);
  off += 1;
  const expirySlot = data.readBigUInt64LE(off);
  off += 8;
  const policyVersion = data.readUInt32LE(off);

  console.log(
    `[indexer] CardCreated card=${card.slice(0, 6)}… authority=${authority.slice(0, 6)}… cap=${dailyCap} expiry=${expirySlot} sig=${signature.slice(0, 8)}…`,
  );

  // Note: agent_cards has no `allowlist_count` column; the count is implicit
  // in the `agent_card_allowlist` rows. We log the count here and write it to
  // the join table separately if/when the program emits per-merchant rows.
  void allowlistCount;
  const { error } = await supabase.from("agent_cards").upsert(
    {
      card_pubkey: card,
      authority_pubkey: authority,
      agent_pubkey: agentPubkey,
      daily_cap_lamports: dailyCap.toString(),
      per_call_max_lamports: perCallMax.toString(),
      expiry_slot: expirySlot.toString(),
      policy_version: policyVersion,
      revoked: false,
      label: "",
      label_hash: "\\x" + "00".repeat(32),
      used_today: 0,
      last_reset_slot: 0,
    },
    { onConflict: "card_pubkey", ignoreDuplicates: true },
  );

  if (error) {
    console.error(
      `[indexer] CRITICAL: agent_cards upsert failed for ${card.slice(0, 8)}…: ${error.message}. /api/cards/list will not show this card; compress-cron will skip its receipts.`,
    );
  }
}

function handleCardRevoked(data: Buffer, signature: string) {
  if (data.length < 76) return;
  const card = bs58.encode(data.subarray(0, 32));
  const policyVersion = data.readUInt32LE(64);
  const slot = data.readBigUInt64LE(68);
  console.log(
    `[indexer] CardRevoked card=${card.slice(0, 6)}… policy_version=${policyVersion} slot=${slot} sig=${signature.slice(0, 8)}…`,
  );
  void supabase
    .from("agent_cards")
    .update({
      revoked: true,
      policy_version: policyVersion,
    })
    .eq("card_pubkey", card)
    .then(({ error }) => {
      if (error) console.warn("[indexer] card revoke update failed:", error.message);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming Pact events (P1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StreamingPactOpenedEvent layout (Borsh, little-endian):
 *   pact(32) parent_card(32) vault(32)
 *   rate_lamports_per_slot(u64) max_total_lamports(u64) funded_amount(u64)
 *   opened_slot(u64) expiry_slot(u64) allowlist_count(u8)
 * total: 32*3 + 8*5 + 1 = 137 bytes
 */
function handleStreamOpened(data: Buffer, signature: string) {
  if (data.length < 137) return;
  const pact = bs58.encode(data.subarray(0, 32));
  const parent = bs58.encode(data.subarray(32, 64));
  const rate = data.readBigUInt64LE(96);
  const maxTotal = data.readBigUInt64LE(104);
  const openedSlot = data.readBigUInt64LE(120);
  const expirySlot = data.readBigUInt64LE(128);
  console.log(
    `[indexer] StreamOpened pact=${pact.slice(0, 6)}… rate=${rate}/slot max=${maxTotal} sig=${signature.slice(0, 8)}…`,
  );
  void supabase
    .from("pacts")
    .upsert(
      {
        pact_pubkey: pact,
        parent_card: parent,
        scope_label: "",
        scope_label_hash: "\\x" + "00".repeat(32),
        mode: "streaming",
        rate_lamports_per_slot: rate.toString(),
        max_total_lamports: maxTotal.toString(),
        claimed: "0",
        last_claim_slot: openedSlot.toString(),
        paused: false,
        pause_started_slot: null,
        pause_accumulated_slots: "0",
        expiry_slot: expirySlot.toString(),
        closed: false,
      },
      { onConflict: "pact_pubkey", ignoreDuplicates: true },
    )
    .then(({ error }) => {
      if (error) console.warn("[indexer] stream upsert (open) failed:", error.message);
    });
}

/**
 * PactStreamClaimEvent layout:
 *   pact(32) card(32) merchant(32) amount(u64) billable_slots(u64)
 *   claimed_after(u64) max_remaining_after(u64) slot(u64)
 * total: 32*3 + 8*5 = 136 bytes
 *
 * Field offsets:
 *   pact:                0
 *   card:                32
 *   merchant:            64
 *   amount:              96
 *   billable_slots:      104
 *   claimed_after:       112
 *   max_remaining_after: 120
 *   slot:                128
 */
function handleStreamClaim(data: Buffer, signature: string) {
  if (data.length < 136) return;
  const pact = bs58.encode(data.subarray(0, 32));
  const amount = data.readBigUInt64LE(96);
  const claimedAfter = data.readBigUInt64LE(112);
  const slot = data.readBigUInt64LE(128);
  console.log(
    `[indexer] StreamClaim pact=${pact.slice(0, 6)}… +${amount} (claimed=${claimedAfter}) sig=${signature.slice(0, 8)}…`,
  );
  void supabase
    .from("pacts")
    .update({
      claimed: claimedAfter.toString(),
      last_claim_slot: slot.toString(),
      pause_accumulated_slots: "0",
    })
    .eq("pact_pubkey", pact)
    .then(({ error }) => {
      if (error) console.warn("[indexer] stream update (claim) failed:", error.message);
    });
}

/**
 * PactStreamPauseEvent layout: pact(32) paused(u8) slot(u64)
 * total: 41 bytes
 */
function handleStreamPause(data: Buffer, signature: string) {
  if (data.length < 41) return;
  const pact = bs58.encode(data.subarray(0, 32));
  const paused = data.readUInt8(32) !== 0;
  const slot = data.readBigUInt64LE(33);
  console.log(
    `[indexer] StreamPause pact=${pact.slice(0, 6)}… paused=${paused} sig=${signature.slice(0, 8)}…`,
  );
  void supabase
    .from("pacts")
    .update({
      paused,
      pause_started_slot: paused ? slot.toString() : null,
    })
    .eq("pact_pubkey", pact)
    .then(({ error }) => {
      if (error) console.warn("[indexer] stream update (pause) failed:", error.message);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Delivery Escrow events (P9)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DeliveryEscrowOpenedEvent layout:
 *   pact(32) parent_card(32) vault(32) merchant(32) capability_hash(32)
 *   amount(u64) confirm_deadline_slot(u64) dispute_deadline_slot(u64) opened_slot(u64)
 * total: 192 bytes
 */
function handleEscrowOpened(data: Buffer, signature: string) {
  if (data.length < 192) return;
  const pact = bs58.encode(data.subarray(0, 32));
  const parent = bs58.encode(data.subarray(32, 64));
  const merchant = bs58.encode(data.subarray(96, 128));
  const capabilityHashHex = data.subarray(128, 160).toString("hex");
  const amount = data.readBigUInt64LE(160);
  const confirmDl = data.readBigUInt64LE(168);
  const disputeDl = data.readBigUInt64LE(176);
  console.log(
    `[indexer] EscrowOpened pact=${pact.slice(0, 6)}… merchant=${merchant.slice(0, 6)}… amount=${amount} sig=${signature.slice(0, 8)}…`,
  );
  void supabase
    .from("pacts")
    .upsert(
      {
        pact_pubkey: pact,
        parent_card: parent,
        scope_label: "",
        scope_label_hash: "\\x" + "00".repeat(32),
        mode: "delivery_escrow",
        escrow_amount: amount.toString(),
        escrow_merchant_pubkey: merchant,
        escrow_capability_hash: `\\x${capabilityHashHex}`,
        confirm_deadline_slot: confirmDl.toString(),
        dispute_deadline_slot: disputeDl.toString(),
        released: false,
        refunded: false,
        // We don't have the on-chain pact's expiry_slot in this event; use dispute_dl
        // as a conservative upper bound (close_pact path doesn't apply to escrow anyway).
        expiry_slot: disputeDl.toString(),
        closed: false,
      },
      { onConflict: "pact_pubkey", ignoreDuplicates: true },
    )
    .then(({ error }) => {
      if (error) console.warn("[indexer] escrow upsert (open) failed:", error.message);
    });
}

/**
 * DeliveryEscrowReleasedEvent layout:
 *   pact(32) merchant(32) caller(32) is_buyer_confirmed(u8) amount(u64) slot(u64)
 * total: 113 bytes
 */
function handleEscrowReleased(data: Buffer, signature: string) {
  if (data.length < 113) return;
  const pact = bs58.encode(data.subarray(0, 32));
  const caller = bs58.encode(data.subarray(64, 96));
  const isBuyerConfirmed = data.readUInt8(96) !== 0;
  const amount = data.readBigUInt64LE(97);
  console.log(
    `[indexer] EscrowReleased pact=${pact.slice(0, 6)}… caller=${caller.slice(0, 6)}… buyer=${isBuyerConfirmed} amount=${amount} sig=${signature.slice(0, 8)}…`,
  );
  void supabase
    .from("pacts")
    .update({
      released: true,
      closed: true,
      released_at: new Date().toISOString(),
      released_caller_pubkey: caller,
      released_is_buyer_confirmed: isBuyerConfirmed,
    })
    .eq("pact_pubkey", pact)
    .then(({ error }) => {
      if (error) console.warn("[indexer] escrow update (release) failed:", error.message);
    });
}

/**
 * DeliveryEscrowDisputedEvent layout:
 *   pact(32) authority(32) amount(u64) slot(u64)
 * total: 80 bytes
 */
function handleEscrowDisputed(data: Buffer, signature: string) {
  if (data.length < 80) return;
  const pact = bs58.encode(data.subarray(0, 32));
  const amount = data.readBigUInt64LE(64);
  console.log(
    `[indexer] EscrowDisputed pact=${pact.slice(0, 6)}… refund=${amount} sig=${signature.slice(0, 8)}…`,
  );
  void supabase
    .from("pacts")
    .update({
      refunded: true,
      closed: true,
      refunded_at: new Date().toISOString(),
    })
    .eq("pact_pubkey", pact)
    .then(({ error }) => {
      if (error) console.warn("[indexer] escrow update (dispute) failed:", error.message);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook delivery worker
// ─────────────────────────────────────────────────────────────────────────────

const webhookWorker = startWebhookWorker(supabase);
console.log("[indexer] Webhook delivery worker started (poll 30s).");

process.on("SIGINT", () => {
  console.log("\n[indexer] shutting down…");
  webhookWorker.stop();
  process.exit(0);
});

console.log("[indexer] Listening… Ctrl+C to stop.");
