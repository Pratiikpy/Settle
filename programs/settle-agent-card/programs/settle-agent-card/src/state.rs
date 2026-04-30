use anchor_lang::prelude::*;

/// Canonical deny codes — MUST stay byte-aligned with
/// `packages/types/src/deny-codes.ts::DenyCode`.
/// Discriminants are persisted on-chain via PolicyDecisionEvent.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum DenyCode {
    Revoked = 1,
    OverCap = 2,                  // covers daily_cap OR per_call_max
    OffAllowlist = 3,
    Expired = 4,
    UserDeclinedReview = 5,
    DuplicateOrLoopDetected = 6,  // server-side rolling 60s / 3-attempt
    CapabilityNotPinned = 7,
    MerchantNotVerified = 8,
}

impl DenyCode {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(Self::Revoked),
            2 => Some(Self::OverCap),
            3 => Some(Self::OffAllowlist),
            4 => Some(Self::Expired),
            5 => Some(Self::UserDeclinedReview),
            6 => Some(Self::DuplicateOrLoopDetected),
            7 => Some(Self::CapabilityNotPinned),
            8 => Some(Self::MerchantNotVerified),
            _ => None,
        }
    }
}

/// Bounded allowlist entry. Capability_hash optional → if Some, spend MUST pin to that hash.
/// Used by both AgentCard.allowlist and Pact.allowlist (so a Pact can pin capabilities
/// per-merchant just like the parent card).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct AllowlistEntry {
    pub merchant_pubkey: Pubkey,           // 32
    pub capability_hash: Option<[u8; 32]>, // 1 + 32
}

pub const MAX_ALLOWLIST: usize = 10;
pub const MAX_PACT_ALLOWLIST: usize = 5;

/// AgentCard PDA. Seeds: [b"agent-card", authority.key(), label_hash]
#[account]
pub struct AgentCard {
    pub authority: Pubkey,             // 32
    pub agent_pubkey: Pubkey,          // 32 — identifies which agent payload sigs to accept
                                       //      AND signs spend_via_pact ixs on-chain
    pub label_hash: [u8; 32],          // 32 — seed component
    pub usdc_mint: Pubkey,             // 32 — pinned at creation; spend rejects any other mint
    pub daily_cap_lamports: u64,       // 8  — USDC base units (6 decimals)
    pub per_call_max_lamports: u64,    // 8  — Q2 lock: enforced on-chain
    pub used_today: u64,               // 8
    pub last_reset_slot: u64,          // 8
    pub allowlist: Vec<AllowlistEntry>,// 4 + (65 * MAX_ALLOWLIST) = 654
    pub expiry_slot: u64,              // 8
    pub revoked: bool,                 // 1
    pub policy_version: u32,           // 4 — bumped on revoke + on policy mutation ixs
    pub created_at: i64,               // 8
    pub bump: u8,                      // 1
}

impl AgentCard {
    /// Slot window for a 24h cap reset.
    /// Solana mainnet ≈ 400ms slot → 86400 / 0.4 = 216_000 slots. Round to 220_000.
    pub const CAP_WINDOW_SLOTS: u64 = 220_000;

    pub const SEED_PREFIX: &'static [u8] = b"agent-card";

    /// Discriminator(8) + struct fields. Pad allowlist to MAX_ALLOWLIST entries always-allocated.
    pub const SPACE: usize = 8     // discriminator
        + 32 + 32 + 32 + 32        // authority, agent_pubkey, label_hash, usdc_mint
        + 8 + 8 + 8 + 8            // daily_cap, per_call_max, used_today, last_reset_slot
        + 4 + (65 * MAX_ALLOWLIST) // allowlist
        + 8 + 1 + 4 + 8 + 1;       // expiry_slot, revoked, policy_version, created_at, bump
}

/// Pact spend mode. OneShot is the existing capped-budget pact; Streaming is the per-slot
/// rate-limited variant introduced in v0.3 (P1).
///
/// Slot accounting for Streaming:
///   - `last_claim_slot` is the anchor; entitlement accrues from this slot forward at
///     `rate_lamports_per_slot` per slot.
///   - When `paused == true`, no entitlement accrues. We record `pause_started_slot` and
///     count paused slots into `pause_accumulated_slots` *during the current claim period*.
///     Both reset on a successful claim.
///   - At claim time:
///       * if currently paused, finalize the running pause: pause_accumulated +=
///         (current - pause_started); pause_started <- current (so a continuing pause is
///         not retroactively charged after this claim).
///       * billable_slots = (current - last_claim) - pause_accumulated
///       * entitlement = billable_slots * rate, capped at (max_total - claimed).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum PactMode {
    OneShot {
        cap_lamports: u64, // 8
        spent: u64,        // 8
    },
    Streaming {
        rate_lamports_per_slot: u64,  // 8
        max_total_lamports: u64,       // 8
        claimed: u64,                  // 8
        last_claim_slot: u64,          // 8 — accrues from this slot forward
        paused: bool,                  // 1 — currently paused?
        pause_started_slot: u64,       // 8 — slot when current pause began (0 when not paused)
        pause_accumulated_slots: u64,  // 8 — paused slots accumulated since last_claim_slot
    },
    /// P9 — Buy-now-pay-on-delivery escrow.
    ///
    /// Funds sit in the Pact Vault PDA. State machine:
    ///   open → released  (buyer confirms early OR anyone calls after confirm_deadline)
    ///   open → refunded  (buyer disputes within dispute_deadline)
    ///
    /// `merchant` and `capability_hash` are pinned at open time so neither release path
    /// can redirect funds. `confirm_deadline_slot ≤ dispute_deadline_slot` is enforced
    /// at open: buyer's dispute window must extend at least as long as merchant's
    /// permissionless-release window, otherwise an honest buyer could be auto-released
    /// before they have a chance to dispute.
    DeliveryEscrow {
        amount: u64,                       // 8 — funded into vault at open
        merchant: Pubkey,                  // 32 — pinned destination
        capability_hash: [u8; 32],         // 32 — what was promised
        confirm_deadline_slot: u64,        // 8  — after this, anyone may release
        dispute_deadline_slot: u64,        // 8  — until this, buyer may dispute
        released: bool,                    // 1
        refunded: bool,                    // 1
    },
}

impl PactMode {
    /// 1 byte variant tag + max(variant payloads).
    ///   OneShot         = 8 + 8 = 16
    ///   Streaming       = 8*5 + 1 + 8 + 8 = 49
    ///   DeliveryEscrow  = 8 + 32 + 32 + 8 + 8 + 1 + 1 = 90
    pub const SIZE: usize = 1 + 90;
}

/// Pact PDA: task-scoped child card. Seeds: [b"pact", parent_card.key(), scope_label_hash]
///
/// Each Pact has a Vault PDA at [b"pact-vault", pact.key()] which is the authority of
/// the Pact's USDC ATA. The vault PDA is owned by this program and signs CPIs via
/// program-derived signing (ctx.bumps.vault_bump). This is what makes truly autonomous
/// agent spend possible: the user funds the vault once at open_pact time, then the agent
/// can trigger spend_via_pact / claim_streaming without per-spend authority signatures.
///
/// The `mode` field is a `PactMode` enum: `OneShot` for the original capped-spend variant,
/// `Streaming` for the rate-limited variant introduced in v0.3 (P1).
#[account]
pub struct Pact {
    pub parent_card: Pubkey,             // 32
    pub authority: Pubkey,               // 32 (mirrors parent_card.authority for fast checks)
    pub agent_pubkey: Pubkey,            // 32 (mirrors parent_card.agent_pubkey)
    pub scope_label_hash: [u8; 32],      // 32
    pub usdc_mint: Pubkey,               // 32 — pinned to parent_card.usdc_mint
    pub mode: PactMode,                  // PactMode::SIZE = 50
    pub allowlist: Vec<AllowlistEntry>,  // 4 + (65 * MAX_PACT_ALLOWLIST) = 329
    pub expiry_slot: u64,                // 8
    pub closed: bool,                    // 1
    pub created_at: i64,                 // 8
    pub bump: u8,                        // 1 — pact PDA bump
    pub vault_bump: u8,                  // 1 — vault PDA bump
}

impl Pact {
    pub const SEED_PREFIX: &'static [u8] = b"pact";
    pub const VAULT_SEED_PREFIX: &'static [u8] = b"pact-vault";

    pub const SPACE: usize = 8
        + 32 + 32 + 32 + 32 + 32           // parent_card, authority, agent_pubkey, scope_label_hash, usdc_mint
        + PactMode::SIZE                    // mode (OneShot | Streaming)
        + 4 + (65 * MAX_PACT_ALLOWLIST)    // allowlist
        + 8 + 1 + 8 + 1 + 1;               // expiry_slot, closed, created_at, bump, vault_bump
}
