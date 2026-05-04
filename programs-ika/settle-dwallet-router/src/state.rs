// Copyright (c) Settle.
// SPDX-License-Identifier: MIT

use anchor_lang::prelude::*;

/// Slot window for a 24h cap reset on the cross-chain card.
/// Mirrors `settle-agent-card::AgentCard::CAP_WINDOW_SLOTS` so users see
/// consistent reset cadence across both card types.
pub const CC_CAP_WINDOW_SLOTS: u64 = 220_000;

/// Maximum allowlist entries on a single cross-chain card. Sized to balance
/// rent cost against realistic agent allowlists. Bump only after a deliberate
/// rent-impact review.
pub const MAX_CC_ALLOWLIST: usize = 8;

/// A single allowlist entry on a cross-chain card.
///
/// Distinct from `settle-agent-card::AllowlistEntry` because EVM (20 byte),
/// BTC (variable script), and Sui addresses do not fit Solana's 32-byte base58
/// pubkey shape and have no chain discriminator. We carry CAIP-2
/// (namespace + reference) plus a kind tag and a 32-byte recipient buffer
/// (left-padded for shorter address types).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct CrosschainAllowlistEntry {
    /// CAIP-2 namespace, ASCII left-padded with zeros: "eip155", "bip122",
    /// "solana", "sip2" (Sui), etc.
    pub chain_namespace: [u8; 16],

    /// CAIP-2 reference. ASCII for chain ids that fit, otherwise bytes (e.g.
    /// truncated genesis hash for "bip122"). Left-padded with zeros.
    pub chain_reference: [u8; 32],

    /// 0 = raw_bytes, 1 = evm_address (20 bytes), 2 = btc_p2wpkh (20 bytes),
    /// 3 = solana_pubkey (32 bytes). Renderer uses this to format the
    /// recipient correctly in the receipt.
    pub recipient_kind: u8,

    /// Address bytes, left-padded with zeros for kinds shorter than 32 bytes.
    pub recipient: [u8; 32],

    /// 0 = native asset (ETH, BTC, SOL), 1 = erc20 (asset = contract addr,
    /// 20 bytes left-padded), 2 = spl (asset = mint, 32 bytes), 3 = ordinal/runes
    /// (reserved, future).
    pub asset_kind: u8,

    /// Asset identifier per `asset_kind`. Zeros for native.
    pub asset: [u8; 32],

    /// Capability pin. Zeros = unset (any capability accepted). Otherwise the
    /// `request_crosschain_sign` ix MUST pass the matching capability_hash.
    pub capability_hash: [u8; 32],
}

impl CrosschainAllowlistEntry {
    /// Encoded size as Borsh: every field is fixed-size.
    pub const SIZE: usize = 16 + 32 + 1 + 32 + 1 + 32 + 32; // = 146
}

/// CrosschainCard PDA. Seeds: [b"crosschain-card", authority.key(), label_hash].
///
/// Owns its own mutable cap state (`used_today_minor`, `last_reset_slot`).
/// Does not share accounting with `settle-agent-card::AgentCard` — the
/// product UI declares this split honestly.
#[account]
pub struct CrosschainCard {
    /// Solana wallet that controls this card (signer for init, attach, revoke).
    pub authority: Pubkey,

    /// Off-chain agent identity. Receipts attribute spend to this pubkey.
    pub agent_pubkey: Pubkey,

    /// Seed component (user label hashed). Lets one authority own multiple cards.
    pub label_hash: [u8; 32],

    /// The Ika DWallet account this card controls. Set at init; immutable.
    pub dwallet: Pubkey,

    /// Shared GasDeposit PDA on the Ika program. Pays IKA fees for sign requests.
    pub gas_deposit: Pubkey,

    /// Per-call cap, in chain-native minor units. u128 because EVM `wei`
    /// requires up to 2^96 for realistic balances; u64 would silently truncate.
    pub per_call_max_minor: u128,

    /// Daily cap, in chain-native minor units.
    pub daily_cap_minor: u128,

    /// Used in the current cap window. Reset when `current_slot - last_reset_slot >= CC_CAP_WINDOW_SLOTS`.
    pub used_today_minor: u128,

    /// Anchor slot of the last cap-window reset. Initialized to the slot of
    /// `init_crosschain_card`.
    pub last_reset_slot: u64,

    /// Allowlist. Capped at MAX_CC_ALLOWLIST entries.
    pub allowlist: Vec<CrosschainAllowlistEntry>,

    /// Hard expiry. Sign requests after this slot fail with `Expired`.
    pub expiry_slot: u64,

    /// Once true, all future sign requests fail with `Revoked`. Cannot be unset.
    pub revoked: bool,

    /// Bumped on revoke and on policy mutation ixs. Off-chain receipt
    /// renderer uses this to detect when policy changed under a stale view.
    pub policy_version: u32,

    /// Unix timestamp of init.
    pub created_at: i64,

    /// PDA bump for derivation reuse.
    pub bump: u8,
}

impl CrosschainCard {
    pub const SEED_PREFIX: &'static [u8] = b"crosschain-card";

    /// Discriminator(8) + struct fields. Vec<CrosschainAllowlistEntry> is
    /// allocated for MAX_CC_ALLOWLIST entries always, with a 4-byte length
    /// prefix.
    pub const SPACE: usize = 8                              // anchor discriminator
        + 32 + 32 + 32 + 32 + 32                            // authority, agent_pubkey, label_hash, dwallet, gas_deposit
        + 16 + 16 + 16                                      // per_call_max_minor, daily_cap_minor, used_today_minor (u128 each)
        + 8                                                 // last_reset_slot
        + 4 + (CrosschainAllowlistEntry::SIZE * MAX_CC_ALLOWLIST) // allowlist
        + 8                                                 // expiry_slot
        + 1                                                 // revoked
        + 4                                                 // policy_version
        + 8                                                 // created_at
        + 1;                                                // bump
}

/// Per-request receipt PDA. Seeds: [b"crosschain-receipt", card.key(), &request_id].
///
/// One row per `request_crosschain_sign` invocation. Sealed at request time
/// for both ALLOW and DENY paths so the policy gate is provable. ALLOW rows
/// are updated by `record_signed_outcome` once the cross-chain tx broadcasts.
#[account]
pub struct CrosschainReceipt {
    pub card: Pubkey,
    pub request_id: [u8; 16],          // 128-bit request id (UUID v4)
    pub decision: u8,                  // 0 = ALLOW, 1 = DENY
    pub deny_code: u8,                 // 0 when ALLOW, otherwise per `errors::DenyCode`
    pub amount_minor: u128,
    pub chain_namespace: [u8; 16],
    pub chain_reference: [u8; 32],
    pub recipient: [u8; 32],
    pub asset: [u8; 32],
    pub message_digest: [u8; 32],
    pub receipt_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub policy_snapshot_hash: [u8; 32],
    pub purpose_hash: [u8; 32],
    pub target_tx_hash: [u8; 32],      // zero until record_signed_outcome
    pub decision_slot: u64,
    pub policy_version: u32,
    pub bump: u8,
}

impl CrosschainReceipt {
    pub const SEED_PREFIX: &'static [u8] = b"crosschain-receipt";
    pub const SPACE: usize = 8
        + 32 + 16 + 1 + 1
        + 16
        + 16 + 32 + 32 + 32
        + 32 + 32 + 32 + 32 + 32 + 32
        + 8 + 4 + 1;
}
