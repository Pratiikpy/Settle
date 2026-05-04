// Copyright (c) Settle.
// SPDX-License-Identifier: MIT
//
// Settle x Ika — dWallet router program (Anchor 1.0, sidetrack workspace).
//
// THESIS
//   Solana defines the policy. Ika enforces custody and signing across chains.
//   Settle shows proof of what was allowed, blocked, signed, and executed.
//
// SCOPE
//   This program is a sibling to `settle-agent-card`. It does not read, write,
//   or share state with the deployed program at HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD.
//   Cross-chain card state is owned entirely by this program.
//
// INSTRUCTIONS (6)
//   1. init_router_gas_deposit   — one-time-per-cluster: prepare the shared
//      Ika `GasDeposit` PDA so users do not pay IKA fees directly.
//   2. init_crosschain_card      — allocate `CrosschainCard` PDA bound to a
//      freshly-DKG'd dWallet.
//   3. attach_dwallet_authority  — CPI `transfer_ownership` on the dWallet so
//      its authority becomes this program's per-card CPI authority PDA.
//   4. request_crosschain_sign   — POLICY GATE. Validates against
//      `CrosschainCard` (cap, allowlist, expiry, revoke). On pass, CPI
//      `approve_message` on the Ika dWallet program. Emits `CrosschainPolicyEvent`
//      with the full hash chain.
//   5. record_signed_outcome     — after Ika signs and the user broadcasts the
//      cross-chain tx, record `target_tx_hash` (and explorer URL) into the
//      receipt row.
//   6. revoke_crosschain_card    — set `revoked = true`. Future signs fail
//      the gate. Optional: CPI `transfer_ownership` to a burn address to
//      permanently freeze the dWallet.
//
// IKA DEVNET
//   Program id (pre-alpha): 87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY
//   gRPC endpoint:          https://pre-alpha-dev-1.ika.ika-network.net:443
//
// PRE-ALPHA DISCLAIMER
//   The Ika devnet uses a single mock signer, not real distributed MPC. State
//   will be wiped at Ika Alpha 1. Receipts produced today are still valid as
//   ALLOW/DENY proofs of the policy gate; the signature material is not
//   production-grade.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod state;

pub use errors::*;
pub use events::*;
pub use state::*;

// Placeholder program id (valid base58, but not our real deploy address).
// Replace via:
//   solana-keygen new -o keys/dwallet_router-keypair.json --no-bip39-passphrase
//   anchor keys sync
// before any devnet/mainnet deploy. The placeholder lets `cargo check` pass
// and lets the IDL render so other crates can codegen against this program
// without waiting for keypair generation.
declare_id!("FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK");

#[program]
pub mod settle_dwallet_router {
    use super::*;

    /// Phase B: see SIDETRACK-IKA-PLAN.md §2.3 row 1.
    pub fn init_router_gas_deposit(_ctx: Context<InitRouterGasDeposit>) -> Result<()> {
        // TODO(phase-b): CPI `CreateDeposit` on the Ika program; record the
        // GasDeposit pubkey in a small program-owned `RouterConfig` PDA.
        Ok(())
    }

    /// Phase B: see SIDETRACK-IKA-PLAN.md §2.3 row 2.
    pub fn init_crosschain_card(
        _ctx: Context<InitCrosschainCard>,
        _params: InitCrosschainCardParams,
    ) -> Result<()> {
        // TODO(phase-b): allocate `CrosschainCard`, copy params (cap, allowlist,
        // expiry), bind to caller-supplied dwallet pubkey.
        Ok(())
    }

    /// Phase B: see SIDETRACK-IKA-PLAN.md §2.3 row 3.
    pub fn attach_dwallet_authority(_ctx: Context<AttachDwalletAuthority>) -> Result<()> {
        // TODO(phase-b): CPI `transfer_ownership` on the Ika dWallet so the
        // authority becomes this program's per-card CPI authority PDA.
        Ok(())
    }

    /// Phase B: see SIDETRACK-IKA-PLAN.md §2.3 row 4.
    /// THE POLICY GATE.
    pub fn request_crosschain_sign(
        _ctx: Context<RequestCrosschainSign>,
        _params: RequestCrosschainSignParams,
    ) -> Result<()> {
        // TODO(phase-b): validate policy against CrosschainCard:
        //   - revoked? -> fail Revoked
        //   - now > expiry_slot? -> fail Expired
        //   - amount > per_call_max_minor? -> fail OverCap
        //   - if reset window passed: zero used_today_minor; else used_today + amount > daily_cap -> fail OverCap
        //   - allowlist match by (chain_namespace, chain_reference, recipient)? -> else fail OffAllowlist
        //   - capability_hash mismatch (when allowlist entry pins one)? -> fail CapabilityNotPinned
        // On ALLOW: increment used_today_minor; CPI ika_dwallet_anchor::approve_message;
        //   emit CrosschainPolicyEvent { decision: Allow, hashes... }
        // On DENY: emit CrosschainPolicyEvent { decision: Deny, deny_code, hashes... }
        //   No CPI is made. No signature is ever produced.
        Ok(())
    }

    /// Phase B: see SIDETRACK-IKA-PLAN.md §2.3 row 5.
    pub fn record_signed_outcome(
        _ctx: Context<RecordSignedOutcome>,
        _target_tx_hash: [u8; 32],
    ) -> Result<()> {
        // TODO(phase-b): write the cross-chain tx hash into the per-request
        // receipt account so the off-chain renderer can build the explorer URL.
        Ok(())
    }

    /// Phase B: see SIDETRACK-IKA-PLAN.md §2.3 row 6.
    pub fn revoke_crosschain_card(_ctx: Context<RevokeCrosschainCard>) -> Result<()> {
        // TODO(phase-b): set revoked = true; bump policy_version; emit event.
        Ok(())
    }
}

// ── Account contexts (skeleton; full constraints land in Phase B) ──

#[derive(Accounts)]
pub struct InitRouterGasDeposit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    // TODO(phase-b): RouterConfig PDA, Ika program AccountInfo, GasDeposit PDA.
}

#[derive(Accounts)]
#[instruction(params: InitCrosschainCardParams)]
pub struct InitCrosschainCard<'info> {
    /// CHECK: card PDA, populated in handler. Seeds = [b"crosschain-card", authority, label_hash].
    #[account(mut)]
    pub card: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AttachDwalletAuthority<'info> {
    /// CHECK: card PDA validated in handler.
    #[account(mut)]
    pub card: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
    /// CHECK: Ika dWallet account (validated by ika-dwallet-anchor CPI).
    #[account(mut)]
    pub dwallet: UncheckedAccount<'info>,
    /// CHECK: per-card CPI authority PDA (seeds: [b"__ika_cpi_authority", card.key()]).
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: Ika dWallet program.
    pub dwallet_program: UncheckedAccount<'info>,
    /// CHECK: this program's executable account (for CPI authority verification).
    pub program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(params: RequestCrosschainSignParams)]
pub struct RequestCrosschainSign<'info> {
    /// CHECK: card PDA validated in handler.
    #[account(mut)]
    pub card: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
    /// CHECK: Ika DWalletCoordinator PDA.
    pub coordinator: UncheckedAccount<'info>,
    /// CHECK: Ika MessageApproval PDA, populated by CPI.
    #[account(mut)]
    pub message_approval: UncheckedAccount<'info>,
    /// CHECK: Ika dWallet account.
    pub dwallet: UncheckedAccount<'info>,
    /// CHECK: per-card CPI authority PDA.
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: Ika dWallet program.
    pub dwallet_program: UncheckedAccount<'info>,
    /// CHECK: this program's executable account.
    pub program: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordSignedOutcome<'info> {
    /// CHECK: card PDA validated in handler.
    #[account(mut)]
    pub card: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
    // TODO(phase-b): per-request receipt PDA.
}

#[derive(Accounts)]
pub struct RevokeCrosschainCard<'info> {
    /// CHECK: card PDA validated in handler.
    #[account(mut)]
    pub card: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
}

// ── Instruction params ──

/// Initialization payload for `init_crosschain_card`.
///
/// The dWallet must already exist on the Ika program (created off-chain via
/// gRPC DKG). `dwallet_pubkey` is the on-chain `DWallet` account that this
/// card will control. Authority transfer happens in `attach_dwallet_authority`.
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

/// Sign-request payload for `request_crosschain_sign`.
///
/// `message_digest` is the keccak256 of the cross-chain transaction bytes,
/// computed off-chain by the caller. We record the full hash chain
/// (receipt_hash, reason_hash, policy_snapshot_hash, purpose_hash) for
/// receipt parity with existing Settle x402 receipts.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RequestCrosschainSignParams {
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
