use anchor_lang::prelude::*;
use crate::{state::*, errors::*, events::*};

/// Authority-only "pause" of a Streaming Pact.
///
/// While paused, no entitlement accrues for `claim_streaming`. The pause is recorded by
/// stamping `pause_started_slot = now`. On `resume_streaming` (or on the next claim with
/// paused still true), the elapsed pause is added to `pause_accumulated_slots` so it
/// doesn't count toward billable time.
///
/// Idempotent: pausing an already-paused pact is a no-op.
#[derive(Accounts)]
pub struct PauseStreaming<'info> {
    #[account(address = pact.authority @ SettleError::UnauthorizedAuthority)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Pact::SEED_PREFIX, pact.parent_card.as_ref(), pact.scope_label_hash.as_ref()],
        bump = pact.bump,
    )]
    pub pact: Account<'info, Pact>,
}

pub fn handler(ctx: Context<PauseStreaming>) -> Result<()> {
    let pact = &mut ctx.accounts.pact;
    require!(!pact.closed, SettleError::PactClosed);

    let now_slot = Clock::get()?.slot;

    match &mut pact.mode {
        PactMode::Streaming {
            paused,
            pause_started_slot,
            ..
        } => {
            if !*paused {
                *paused = true;
                *pause_started_slot = now_slot;
                emit!(PactStreamPauseEvent {
                    pact: pact.key(),
                    paused: true,
                    slot: now_slot,
                });
            }
            // Already paused → no-op (idempotent).
            Ok(())
        }
        PactMode::OneShot { .. } | PactMode::DeliveryEscrow { .. } => {
            err!(SettleError::NotStreamingMode)
        }
    }
}
