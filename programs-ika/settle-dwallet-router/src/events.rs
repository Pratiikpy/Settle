// Copyright (c) Settle.
// SPDX-License-Identifier: MIT

use anchor_lang::prelude::*;

/// Decision outcome enum for `CrosschainPolicyEvent`. Stored as a u8 in events
/// for parity with the existing receipt event in `settle-agent-card`.
pub const DECISION_ALLOW: u8 = 0;
pub const DECISION_DENY: u8 = 1;

/// Emitted by `request_crosschain_sign` for both ALLOW and DENY outcomes.
///
/// Mirrors `settle-agent-card::PolicyDecisionEvent` field-for-field where
/// possible so a unified off-chain indexer (the existing `apps/indexer`) can
/// be extended without re-architecting. Net-new fields document what is
/// cross-chain specific.
#[event]
pub struct CrosschainPolicyEvent {
    pub card: Pubkey,
    pub authority: Pubkey,
    pub agent_pubkey: Pubkey,

    /// 0 = ALLOW, 1 = DENY.
    pub decision: u8,

    /// 0 when ALLOW. Otherwise per `errors::CrosschainDenyCode`.
    pub deny_code: u8,

    pub amount_minor: u128,
    pub chain_namespace: [u8; 16],
    pub chain_reference: [u8; 32],
    pub recipient: [u8; 32],
    pub asset: [u8; 32],

    /// Hash chain — same convention as the existing Settle x402 receipts.
    pub message_digest: [u8; 32],
    pub receipt_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub policy_snapshot_hash: [u8; 32],
    pub purpose_hash: [u8; 32],

    pub decision_slot: u64,
    pub policy_version: u32,
}

/// Emitted by `record_signed_outcome` once the cross-chain tx broadcasts.
/// The off-chain renderer joins this against the original
/// `CrosschainPolicyEvent` by `card + request_id`.
#[event]
pub struct CrosschainSignedOutcomeEvent {
    pub card: Pubkey,
    pub request_id: [u8; 16],
    pub target_tx_hash: [u8; 32],
    pub recorded_slot: u64,
}

/// Emitted by `revoke_crosschain_card`.
#[event]
pub struct CrosschainCardRevokedEvent {
    pub card: Pubkey,
    pub authority: Pubkey,
    pub revoked_slot: u64,
    pub policy_version: u32,
}
