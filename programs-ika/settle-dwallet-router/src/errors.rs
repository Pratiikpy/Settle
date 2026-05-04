// Copyright (c) Settle.
// SPDX-License-Identifier: MIT

use anchor_lang::prelude::*;

/// Cross-chain deny codes. Byte values must stay aligned with the off-chain
/// `packages/types` deny code enum used by receipt renderers.
///
/// 1..=8 mirror `settle-agent-card::DenyCode` so a unified renderer can show
/// the same human label. 100+ are cross-chain specific.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum CrosschainDenyCode {
    Revoked = 1,
    OverCap = 2,
    OffAllowlist = 3,
    Expired = 4,
    CapabilityNotPinned = 7,

    // Cross-chain specific
    UnsupportedChain = 100,
    UnsupportedAsset = 101,
    InvalidRecipientShape = 102,
    DwalletAuthorityMismatch = 110,
    GasDepositInsufficient = 111,
}

#[error_code]
pub enum RouterError {
    #[msg("Card is revoked; future signs are disabled")]
    Revoked,

    #[msg("Amount exceeds per-call cap or would exceed daily cap")]
    OverCap,

    #[msg("Recipient or chain not on the card's allowlist")]
    OffAllowlist,

    #[msg("Card has expired")]
    Expired,

    #[msg("Allowlist entry pins a capability_hash; request did not match")]
    CapabilityNotPinned,

    #[msg("Chain namespace is not supported by the router")]
    UnsupportedChain,

    #[msg("Asset shape is not supported by the router")]
    UnsupportedAsset,

    #[msg("Recipient bytes do not match the declared recipient_kind")]
    InvalidRecipientShape,

    #[msg("dWallet authority is not this program's CPI authority PDA")]
    DwalletAuthorityMismatch,

    #[msg("Shared GasDeposit on the Ika program has insufficient balance")]
    GasDepositInsufficient,

    #[msg("Allowlist exceeds MAX_CC_ALLOWLIST entries")]
    AllowlistTooLarge,

    #[msg("Daily cap or per-call cap would overflow u128 accounting")]
    ArithmeticOverflow,

    #[msg("Authority does not match the card.authority")]
    AuthorityMismatch,

    #[msg("Initialisation parameters fail invariant checks (zero caps, per_call > daily, etc.)")]
    InvalidParams,

    #[msg("Card is already revoked")]
    AlreadyRevoked,

    #[msg("Cannot record an on-chain tx hash on a DENY receipt; no signature was produced")]
    CannotRecordOutcomeOnDeny,

    #[msg("Outcome already recorded for this receipt")]
    OutcomeAlreadyRecorded,
}
