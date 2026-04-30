use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use crate::{state::*, errors::*, events::*};

/// P9 — Dispute a delivery-escrow Pact: refund vault → buyer.
///
/// Buyer-only (= card.authority). Allowed only before `dispute_deadline_slot`. Reject
/// if the escrow is already released or refunded. Sets `refunded = true` and closes
/// the pact.
///
/// Distinct from `close_pact` because of the timing constraint and a different event
/// for the unified ledger. close_pact is authority-discretion any-time; this is the
/// "I didn't get what I paid for" code path with on-chain evidence.
#[derive(Accounts)]
pub struct DisputeDeliveryEscrow<'info> {
    #[account(mut, address = pact.authority @ SettleError::UnauthorizedAuthority)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Pact::SEED_PREFIX, pact.parent_card.as_ref(), pact.scope_label_hash.as_ref()],
        bump = pact.bump,
    )]
    pub pact: Account<'info, Pact>,

    /// CHECK: vault PDA, derived; signs CPI.
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

    /// Buyer's USDC ATA, where the refund lands.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = authority,
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<DisputeDeliveryEscrow>) -> Result<()> {
    let pact = &mut ctx.accounts.pact;
    require!(!pact.closed, SettleError::PactClosed);

    let (dispute_deadline_slot, released, refunded) = match &pact.mode {
        PactMode::DeliveryEscrow {
            dispute_deadline_slot,
            released,
            refunded,
            ..
        } => (*dispute_deadline_slot, *released, *refunded),
        _ => return err!(SettleError::NotDeliveryEscrowMode),
    };

    require!(!released, SettleError::EscrowAlreadyReleased);
    require!(!refunded, SettleError::EscrowAlreadyRefunded);

    let now_slot = Clock::get()?.slot;
    require!(
        now_slot < dispute_deadline_slot,
        SettleError::EscrowDisputeWindowClosed
    );

    let refund_amount = ctx.accounts.vault_usdc.amount;
    require!(refund_amount > 0, SettleError::ZeroAmount);

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
        to: ctx.accounts.authority_usdc.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer_checked(
        CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds),
        refund_amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    if let PactMode::DeliveryEscrow { refunded, .. } = &mut pact.mode {
        *refunded = true;
    }
    pact.closed = true;

    emit!(DeliveryEscrowDisputedEvent {
        pact: pact.key(),
        authority: pact.authority,
        amount: refund_amount,
        slot: now_slot,
    });

    Ok(())
}
