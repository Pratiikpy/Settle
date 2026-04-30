use anchor_lang::prelude::*;
use crate::{state::*, errors::*, events::*};

#[derive(Accounts)]
pub struct Revoke<'info> {
    #[account(address = card.authority @ SettleError::UnauthorizedAuthority)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [AgentCard::SEED_PREFIX, card.authority.as_ref(), card.label_hash.as_ref()],
        bump = card.bump,
    )]
    pub card: Account<'info, AgentCard>,
}

/// Idempotent revoke. Re-revoking is a no-op rather than an error so the UI can fire-and-forget.
/// Bumps `policy_version` and emits both:
///   - PolicyDecisionEvent (decision=2 REVOKE) so the unified ledger captures it
///   - CardRevokedEvent (legacy event, kept for backward-compat)
pub fn handler(ctx: Context<Revoke>) -> Result<()> {
    let card = &mut ctx.accounts.card;
    let clock = Clock::get()?;

    let was_revoked = card.revoked;
    if !was_revoked {
        card.revoked = true;
        card.policy_version = card.policy_version.saturating_add(1);
    }

    // Always emit (even on idempotent re-revoke), so the indexer logs the action.
    emit!(PolicyDecisionEvent {
        card: card.key(),
        merchant: Pubkey::default(),
        decision: 2, // REVOKE
        deny_code: DenyCode::Revoked as u8,
        amount: 0,
        receipt_hash: [0u8; 32],
        reason_hash: [0u8; 32],
        policy_snapshot_hash: [0u8; 32],
        slot: clock.slot,
        policy_version: card.policy_version,
        pact: Pubkey::default(),
    });

    emit!(CardRevokedEvent {
        card: card.key(),
        authority: card.authority,
        policy_version: card.policy_version,
        slot: clock.slot,
    });

    Ok(())
}
