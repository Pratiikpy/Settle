#!/usr/bin/env tsx
/**
 * Emit canonical kernel hashes for ALL receipt kinds — these are the
 * golden values C36 locks into the Rust crate's tests. Run with:
 *   pnpm tsx scripts/smoke-multikind-goldens.ts
 *
 * The output below is what `cargo test` in packages/rust-sdk should
 * reproduce when given the same inputs. Paste each block into
 * `kernel.rs::tests::parity_<kind>_golden` to lock it.
 */
import { kernelCommit } from "../packages/sdk/dist/index.js";

const SENDER = "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp";
const RECIPIENT = "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY";
const CARD = "8RTNZ3K7gK2nQfqkXCWNkD3FrM5pZ9TyVmLs4WsKZGZE";
const PACT = "DnQYwGhAqJ7tPjKpQqZsXLg5Pi9MhT6cWnKnZJ2xY8WX";

const RID_X402 = "11111111-aaaa-bbbb-cccc-222222222222";
const RID_DIRECT = "11111111-2222-3333-4444-555555555555";
const RID_LINK = "33333333-aaaa-bbbb-cccc-444444444444";
const RID_STREAM = "55555555-aaaa-bbbb-cccc-666666666666";
const RID_RELEASE = "77777777-aaaa-bbbb-cccc-888888888888";
const RID_DISPUTE = "99999999-aaaa-bbbb-cccc-aaaaaaaaaaaa";
const RID_REFUND = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";

const CAPABILITY_HASH = "a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b";

function dump(label: string, kind: string, result: ReturnType<typeof kernelCommit>) {
  console.log("─".repeat(70));
  console.log(`KIND: ${kind}  (${label})`);
  console.log("receipt_hash         =", result.hashes.receipt_hash);
  console.log("reason_hash          =", result.hashes.reason_hash);
  console.log("policy_snapshot_hash =", result.hashes.policy_snapshot_hash);
  console.log("purpose_hash         =", result.hashes.purpose_hash);
  console.log("context_hash         =", result.context_hash);
}

// ─── x402_spend (card-bound + http context) ───
dump(
  "x402 agent spend",
  "x402_spend",
  kernelCommit({
    kind: "x402_spend",
    request_id: RID_X402,
    amount_lamports: "20000",
    sender: SENDER,
    recipient: RECIPIENT,
    decision_slot: 5,
    purpose_text: "translate this",
    decision: "ALLOW",
    deny_code: 0,
    card_pubkey: CARD,
    pact_pubkey: null,
    capability_hash: CAPABILITY_HASH,
    policy_version: 1,
    daily_cap_lamports: "1000000",
    per_call_max_lamports: "100000",
    allowlist_count: 1,
    expiry_slot: 1_000_000,
    revoked: false,
    cap_remaining_after: "980000",
    http_method: "POST",
    http_path: "/v1/translate",
  }),
);

// ─── direct_send (already locked, included for cross-check) ───
dump(
  "direct send (locked golden)",
  "direct_send",
  kernelCommit({
    kind: "direct_send",
    request_id: RID_DIRECT,
    amount_lamports: "500000",
    sender: SENDER,
    recipient: RECIPIENT,
    decision_slot: 1000,
    purpose_text: "coffee with alice",
  }),
);

// ─── link_send (no card, has link_token) ───
dump(
  "pre-funded payment link claim",
  "link_send",
  kernelCommit({
    kind: "link_send",
    request_id: RID_LINK,
    amount_lamports: "250000",
    sender: SENDER,
    recipient: RECIPIENT,
    decision_slot: 100,
    purpose_text: "claim from link",
    link_token: "link-abc12345",
  }),
);

// ─── streaming_claim (card-bound, has billable_slots) ───
dump(
  "streaming pact claim",
  "streaming_claim",
  kernelCommit({
    kind: "streaming_claim",
    request_id: RID_STREAM,
    amount_lamports: "10000",
    sender: SENDER,
    recipient: RECIPIENT,
    decision_slot: 500,
    purpose_text: "10s of agent work",
    decision: "ALLOW",
    deny_code: 0,
    card_pubkey: CARD,
    pact_pubkey: PACT,
    capability_hash: CAPABILITY_HASH,
    policy_version: 1,
    daily_cap_lamports: "500000",
    per_call_max_lamports: "50000",
    allowlist_count: 1,
    expiry_slot: 1_000_000,
    revoked: false,
    cap_remaining_after: "490000",
    billable_slots: 10,
  }),
);

// ─── escrow_release (card-bound, has buyer_confirmed) ───
dump(
  "delivery escrow released to merchant",
  "escrow_release",
  kernelCommit({
    kind: "escrow_release",
    request_id: RID_RELEASE,
    amount_lamports: "100000",
    sender: SENDER,
    recipient: RECIPIENT,
    decision_slot: 200,
    purpose_text: "buyer confirmed delivery",
    decision: "ALLOW",
    deny_code: 0,
    card_pubkey: CARD,
    pact_pubkey: PACT,
    capability_hash: CAPABILITY_HASH,
    policy_version: 1,
    daily_cap_lamports: "1000000",
    per_call_max_lamports: "200000",
    allowlist_count: 1,
    expiry_slot: 1_000_000,
    revoked: false,
    cap_remaining_after: "900000",
    buyer_confirmed: true,
  }),
);

// ─── escrow_dispute (card-bound) ───
dump(
  "delivery escrow disputed → buyer refund",
  "escrow_dispute",
  kernelCommit({
    kind: "escrow_dispute",
    request_id: RID_DISPUTE,
    amount_lamports: "100000",
    sender: SENDER,
    recipient: RECIPIENT,
    decision_slot: 250,
    purpose_text: "buyer disputed delivery",
    decision: "ALLOW",
    deny_code: 0,
    card_pubkey: CARD,
    pact_pubkey: PACT,
    capability_hash: CAPABILITY_HASH,
    policy_version: 1,
    daily_cap_lamports: "1000000",
    per_call_max_lamports: "200000",
    allowlist_count: 1,
    expiry_slot: 1_000_000,
    revoked: false,
    cap_remaining_after: "900000",
  }),
);

// ─── refund (no card, has refund_of_request_id + refund_reason) ───
dump(
  "post-receipt refund",
  "refund",
  kernelCommit({
    kind: "refund",
    request_id: RID_REFUND,
    amount_lamports: "50000",
    sender: SENDER,
    recipient: RECIPIENT,
    decision_slot: 300,
    purpose_text: "refund: never delivered",
    refund_of_request_id: RID_DIRECT,
    refund_reason: "merchant agreed full refund",
  }),
);

console.log("─".repeat(70));
console.log("DONE — paste each block into kernel.rs golden tests.");
