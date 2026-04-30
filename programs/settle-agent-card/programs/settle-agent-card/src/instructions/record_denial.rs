use anchor_lang::prelude::*;
use crate::{state::*, errors::*, events::*};

#[derive(Accounts)]
pub struct RecordDenial<'info> {
    /// Either the card's authority OR its agent_pubkey may sign a denial.
    /// - Authority can record DENYs in direct (legacy) mode.
    /// - Agent can record DENYs in pact mode (where the agent is the only signer
    ///   the proxy holds; without this, pact-mode DENYs would never land on-chain
    ///   and the unified ledger would be incomplete).
    pub signer: Signer<'info>,

    #[account(
        seeds = [AgentCard::SEED_PREFIX, card.authority.as_ref(), card.label_hash.as_ref()],
        bump = card.bump,
        constraint = (signer.key() == card.authority || signer.key() == card.agent_pubkey)
            @ SettleError::UnauthorizedAuthority,
    )]
    pub card: Account<'info, AgentCard>,
}

/// Records a denial that was decided off-chain (e.g. nonce replay caught in middleware,
/// user_declined_review, merchant_not_verified). Closes the unified-ledger gap so EVERY
/// off-chain DENY lands on-chain via PolicyDecisionEvent (decision=1 DENY).
///
/// Acceptable signers: card.authority OR card.agent_pubkey. Both are pinned at create_card
/// time, so neither can be spoofed; only those two pubkeys can pollute a card's denial
/// stream, and both have legitimate reasons to.
pub fn handler(
    ctx: Context<RecordDenial>,
    deny_code: u8,
    merchant: Pubkey,
    pact: Pubkey,
    receipt_hash: [u8; 32],
    reason_hash: [u8; 32],
    policy_snapshot_hash: [u8; 32],
) -> Result<()> {
    let _ = DenyCode::from_u8(deny_code).ok_or(SettleError::InvalidDenyCode)?;

    let card = &ctx.accounts.card;
    let clock = Clock::get()?;

    emit!(PolicyDecisionEvent {
        card: card.key(),
        merchant,
        decision: 1, // DENY
        deny_code,
        amount: 0,
        receipt_hash,
        reason_hash,
        policy_snapshot_hash,
        slot: clock.slot,
        policy_version: card.policy_version,
        pact,
    });

    Ok(())
}
