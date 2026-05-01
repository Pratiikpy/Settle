//! Settle Agent Card — single Anchor program (P0).
//!
//! Holds:
//!   - AgentCard PDA: scoped credential with daily_cap, per_call_max, allowlist, expiry,
//!     revoked, usdc_mint pin.
//!   - Pact PDA: task-scoped child card with a Vault PDA for autonomous spend.
//!
//! Architectural primitive: `spend_via_pact` lets the agent (signing as `card.agent_pubkey`)
//! transfer USDC from the Pact's Vault PDA to an allowlisted merchant — WITHOUT the user's
//! per-spend signature. The Vault PDA is program-signed via with_signer. The user's custody
//! remains intact: they can `close_pact` at any time and reclaim unspent USDC.
//!
//! Hash commitments: every spend / record_denial / revoke commits 3 BLAKE3 hashes
//! (receipt_hash, reason_hash, policy_snapshot_hash) into PolicyDecisionEvent. A fourth
//! purpose_hash binds them to HTTP context off-chain (computed in @settle/sdk).
//!
//! Mint enforcement: AgentCard.usdc_mint is pinned at create_card time. Both spend paths
//! reject any other mint via `address = card.usdc_mint` constraint and TransferChecked
//! validates the decimals against the mint account.

use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod events;
pub mod instructions;

pub use state::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;

declare_id!("HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD");

#[program]
pub mod settle_agent_card {
    use super::*;

    /// Initialize an AgentCard PDA. Authority signs; agent_pubkey is recorded but does NOT
    /// sign the create_card ix itself. The agent_pubkey will sign spend_via_pact later.
    pub fn create_card(
        ctx: Context<CreateCard>,
        params: CreateCardParams,
    ) -> Result<()> {
        instructions::create_card::handler(ctx, params)
    }

    /// Authority-signed spend (legacy / direct mode).
    /// For the autonomous-agent flow, prefer `spend_via_pact`.
    pub fn spend(
        ctx: Context<Spend>,
        amount: u64,
        capability_hash: [u8; 32],
        receipt_hash: [u8; 32],
        reason_hash: [u8; 32],
        policy_snapshot_hash: [u8; 32],
    ) -> Result<()> {
        instructions::spend::handler(
            ctx,
            amount,
            capability_hash,
            receipt_hash,
            reason_hash,
            policy_snapshot_hash,
        )
    }

    /// Pact-scoped autonomous spend — agent signs, Vault PDA executes the transfer.
    /// The user does NOT sign this ix per-spend.
    pub fn spend_via_pact(
        ctx: Context<SpendViaPact>,
        amount: u64,
        capability_hash: [u8; 32],
        receipt_hash: [u8; 32],
        reason_hash: [u8; 32],
        policy_snapshot_hash: [u8; 32],
    ) -> Result<()> {
        instructions::spend_via_pact::handler(
            ctx,
            amount,
            capability_hash,
            receipt_hash,
            reason_hash,
            policy_snapshot_hash,
        )
    }

    /// Mark card as revoked. Idempotent. Bumps policy_version. Emits both
    /// PolicyDecisionEvent (decision=2 REVOKE) and CardRevokedEvent.
    pub fn revoke(ctx: Context<Revoke>) -> Result<()> {
        instructions::revoke::handler(ctx)
    }

    /// Record a denial that was decided off-chain. Authority-signed; produces a
    /// PolicyDecisionEvent so the on-chain ledger reflects every DENY with merchant +
    /// pact context for indexer filtering.
    pub fn record_denial(
        ctx: Context<RecordDenial>,
        deny_code: u8,
        merchant: Pubkey,
        pact: Pubkey,
        receipt_hash: [u8; 32],
        reason_hash: [u8; 32],
        policy_snapshot_hash: [u8; 32],
    ) -> Result<()> {
        instructions::record_denial::handler(
            ctx,
            deny_code,
            merchant,
            pact,
            receipt_hash,
            reason_hash,
            policy_snapshot_hash,
        )
    }

    /// Open a Pact + atomically fund its Vault PDA's USDC ATA with cap_lamports.
    /// After this ix, the agent can spend autonomously up to the cap.
    pub fn open_pact(
        ctx: Context<OpenPact>,
        params: OpenPactParams,
    ) -> Result<()> {
        instructions::open_pact::handler(ctx, params)
    }

    /// Close a Pact. Refunds unspent vault balance to authority's USDC ATA on-chain
    /// (no off-band merchant signing required). Mode-agnostic: works for both OneShot
    /// and Streaming pacts because the refund reads from vault_usdc.amount directly.
    pub fn close_pact(ctx: Context<ClosePact>) -> Result<()> {
        instructions::close_pact::handler(ctx)
    }

    // ───────────── Streaming Pact (P1) ─────────────

    /// Open a Streaming Pact + atomically fund vault with max_total_lamports.
    /// Entitlement accrues at rate_lamports_per_slot from the open slot forward.
    pub fn open_streaming_pact(
        ctx: Context<OpenStreamingPact>,
        params: OpenStreamingPactParams,
    ) -> Result<()> {
        instructions::open_streaming_pact::handler(ctx, params)
    }

    /// Streaming claim — agent draws accrued entitlement up to max_total - claimed,
    /// minus any time spent paused. Updates parent card.used_today (cross-pact daily
    /// cap stays enforced).
    pub fn claim_streaming(
        ctx: Context<ClaimStreaming>,
        capability_hash: [u8; 32],
        receipt_hash: [u8; 32],
        reason_hash: [u8; 32],
        policy_snapshot_hash: [u8; 32],
    ) -> Result<()> {
        instructions::claim_streaming::handler(
            ctx,
            capability_hash,
            receipt_hash,
            reason_hash,
            policy_snapshot_hash,
        )
    }

    /// Authority-only pause. While paused, no entitlement accrues. Idempotent.
    pub fn pause_streaming(ctx: Context<PauseStreaming>) -> Result<()> {
        instructions::pause_streaming::handler(ctx)
    }

    /// Authority-only resume. Closes out the in-flight pause window into
    /// pause_accumulated_slots so the next claim doesn't bill paused time. Idempotent.
    pub fn resume_streaming(ctx: Context<ResumeStreaming>) -> Result<()> {
        instructions::resume_streaming::handler(ctx)
    }

    // ───────────── Delivery Escrow (P9) ─────────────

    /// Open a DeliveryEscrow Pact + atomically fund vault. Buyer signs. Merchant +
    /// capability_hash pinned at open. confirm_deadline_slot ≤ dispute_deadline_slot
    /// enforced. State machine: open → released | refunded.
    pub fn open_delivery_escrow(
        ctx: Context<OpenDeliveryEscrow>,
        params: OpenDeliveryEscrowParams,
    ) -> Result<()> {
        instructions::open_delivery_escrow::handler(ctx, params)
    }

    /// Release escrowed funds to the pinned merchant. Two callers: buyer (any time)
    /// or anyone permissionlessly after confirm_deadline_slot. Merchant pinned at
    /// open prevents redirection. Closes the pact on success.
    pub fn release_delivery_escrow(ctx: Context<ReleaseDeliveryEscrow>) -> Result<()> {
        instructions::release_delivery_escrow::handler(ctx)
    }

    /// Buyer-only dispute within the dispute window. Refunds vault → buyer's USDC ATA
    /// and closes the pact. Distinct from close_pact: timing constraint + dedicated
    /// event for the unified ledger.
    pub fn dispute_delivery_escrow(ctx: Context<DisputeDeliveryEscrow>) -> Result<()> {
        instructions::dispute_delivery_escrow::handler(ctx)
    }
}
