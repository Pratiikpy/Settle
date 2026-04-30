use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use crate::{state::*, errors::*, events::*};

/// Close a Pact and refund unspent USDC on-chain.
///
/// In a single ix:
///   1. TransferChecked vault_usdc.amount → authority_usdc, signed by Vault PDA
///   2. Mark pact.closed = true
///   3. Emit PactClosedEvent
///
/// The authority retains custody control: they can close at any time, even if the agent
/// still has time and unspent budget. Authority's own signature is required (the agent
/// cannot close).
#[derive(Accounts)]
pub struct ClosePact<'info> {
    #[account(mut, address = pact.authority @ SettleError::UnauthorizedAuthority)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Pact::SEED_PREFIX, pact.parent_card.as_ref(), pact.scope_label_hash.as_ref()],
        bump = pact.bump,
    )]
    pub pact: Account<'info, Pact>,

    /// CHECK: vault PDA derived from [b"pact-vault", pact.key()]
    #[account(
        seeds = [Pact::VAULT_SEED_PREFIX, pact.key().as_ref()],
        bump = pact.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(address = pact.usdc_mint @ SettleError::WrongMint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = authority,
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<ClosePact>) -> Result<()> {
    let pact = &mut ctx.accounts.pact;
    require!(!pact.closed, SettleError::PactClosed);

    let remaining = ctx.accounts.vault_usdc.amount;

    // Refund any unspent balance to authority via TransferChecked, signed by Vault PDA.
    if remaining > 0 {
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
            remaining,
            ctx.accounts.usdc_mint.decimals,
        )?;
    }

    // close_pact is the universal "authority reclaims the vault" path for OneShot and
    // Streaming. DeliveryEscrow has its own state machine — the buyer must use
    // dispute_delivery_escrow within the dispute window or wait for release. Allowing
    // close_pact on DeliveryEscrow would let the buyer drain the vault outside the
    // merchant-protective timing window.
    require!(
        !matches!(pact.mode, PactMode::DeliveryEscrow { .. }),
        SettleError::NotOneShotMode
    );

    pact.closed = true;
    let clock = Clock::get()?;

    // For the event, report spent (OneShot) or claimed (Streaming) — both represent
    // "USDC actually delivered" for indexer reporting. The refund_amount is the actual
    // remaining vault balance, which is mode-agnostic.
    let spent_or_claimed = match pact.mode {
        PactMode::OneShot { spent, .. } => spent,
        PactMode::Streaming { claimed, .. } => claimed,
        PactMode::DeliveryEscrow { .. } => 0, // unreachable due to require above
    };

    emit!(PactClosedEvent {
        pact: pact.key(),
        parent_card: pact.parent_card,
        spent: spent_or_claimed,
        refund_amount: remaining,
        slot: clock.slot,
    });

    Ok(())
}
