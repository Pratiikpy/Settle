use anchor_lang::prelude::*;

/// Unified ALLOW/DENY/REVOKE on-chain ledger event (N18).
/// Indexer (Helius LaserStream / WebSocket) consumes these to populate Postgres
/// dual-receipt views. Decision = 0 ALLOW / 1 DENY / 2 REVOKE.
#[event]
pub struct PolicyDecisionEvent {
    pub card: Pubkey,
    pub merchant: Pubkey,
    pub decision: u8,        // 0=ALLOW, 1=DENY, 2=REVOKE
    pub deny_code: u8,       // 0 when ALLOW; 1..=8 otherwise (see DenyCode)
    pub amount: u64,
    pub receipt_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub policy_snapshot_hash: [u8; 32],
    pub slot: u64,
    pub policy_version: u32,
    pub pact: Pubkey, // Pubkey::default() when not pact-scoped
}

#[event]
pub struct CardCreatedEvent {
    pub card: Pubkey,
    pub authority: Pubkey,
    pub agent_pubkey: Pubkey,
    pub usdc_mint: Pubkey,
    pub daily_cap: u64,
    pub per_call_max: u64,
    pub allowlist_count: u8,
    pub expiry_slot: u64,
    pub policy_version: u32,
}

#[event]
pub struct CardRevokedEvent {
    pub card: Pubkey,
    pub authority: Pubkey,
    pub policy_version: u32,
    pub slot: u64,
}

#[event]
pub struct PactOpenedEvent {
    pub pact: Pubkey,
    pub parent_card: Pubkey,
    pub vault: Pubkey,
    pub cap: u64,
    pub funded_amount: u64,
    pub expiry_slot: u64,
    pub allowlist_count: u8,
}

#[event]
pub struct PactClosedEvent {
    pub pact: Pubkey,
    pub parent_card: Pubkey,
    pub spent: u64,
    pub refund_amount: u64,
    pub slot: u64,
}

#[event]
pub struct PactSpendEvent {
    pub pact: Pubkey,
    pub card: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
    pub spent_after: u64,
    pub cap_remaining_after: u64,
    pub slot: u64,
}

/// Streaming Pact opened. Mirrors PactOpenedEvent but carries rate + max_total
/// instead of a single cap field, so the indexer can populate streaming-specific UI.
#[event]
pub struct StreamingPactOpenedEvent {
    pub pact: Pubkey,
    pub parent_card: Pubkey,
    pub vault: Pubkey,
    pub rate_lamports_per_slot: u64,
    pub max_total_lamports: u64,
    pub funded_amount: u64,
    pub opened_slot: u64,
    pub expiry_slot: u64,
    pub allowlist_count: u8,
}

/// Emitted on every successful claim_streaming.
#[event]
pub struct PactStreamClaimEvent {
    pub pact: Pubkey,
    pub card: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
    pub billable_slots: u64,
    pub claimed_after: u64,
    pub max_remaining_after: u64,
    pub slot: u64,
}

/// Emitted on pause + resume of a Streaming Pact. `paused = true` for pause,
/// `paused = false` for resume.
#[event]
pub struct PactStreamPauseEvent {
    pub pact: Pubkey,
    pub paused: bool,
    pub slot: u64,
}

/// P9 — DeliveryEscrow opened: vault funded, merchant + capability + deadlines pinned.
#[event]
pub struct DeliveryEscrowOpenedEvent {
    pub pact: Pubkey,
    pub parent_card: Pubkey,
    pub vault: Pubkey,
    pub merchant: Pubkey,
    pub capability_hash: [u8; 32],
    pub amount: u64,
    pub confirm_deadline_slot: u64,
    pub dispute_deadline_slot: u64,
    pub opened_slot: u64,
}

/// P9 — Released to merchant. `is_buyer_confirmed = true` when caller == buyer
/// (early confirm); `false` when called permissionlessly post-deadline.
#[event]
pub struct DeliveryEscrowReleasedEvent {
    pub pact: Pubkey,
    pub merchant: Pubkey,
    pub caller: Pubkey,
    pub is_buyer_confirmed: bool,
    pub amount: u64,
    pub slot: u64,
}

/// P9 — Disputed: refunded to buyer within the dispute window.
#[event]
pub struct DeliveryEscrowDisputedEvent {
    pub pact: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

/// F2.0 Universal Receipt Kernel — Path A on-chain attestation.
///
/// Emitted by `record_receipt` to record a 4-hash kernel commit on-chain
/// for any payment kind (including non-Anchor-routed direct sends, link
/// claims, refunds). Indexer parses these and writes to Postgres alongside
/// PolicyDecisionEvent rows so dashboards can filter receipts by kind.
///
/// Layout (Borsh, little-endian):
///   attestor(32) kind(u8) receipt_hash(32) reason_hash(32)
///   policy_snapshot_hash(32) purpose_hash(32) context_hash(32) slot(u64)
/// Total: 32 + 1 + 32*5 + 8 = 201 bytes
#[event]
pub struct ReceiptRecordedEvent {
    /// The signer that attested. Verifier decides whether to trust based on
    /// who this is (e.g. only Settle operator's key for merchant dashboards).
    pub attestor: Pubkey,
    /// Kind tag — matches @settle/sdk `KIND_TAG`:
    /// 1=x402_spend, 2=direct_send, 3=link_send, 4=streaming_claim,
    /// 5=escrow_release, 6=escrow_dispute, 7=refund.
    pub kind: u8,
    pub receipt_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub policy_snapshot_hash: [u8; 32],
    pub purpose_hash: [u8; 32],
    pub context_hash: [u8; 32],
    pub slot: u64,
}
