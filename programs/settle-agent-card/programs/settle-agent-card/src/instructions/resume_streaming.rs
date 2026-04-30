use anchor_lang::prelude::*;
use crate::{state::*, errors::*, events::*};

/// Authority-only "resume" of a paused Streaming Pact.
///
/// Closes out the in-flight pause by adding (now - pause_started_slot) to
/// `pause_accumulated_slots` so subsequent claims correctly subtract it from billable
/// time. Clears the pause flag.
///
/// Idempotent: resuming a non-paused pact is a no-op.
#[derive(Accounts)]
pub struct ResumeStreaming<'info> {
    #[account(address = pact.authority @ SettleError::UnauthorizedAuthority)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Pact::SEED_PREFIX, pact.parent_card.as_ref(), pact.scope_label_hash.as_ref()],
        bump = pact.bump,
    )]
    pub pact: Account<'info, Pact>,
}

pub fn handler(ctx: Context<ResumeStreaming>) -> Result<()> {
    let pact = &mut ctx.accounts.pact;
    require!(!pact.closed, SettleError::PactClosed);

    let now_slot = Clock::get()?.slot;

    match &mut pact.mode {
        PactMode::Streaming {
            paused,
            pause_started_slot,
            pause_accumulated_slots,
            ..
        } => {
            if *paused {
                let pause_dur = now_slot.saturating_sub(*pause_started_slot);
                *pause_accumulated_slots = pause_accumulated_slots.saturating_add(pause_dur);
                *paused = false;
                *pause_started_slot = 0;
                emit!(PactStreamPauseEvent {
                    pact: pact.key(),
                    paused: false,
                    slot: now_slot,
                });
            }
            // Not paused → no-op.
            Ok(())
        }
        PactMode::OneShot { .. } | PactMode::DeliveryEscrow { .. } => {
            err!(SettleError::NotStreamingMode)
        }
    }
}
