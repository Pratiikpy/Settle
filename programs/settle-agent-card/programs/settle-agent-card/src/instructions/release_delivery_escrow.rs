use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use crate::{state::*, errors::*, events::*};

/// P9 — Release a delivery-escrow Pact's vault to the pinned merchant.
///
/// Two valid call sites:
///   1. Buyer-side confirm: `caller == pact.authority`. Allowed any time before the
///      pact has already been released or refunded.
///   2. Permissionless post-deadline release: `caller != pact.authority`. Allowed only
///      after `confirm_deadline_slot`. Anyone (including the merchant or a third-party
///      cron) may call this. The merchant is pinned in the variant payload, so a
///      stranger cannot redirect funds.
///
/// Both paths transfer `vault_usdc.amount` (which equals the originally-funded
/// `amount`, modulo any rounding) to the merchant's USDC ATA. The vault PDA signs the
/// CPI as derived signer.
///
/// Reject if `released` or `refunded` is already true.
#[derive(Accounts)]
pub struct ReleaseDeliveryEscrow<'info> {
    /// Caller — may be the buyer (card.authority) or any third party. Pays the tx fee.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [Pact::SEED_PREFIX, pact.parent_card.as_ref(), pact.scope_label_hash.as_ref()],
        bump = pact.bump,
    )]
    pub pact: Account<'info, Pact>,

    /// CHECK: vault PDA, derived from [b"pact-vault", pact.key()]; signs CPI.
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

    /// Merchant's USDC ATA. Validated below: token::authority must equal the merchant
    /// pubkey pinned at open time inside PactMode::DeliveryEscrow.merchant. Without this
    /// check, a stranger could call release-after-deadline with their own ATA and steal
    /// the funds.
    #[account(mut, token::mint = usdc_mint)]
    pub merchant_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<ReleaseDeliveryEscrow>) -> Result<()> {
    let pact = &mut ctx.accounts.pact;
    require!(!pact.closed, SettleError::PactClosed);

    // Pull the variant payload.
    let (amount, merchant, confirm_deadline_slot, released, refunded) = match &pact.mode {
        PactMode::DeliveryEscrow {
            amount,
            merchant,
            confirm_deadline_slot,
            released,
            refunded,
            ..
        } => (*amount, *merchant, *confirm_deadline_slot, *released, *refunded),
        _ => return err!(SettleError::NotDeliveryEscrowMode),
    };

    require!(!released, SettleError::EscrowAlreadyReleased);
    require!(!refunded, SettleError::EscrowAlreadyRefunded);

    // Pin the destination: merchant_usdc must be owned by the pact's pinned merchant.
    require!(
        ctx.accounts.merchant_usdc.owner == merchant,
        SettleError::DestinationOwnerMismatch
    );

    // Caller authorization. Buyer can release any time; anyone else only after deadline.
    let caller_key = ctx.accounts.caller.key();
    let now_slot = Clock::get()?.slot;
    let is_buyer = caller_key == pact.authority;
    if !is_buyer {
        require!(
            now_slot >= confirm_deadline_slot,
            SettleError::EscrowConfirmDeadlineNotPassed
        );
    }

    // Move the funded amount (or whatever sits in vault — they should match) to the
    // merchant. Use vault_usdc.amount in case of dust/rounding edge cases — that's the
    // ground truth.
    let payout = ctx.accounts.vault_usdc.amount.min(amount);
    require!(payout > 0, SettleError::ZeroAmount);

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
        payout,
        ctx.accounts.usdc_mint.decimals,
    )?;

    // Mark released in-place.
    if let PactMode::DeliveryEscrow { released, .. } = &mut pact.mode {
        *released = true;
    }
    pact.closed = true; // terminal state; no further state transitions

    emit!(DeliveryEscrowReleasedEvent {
        pact: pact.key(),
        merchant,
        caller: caller_key,
        is_buyer_confirmed: is_buyer,
        amount: payout,
        slot: now_slot,
    });

    Ok(())
}
