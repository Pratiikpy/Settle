use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use crate::{state::*, errors::*, events::*};

/// Streaming pact claim — the agent draws down accrued entitlement.
///
/// Slot accounting:
///   billable_slots = (now_slot - last_claim_slot) - pause_accumulated_slots
///                    where pause_accumulated_slots includes the in-flight pause if
///                    currently paused (pause_started_slot..now_slot).
///   entitlement = billable_slots * rate, capped at (max_total - claimed).
///
/// After claim, last_claim_slot ← now_slot and pause_accumulated_slots ← 0. If still
/// paused, pause_started_slot is bumped to now_slot so subsequent paused time accrues
/// correctly (without retroactively charging the just-claimed period).
///
/// Cross-Pact daily cap: same as `spend_via_pact`, every claim updates parent
/// card.used_today. A streaming pact and a oneshot pact on the same parent card cannot
/// jointly exceed the parent's daily cap.
///
/// Allowlist + capability pin: identical semantics to `spend_via_pact`. The merchant
/// must be on `pact.allowlist`; if the entry pins a capability_hash, the ix arg must
/// match exactly. This means a streaming agent paying *multiple* merchants can do so by
/// passing different `merchant_owner` accounts in successive claims — but each claim
/// goes to exactly one merchant.
#[derive(Accounts)]
#[instruction(capability_hash: [u8; 32])]
pub struct ClaimStreaming<'info> {
    /// Agent signer — must equal card.agent_pubkey. The user does NOT sign per-claim.
    #[account(address = card.agent_pubkey @ SettleError::UnauthorizedAgent)]
    pub agent: Signer<'info>,

    /// Fee payer (typically the agent itself).
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    #[account(
        mut,
        seeds = [AgentCard::SEED_PREFIX, card.authority.as_ref(), card.label_hash.as_ref()],
        bump = card.bump,
    )]
    pub card: Account<'info, AgentCard>,

    #[account(
        mut,
        seeds = [Pact::SEED_PREFIX, pact.parent_card.as_ref(), pact.scope_label_hash.as_ref()],
        bump = pact.bump,
        constraint = pact.parent_card == card.key() @ SettleError::PactCardMismatch,
    )]
    pub pact: Account<'info, Pact>,

    /// CHECK: vault PDA derived from [b"pact-vault", pact.key()]; signs the CPI.
    #[account(
        seeds = [Pact::VAULT_SEED_PREFIX, pact.key().as_ref()],
        bump = pact.vault_bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(address = pact.usdc_mint @ SettleError::WrongMint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(mut, token::authority = merchant_owner, token::mint = usdc_mint)]
    pub merchant_usdc: Account<'info, TokenAccount>,

    /// CHECK: merchant pubkey, validated against pact.allowlist below.
    pub merchant_owner: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(
    ctx: Context<ClaimStreaming>,
    capability_hash: [u8; 32],
    receipt_hash: [u8; 32],
    reason_hash: [u8; 32],
    policy_snapshot_hash: [u8; 32],
) -> Result<()> {
    let card = &mut ctx.accounts.card;
    let pact = &mut ctx.accounts.pact;
    let clock = Clock::get()?;
    let now_slot = clock.slot;

    // Card state
    require!(!card.revoked, SettleError::CardRevoked);
    require!(now_slot < card.expiry_slot, SettleError::CardExpired);

    // Pact state
    require!(!pact.closed, SettleError::PactClosed);
    require!(now_slot < pact.expiry_slot, SettleError::CardExpired);

    // Mode + extract Streaming fields. The match-and-mutate dance: read what we need,
    // compute the entitlement, then mutate the variant in-place at the end.
    let (
        rate,
        max_total,
        claimed,
        last_claim_slot,
        is_paused,
        pause_started_slot,
        pause_accumulated_slots,
    ) = match &pact.mode {
        PactMode::Streaming {
            rate_lamports_per_slot,
            max_total_lamports,
            claimed,
            last_claim_slot,
            paused,
            pause_started_slot,
            pause_accumulated_slots,
        } => (
            *rate_lamports_per_slot,
            *max_total_lamports,
            *claimed,
            *last_claim_slot,
            *paused,
            *pause_started_slot,
            *pause_accumulated_slots,
        ),
        PactMode::OneShot { .. } | PactMode::DeliveryEscrow { .. } => {
            return err!(SettleError::NotStreamingMode);
        }
    };

    // Finalize any in-flight pause: if currently paused, the slots from pause_started up
    // to now also count as "accumulated paused" within this claim period.
    let total_paused_in_period = if is_paused {
        // Defensive: now should always be >= pause_started, but use saturating sub.
        pause_accumulated_slots.saturating_add(now_slot.saturating_sub(pause_started_slot))
    } else {
        pause_accumulated_slots
    };

    let elapsed = now_slot.saturating_sub(last_claim_slot);
    let billable_slots = elapsed.saturating_sub(total_paused_in_period);
    require!(billable_slots > 0, SettleError::NothingToClaim);

    // entitlement = billable_slots * rate, but cap at (max_total - claimed).
    let entitlement = billable_slots
        .checked_mul(rate)
        .ok_or(SettleError::PactOverCap)?;
    let remaining_budget = max_total.saturating_sub(claimed);
    let amount = entitlement.min(remaining_budget);
    require!(amount > 0, SettleError::StreamMaxReached);

    // AU-03-006 fix: removed the `amount <= per_call_max` check that previously
    // permanently stuck the pact when accrued entitlement exceeded per_call_max
    // (every claim reverted, last_claim_slot never advanced, entitlement kept
    // growing — agent had to close pact and forfeit funds).
    //
    // Why the check was redundant: claim_streaming computes `amount` from
    // entitlement (= rate × billable_slots × time-since-last-claim). The agent
    // cannot pass an arbitrary amount. So `per_call_max` (which exists to
    // bound user-supplied amounts in spend_via_pact) cannot protect against
    // anything in the streaming path that the rate doesn't already bound.
    // Daily cap (`card.used_today` + `card.daily_cap_lamports`) still
    // enforces total throughput.

    // ────────────────────────────────────────────────────────────────────
    // Daily cap window reset + enforcement (same logic as spend_via_pact).
    // ────────────────────────────────────────────────────────────────────
    if now_slot.saturating_sub(card.last_reset_slot) >= AgentCard::CAP_WINDOW_SLOTS {
        card.used_today = 0;
        card.last_reset_slot = now_slot;
    }
    let new_card_total = card
        .used_today
        .checked_add(amount)
        .ok_or(SettleError::OverCap)?;
    require!(new_card_total <= card.daily_cap_lamports, SettleError::OverCap);

    // Allowlist + capability pin
    let merchant = ctx.accounts.merchant_owner.key();
    let entry = pact
        .allowlist
        .iter()
        .find(|e| e.merchant_pubkey == merchant)
        .ok_or(SettleError::OffAllowlist)?;
    if let Some(pinned) = entry.capability_hash {
        require!(pinned == capability_hash, SettleError::CapabilityNotPinned);
    }

    // CPI TransferChecked, signed by Vault PDA.
    let pact_key = pact.key();
    let vault_bump = [pact.vault_bump];
    let vault_seeds: &[&[u8]] = &[
        Pact::VAULT_SEED_PREFIX,
        pact_key.as_ref(),
        &vault_bump,
    ];
    let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault_usdc.to_account_info(),
        mint: ctx.accounts.usdc_mint.to_account_info(),
        to: ctx.accounts.merchant_usdc.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer_checked(
        CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds),
        amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    let new_claimed = claimed.saturating_add(amount);

    // Mutate the streaming state in-place. After claim:
    //   - last_claim_slot = now
    //   - pause_accumulated_slots = 0 (next period starts fresh)
    //   - if still paused: pause_started_slot = now (so subsequent pause-time accrues
    //     from this point, not from the original pause start).
    if let PactMode::Streaming {
        claimed,
        last_claim_slot,
        pause_started_slot,
        pause_accumulated_slots,
        paused,
        ..
    } = &mut pact.mode
    {
        *claimed = new_claimed;
        *last_claim_slot = now_slot;
        *pause_accumulated_slots = 0;
        if *paused {
            *pause_started_slot = now_slot;
        } else {
            *pause_started_slot = 0;
        }
    }

    card.used_today = new_card_total;

    let max_remaining_after = max_total.saturating_sub(new_claimed);

    emit!(PolicyDecisionEvent {
        card: card.key(),
        merchant,
        decision: 0,
        deny_code: 0,
        amount,
        receipt_hash,
        reason_hash,
        policy_snapshot_hash,
        slot: now_slot,
        policy_version: card.policy_version,
        pact: pact.key(),
    });

    emit!(PactStreamClaimEvent {
        pact: pact.key(),
        card: card.key(),
        merchant,
        amount,
        billable_slots,
        claimed_after: new_claimed,
        max_remaining_after,
        slot: now_slot,
    });

    Ok(())
}
