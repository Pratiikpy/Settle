use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use crate::{state::*, errors::*, events::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OpenDeliveryEscrowParams {
    pub scope_label_hash: [u8; 32],
    pub amount: u64,
    pub merchant: Pubkey,
    pub capability_hash: [u8; 32],
    pub confirm_deadline_slot: u64,
    pub dispute_deadline_slot: u64,
    pub expiry_slot: u64,
}

/// P9 — Open a delivery-escrow Pact and atomically fund the vault.
///
/// Buyer (= card.authority) signs. The merchant pubkey is pinned at open and cannot be
/// changed by any subsequent ix; that's what makes permissionless release safe (a
/// stranger calling release after the deadline can't redirect funds).
///
/// Deadline invariant: `confirm_deadline_slot ≤ dispute_deadline_slot`. The dispute
/// window must extend at least to the auto-release deadline, otherwise an honest buyer
/// could be auto-released before they have a chance to dispute.
///
/// The Pact's `allowlist` field is used minimally here — we don't actually need it for
/// escrow because the merchant is pinned in the variant payload. We leave it empty.
#[derive(Accounts)]
#[instruction(params: OpenDeliveryEscrowParams)]
pub struct OpenDeliveryEscrow<'info> {
    #[account(mut, address = parent_card.authority @ SettleError::UnauthorizedAuthority)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [AgentCard::SEED_PREFIX, parent_card.authority.as_ref(), parent_card.label_hash.as_ref()],
        bump = parent_card.bump,
    )]
    pub parent_card: Account<'info, AgentCard>,

    #[account(
        init,
        payer = authority,
        space = Pact::SPACE,
        seeds = [Pact::SEED_PREFIX, parent_card.key().as_ref(), params.scope_label_hash.as_ref()],
        bump,
    )]
    pub pact: Account<'info, Pact>,

    /// CHECK: vault PDA — derived from [b"pact-vault", pact.key()]; signer for CPIs.
    #[account(
        seeds = [Pact::VAULT_SEED_PREFIX, pact.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(address = parent_card.usdc_mint @ SettleError::WrongMint)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = authority,
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<OpenDeliveryEscrow>,
    params: OpenDeliveryEscrowParams,
) -> Result<()> {
    require!(params.amount > 0, SettleError::ZeroAmount);
    require!(
        params.amount <= ctx.accounts.parent_card.daily_cap_lamports,
        SettleError::OverCap
    );
    require!(
        params.confirm_deadline_slot <= params.dispute_deadline_slot,
        SettleError::InvalidEscrowDeadlines
    );

    let clock = Clock::get()?;
    let now_slot = clock.slot;
    require!(
        params.dispute_deadline_slot > now_slot,
        SettleError::InvalidEscrowDeadlines
    );
    require!(now_slot < params.expiry_slot, SettleError::CardExpired);

    let pact = &mut ctx.accounts.pact;
    pact.parent_card = ctx.accounts.parent_card.key();
    pact.authority = ctx.accounts.parent_card.authority;
    pact.agent_pubkey = ctx.accounts.parent_card.agent_pubkey;
    pact.scope_label_hash = params.scope_label_hash;
    pact.usdc_mint = ctx.accounts.usdc_mint.key();
    pact.mode = PactMode::DeliveryEscrow {
        amount: params.amount,
        merchant: params.merchant,
        capability_hash: params.capability_hash,
        confirm_deadline_slot: params.confirm_deadline_slot,
        dispute_deadline_slot: params.dispute_deadline_slot,
        released: false,
        refunded: false,
    };
    pact.allowlist = Vec::new();
    pact.expiry_slot = params.expiry_slot;
    pact.closed = false;
    pact.created_at = clock.unix_timestamp;
    pact.bump = ctx.bumps.pact;
    pact.vault_bump = ctx.bumps.vault;

    // Fund the vault from the buyer's USDC ATA.
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.authority_usdc.to_account_info(),
        mint: ctx.accounts.usdc_mint.to_account_info(),
        to: ctx.accounts.vault_usdc.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer_checked(
        CpiContext::new(cpi_program, cpi_accounts),
        params.amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    emit!(DeliveryEscrowOpenedEvent {
        pact: pact.key(),
        parent_card: pact.parent_card,
        vault: ctx.accounts.vault.key(),
        merchant: params.merchant,
        capability_hash: params.capability_hash,
        amount: params.amount,
        confirm_deadline_slot: params.confirm_deadline_slot,
        dispute_deadline_slot: params.dispute_deadline_slot,
        opened_slot: now_slot,
    });

    Ok(())
}
