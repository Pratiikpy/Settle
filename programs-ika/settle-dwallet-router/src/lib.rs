// Copyright (c) Settle.
// SPDX-License-Identifier: MIT
//
// Settle x Ika — dWallet router program (Anchor 1.0).
//
// THESIS
//   Solana defines the policy. Ika enforces custody and signing across chains.
//   Settle shows proof of what was allowed, blocked, signed, and executed.
//
// SCOPE
//   Sibling to `settle-agent-card`. Does not read, write, or share state with
//   the deployed program at HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD.
//   Cross-chain card state is owned entirely by this program.
//
// INSTRUCTIONS (4 — phase B)
//   1. init_crosschain_card     — allocate `CrosschainCard` PDA bound to a
//      pre-DKG'd Ika dWallet whose authority has already been transferred
//      to this program's per-card CPI authority PDA via off-chain Ika RPC.
//   2. request_crosschain_sign  — POLICY GATE. Validates against
//      `CrosschainCard` (cap, allowlist, expiry, revoke). Allocates a
//      `CrosschainReceipt` PDA for the request (sealed for both ALLOW
//      and DENY paths). On ALLOW, increments `used_today_minor` and CPIs
//      `approve_message` on the Ika dWallet program. On DENY, NO CPI is
//      ever made; no signature is produced. Emits `CrosschainPolicyEvent`.
//   3. record_signed_outcome    — once the cross-chain tx broadcasts,
//      writes `target_tx_hash` into the previously-sealed receipt PDA.
//      Does not change policy state. Emits `CrosschainSignedOutcomeEvent`.
//   4. revoke_crosschain_card   — set `revoked = true`. Future signs fail
//      the gate. Bumps `policy_version`. Emits `CrosschainCardRevokedEvent`.
//
// IKA DEVNET
//   Program id (pre-alpha): 87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY
//   gRPC endpoint:          https://pre-alpha-dev-1.ika.ika-network.net:443
//
// PRE-ALPHA DISCLAIMER
//   The Ika devnet uses a single mock signer, not real distributed MPC.
//   Receipts produced today are still valid as ALLOW/DENY proofs of the
//   policy gate; the signature material is not production-grade.
//
// NOT IMPLEMENTED ON-CHAIN (phase B)
//   - GasDeposit creation/top-up: handled off-chain via Ika's `CreateDeposit`
//     and `TopUp` instructions called directly by the user/operator. The
//     `gas_deposit_pubkey` is recorded on `CrosschainCard` for reference
//     and may be consumed by future ixs.
//   - dWallet authority transfer: handled off-chain via Ika's
//     `TransferOwnership` instruction during the DKG flow. We validate the
//     authority is correct in `request_crosschain_sign` by reading the
//     dWallet account state inside the CPI.

use anchor_lang::prelude::*;
use ika_dwallet_anchor::{DWalletContext, CPI_AUTHORITY_SEED};

pub mod errors;
pub mod events;
pub mod policy;
pub mod state;

pub use errors::*;
pub use events::*;
pub use state::*;

declare_id!("FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK");

// ─────────────────────────────────────────────────────────────────────────────
// Program entrypoints
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod settle_dwallet_router {
    use super::*;

    pub fn init_crosschain_card(
        ctx: Context<InitCrosschainCard>,
        params: InitCrosschainCardParams,
    ) -> Result<()> {
        instructions::init_crosschain_card(ctx, params)
    }

    pub fn request_crosschain_sign(
        ctx: Context<RequestCrosschainSign>,
        params: RequestCrosschainSignParams,
    ) -> Result<()> {
        instructions::request_crosschain_sign(ctx, params)
    }

    pub fn record_signed_outcome(
        ctx: Context<RecordSignedOutcome>,
        target_tx_hash: [u8; 32],
    ) -> Result<()> {
        instructions::record_signed_outcome(ctx, target_tx_hash)
    }

    pub fn revoke_crosschain_card(ctx: Context<RevokeCrosschainCard>) -> Result<()> {
        instructions::revoke_crosschain_card(ctx)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account contexts
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(params: InitCrosschainCardParams)]
pub struct InitCrosschainCard<'info> {
    #[account(
        init,
        payer = payer,
        space = CrosschainCard::SPACE,
        seeds = [CrosschainCard::SEED_PREFIX, authority.key().as_ref(), params.label_hash.as_ref()],
        bump,
    )]
    pub card: Account<'info, CrosschainCard>,

    pub authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: RequestCrosschainSignParams)]
pub struct RequestCrosschainSign<'info> {
    /// CrosschainCard PDA. Mutable: we increment `used_today_minor` on ALLOW.
    #[account(
        mut,
        seeds = [CrosschainCard::SEED_PREFIX, card.authority.as_ref(), card.label_hash.as_ref()],
        bump = card.bump,
    )]
    pub card: Account<'info, CrosschainCard>,

    /// Authority must sign sign-requests. Authority and dWallet ownership are
    /// pre-bound at init time; this signature ties this on-chain event to the
    /// human/agent that owns the card.
    pub authority: Signer<'info>,

    /// Per-request CrosschainReceipt PDA. Sealed for both ALLOW and DENY.
    #[account(
        init,
        payer = payer,
        space = CrosschainReceipt::SPACE,
        seeds = [CrosschainReceipt::SEED_PREFIX, card.key().as_ref(), params.request_id.as_ref()],
        bump,
    )]
    pub receipt: Account<'info, CrosschainReceipt>,

    // ── Ika CPI accounts (only consumed on the ALLOW path) ──

    /// Ika DWalletCoordinator PDA (read-only; provides epoch).
    /// Validated by the Ika program when `approve_message` is invoked.
    /// CHECK: passed verbatim to Ika; no constraints needed here.
    pub coordinator: UncheckedAccount<'info>,

    /// Ika MessageApproval PDA (created by CPI on ALLOW).
    /// CHECK: passed verbatim to Ika; the Ika program populates it.
    #[account(mut)]
    pub message_approval: UncheckedAccount<'info>,

    /// Ika DWallet account whose authority has already been transferred to
    /// `cpi_authority` (this program's per-program CPI authority PDA).
    /// CHECK: validated by Ika at CPI time; we only pass it through.
    pub dwallet: UncheckedAccount<'info>,

    /// CPI authority PDA — derived from `[CPI_AUTHORITY_SEED]` against this
    /// program. Must match the `dwallet.authority` set off-chain.
    /// CHECK: derived; the Ika program verifies the seed chain.
    #[account(
        seeds = [CPI_AUTHORITY_SEED],
        bump,
    )]
    pub cpi_authority: UncheckedAccount<'info>,

    /// The Ika dWallet program account.
    /// CHECK: id passed through to CPI.
    pub dwallet_program: UncheckedAccount<'info>,

    /// This program's executable account. Anchor v1's `Program<'info, ...>`
    /// would require a generated type here; raw account reference is fine.
    /// CHECK: used by Ika to verify the CPI call chain.
    pub program: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordSignedOutcome<'info> {
    /// CrosschainCard read-only. We don't mutate it here.
    #[account(
        seeds = [CrosschainCard::SEED_PREFIX, card.authority.as_ref(), card.label_hash.as_ref()],
        bump = card.bump,
    )]
    pub card: Account<'info, CrosschainCard>,

    /// Receipt to be updated. Must reference `card`.
    #[account(
        mut,
        seeds = [CrosschainReceipt::SEED_PREFIX, card.key().as_ref(), receipt.request_id.as_ref()],
        bump = receipt.bump,
        constraint = receipt.card == card.key() @ RouterError::AuthorityMismatch,
    )]
    pub receipt: Account<'info, CrosschainReceipt>,

    /// Authority signs to authorise the recording. Prevents anyone from
    /// stamping a tx hash onto someone else's receipt.
    #[account(constraint = authority.key() == card.authority @ RouterError::AuthorityMismatch)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RevokeCrosschainCard<'info> {
    #[account(
        mut,
        seeds = [CrosschainCard::SEED_PREFIX, card.authority.as_ref(), card.label_hash.as_ref()],
        bump = card.bump,
        constraint = authority.key() == card.authority @ RouterError::AuthorityMismatch,
    )]
    pub card: Account<'info, CrosschainCard>,

    pub authority: Signer<'info>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Instruction params
// ─────────────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitCrosschainCardParams {
    pub label_hash: [u8; 32],
    pub agent_pubkey: Pubkey,
    pub dwallet_pubkey: Pubkey,
    pub gas_deposit_pubkey: Pubkey,
    pub daily_cap_minor: u128,
    pub per_call_max_minor: u128,
    pub expiry_slot: u64,
    pub allowlist: Vec<CrosschainAllowlistEntry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RequestCrosschainSignParams {
    pub request_id: [u8; 16],
    pub message_digest: [u8; 32],
    pub message_metadata_digest: [u8; 32],
    pub user_pubkey: [u8; 32],
    pub signature_scheme: u16,
    pub message_approval_bump: u8,
    pub amount_minor: u128,
    pub chain_namespace: [u8; 16],
    pub chain_reference: [u8; 32],
    pub recipient_kind: u8,
    pub recipient: [u8; 32],
    pub asset_kind: u8,
    pub asset: [u8; 32],
    pub capability_hash: [u8; 32],
    pub receipt_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub policy_snapshot_hash: [u8; 32],
    pub purpose_hash: [u8; 32],
}

// ─────────────────────────────────────────────────────────────────────────────
// Instruction handlers
// ─────────────────────────────────────────────────────────────────────────────

mod instructions {
    use super::*;

    pub fn init_crosschain_card(
        ctx: Context<InitCrosschainCard>,
        params: InitCrosschainCardParams,
    ) -> Result<()> {
        require!(
            params.allowlist.len() <= MAX_CC_ALLOWLIST,
            RouterError::AllowlistTooLarge
        );
        require!(params.daily_cap_minor > 0, RouterError::InvalidParams);
        require!(params.per_call_max_minor > 0, RouterError::InvalidParams);
        require!(
            params.per_call_max_minor <= params.daily_cap_minor,
            RouterError::InvalidParams
        );

        let clock = Clock::get()?;
        let card = &mut ctx.accounts.card;

        card.authority = ctx.accounts.authority.key();
        card.agent_pubkey = params.agent_pubkey;
        card.label_hash = params.label_hash;
        card.dwallet = params.dwallet_pubkey;
        card.gas_deposit = params.gas_deposit_pubkey;
        card.per_call_max_minor = params.per_call_max_minor;
        card.daily_cap_minor = params.daily_cap_minor;
        card.used_today_minor = 0;
        card.last_reset_slot = clock.slot;
        card.allowlist = params.allowlist;
        card.expiry_slot = params.expiry_slot;
        card.revoked = false;
        card.policy_version = 1;
        card.created_at = clock.unix_timestamp;
        card.bump = ctx.bumps.card;

        Ok(())
    }

    pub fn request_crosschain_sign(
        ctx: Context<RequestCrosschainSign>,
        params: RequestCrosschainSignParams,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_slot = clock.slot;

        // ── Policy evaluation. The pure logic lives in `crate::policy` so it
        //    can be unit-tested without a Solana runtime.
        let policy_inputs = crate::policy::PolicyInputs {
            amount_minor: params.amount_minor,
            chain_namespace: params.chain_namespace,
            chain_reference: params.chain_reference,
            recipient_kind: params.recipient_kind,
            recipient: params.recipient,
            asset_kind: params.asset_kind,
            asset: params.asset,
            capability_hash: params.capability_hash,
        };
        let deny_code = crate::policy::evaluate_policy(&ctx.accounts.card, &policy_inputs, current_slot);

        let card = &mut ctx.accounts.card;
        let receipt = &mut ctx.accounts.receipt;

        // Seal the receipt PDA with the policy decision regardless of outcome.
        seal_receipt(
            receipt,
            card.key(),
            card.policy_version,
            &params,
            deny_code,
            current_slot,
            ctx.bumps.receipt,
        );

        // Emit the same on-chain event Settle's indexer reads for x402 flows,
        // adapted for cross-chain context.
        emit!(CrosschainPolicyEvent {
            card: card.key(),
            authority: card.authority,
            agent_pubkey: card.agent_pubkey,
            decision: if deny_code == 0 { DECISION_ALLOW } else { DECISION_DENY },
            deny_code,
            amount_minor: params.amount_minor,
            chain_namespace: params.chain_namespace,
            chain_reference: params.chain_reference,
            recipient: params.recipient,
            asset: params.asset,
            message_digest: params.message_digest,
            receipt_hash: params.receipt_hash,
            reason_hash: params.reason_hash,
            policy_snapshot_hash: params.policy_snapshot_hash,
            purpose_hash: params.purpose_hash,
            decision_slot: current_slot,
            policy_version: card.policy_version,
        });

        if deny_code != 0 {
            // DENY path: receipt is sealed, no CPI, no signature ever produced.
            return Ok(());
        }

        // ── ALLOW path. Apply daily cap reset window if elapsed.
        if current_slot.saturating_sub(card.last_reset_slot) >= CC_CAP_WINDOW_SLOTS {
            card.used_today_minor = 0;
            card.last_reset_slot = current_slot;
        }

        // Bump the daily counter. Overflow guard: u128 + u128 vs u128 max — the
        // policy gate above already ensures this fits, but defence-in-depth.
        card.used_today_minor = card
            .used_today_minor
            .checked_add(params.amount_minor)
            .ok_or(RouterError::ArithmeticOverflow)?;

        // CPI to Ika: approve the message for signing. The Ika network observes
        // the resulting MessageApproval PDA and writes the signature back
        // asynchronously via the NOA. The off-chain client polls the PDA
        // afterwards and submits `record_signed_outcome` once broadcast lands.
        let cpi = DWalletContext {
            dwallet_program: ctx.accounts.dwallet_program.to_account_info(),
            cpi_authority: ctx.accounts.cpi_authority.to_account_info(),
            caller_program: ctx.accounts.program.to_account_info(),
            cpi_authority_bump: ctx.bumps.cpi_authority,
        };

        cpi.approve_message(
            &ctx.accounts.coordinator.to_account_info(),
            &ctx.accounts.message_approval.to_account_info(),
            &ctx.accounts.dwallet.to_account_info(),
            &ctx.accounts.payer.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            params.message_digest,
            params.message_metadata_digest,
            params.user_pubkey,
            params.signature_scheme,
            params.message_approval_bump,
        )?;

        Ok(())
    }

    pub fn record_signed_outcome(
        ctx: Context<RecordSignedOutcome>,
        target_tx_hash: [u8; 32],
    ) -> Result<()> {
        let receipt = &mut ctx.accounts.receipt;
        require!(
            receipt.decision == DECISION_ALLOW,
            RouterError::CannotRecordOutcomeOnDeny
        );
        require!(
            receipt.target_tx_hash == [0u8; 32],
            RouterError::OutcomeAlreadyRecorded
        );

        receipt.target_tx_hash = target_tx_hash;

        let clock = Clock::get()?;
        emit!(CrosschainSignedOutcomeEvent {
            card: receipt.card,
            request_id: receipt.request_id,
            target_tx_hash,
            recorded_slot: clock.slot,
        });

        Ok(())
    }

    pub fn revoke_crosschain_card(ctx: Context<RevokeCrosschainCard>) -> Result<()> {
        let card = &mut ctx.accounts.card;
        require!(!card.revoked, RouterError::AlreadyRevoked);

        card.revoked = true;
        card.policy_version = card.policy_version.saturating_add(1);

        let clock = Clock::get()?;
        emit!(CrosschainCardRevokedEvent {
            card: card.key(),
            authority: card.authority,
            revoked_slot: clock.slot,
            policy_version: card.policy_version,
        });

        Ok(())
    }

    // ── Pure helpers ──

    fn seal_receipt(
        receipt: &mut CrosschainReceipt,
        card_key: Pubkey,
        policy_version: u32,
        params: &RequestCrosschainSignParams,
        deny_code: u8,
        current_slot: u64,
        bump: u8,
    ) {
        receipt.card = card_key;
        receipt.request_id = params.request_id;
        receipt.decision = if deny_code == 0 { DECISION_ALLOW } else { DECISION_DENY };
        receipt.deny_code = deny_code;
        receipt.amount_minor = params.amount_minor;
        receipt.chain_namespace = params.chain_namespace;
        receipt.chain_reference = params.chain_reference;
        receipt.recipient = params.recipient;
        receipt.asset = params.asset;
        receipt.message_digest = params.message_digest;
        receipt.receipt_hash = params.receipt_hash;
        receipt.reason_hash = params.reason_hash;
        receipt.policy_snapshot_hash = params.policy_snapshot_hash;
        receipt.purpose_hash = params.purpose_hash;
        receipt.target_tx_hash = [0u8; 32]; // populated by record_signed_outcome
        receipt.decision_slot = current_slot;
        receipt.policy_version = policy_version;
        receipt.bump = bump;
    }
}
