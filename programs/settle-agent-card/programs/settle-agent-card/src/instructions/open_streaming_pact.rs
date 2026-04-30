use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use crate::{state::*, errors::*, events::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OpenStreamingPactParams {
    pub scope_label_hash: [u8; 32],
    pub rate_lamports_per_slot: u64,
    pub max_total_lamports: u64,
    pub allowlist: Vec<AllowlistEntry>,
    pub expiry_slot: u64,
}

/// Open a Streaming Pact and atomically fund its Vault PDA's USDC ATA.
///
/// In a single ix the authority:
///   1. Creates the Pact PDA with `PactMode::Streaming { rate, max_total, ... }`
///   2. Initializes the Vault PDA's USDC ATA (rent-funded by authority)
///   3. Transfers `max_total_lamports` USDC from authority's ATA → Vault's ATA
///
/// After this ix, `claim_streaming` can run autonomously without authority signatures.
/// Entitlement accrues at `rate_lamports_per_slot` per slot from the open slot forward.
/// The authority retains custody control via `pause_streaming` / `resume_streaming` /
/// `close_pact` (which refunds the unspent balance).
///
/// PDA seeds match `OpenPact` exactly: `[b"pact", parent_card.key(), scope_label_hash]`.
/// A given (parent_card, scope_label_hash) pair can only host ONE pact, OneShot OR
/// Streaming. The authority chooses which mode at open time.
#[derive(Accounts)]
#[instruction(params: OpenStreamingPactParams)]
pub struct OpenStreamingPact<'info> {
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

    /// CHECK: vault PDA (no data, no init); only used as a derived signer for token CPIs.
    #[account(
        seeds = [Pact::VAULT_SEED_PREFIX, pact.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    /// USDC mint, must equal parent_card.usdc_mint.
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

pub fn handler(ctx: Context<OpenStreamingPact>, params: OpenStreamingPactParams) -> Result<()> {
    require!(
        params.allowlist.len() <= MAX_PACT_ALLOWLIST,
        SettleError::PactAllowlistTooLong
    );
    require!(params.rate_lamports_per_slot > 0, SettleError::ZeroAmount);
    require!(params.max_total_lamports > 0, SettleError::ZeroAmount);
    require!(
        params.max_total_lamports <= ctx.accounts.parent_card.daily_cap_lamports,
        SettleError::OverCap
    );

    // Strict subset check on the allowlist — same rules as OneShot open_pact.
    for pact_entry in params.allowlist.iter() {
        let parent_match = ctx
            .accounts
            .parent_card
            .allowlist
            .iter()
            .find(|e| e.merchant_pubkey == pact_entry.merchant_pubkey)
            .ok_or(SettleError::OffAllowlist)?;
        if let Some(parent_pin) = parent_match.capability_hash {
            match pact_entry.capability_hash {
                Some(pact_pin) => require!(
                    pact_pin == parent_pin,
                    SettleError::CapabilityNotPinned
                ),
                None => return err!(SettleError::CapabilityNotPinned),
            }
        }
    }

    let pact = &mut ctx.accounts.pact;
    let clock = Clock::get()?;
    let now_slot = clock.slot;

    require!(now_slot < params.expiry_slot, SettleError::CardExpired);

    pact.parent_card = ctx.accounts.parent_card.key();
    pact.authority = ctx.accounts.parent_card.authority;
    pact.agent_pubkey = ctx.accounts.parent_card.agent_pubkey;
    pact.scope_label_hash = params.scope_label_hash;
    pact.usdc_mint = ctx.accounts.usdc_mint.key();
    pact.mode = PactMode::Streaming {
        rate_lamports_per_slot: params.rate_lamports_per_slot,
        max_total_lamports: params.max_total_lamports,
        claimed: 0,
        last_claim_slot: now_slot,
        paused: false,
        pause_started_slot: 0,
        pause_accumulated_slots: 0,
    };
    pact.allowlist = params.allowlist.clone();
    pact.expiry_slot = params.expiry_slot;
    pact.closed = false;
    pact.created_at = clock.unix_timestamp;
    pact.bump = ctx.bumps.pact;
    pact.vault_bump = ctx.bumps.vault;

    // Fund the vault: TransferChecked from authority → vault ATA, exactly max_total_lamports.
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.authority_usdc.to_account_info(),
        mint: ctx.accounts.usdc_mint.to_account_info(),
        to: ctx.accounts.vault_usdc.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer_checked(
        CpiContext::new(cpi_program, cpi_accounts),
        params.max_total_lamports,
        ctx.accounts.usdc_mint.decimals,
    )?;

    emit!(StreamingPactOpenedEvent {
        pact: pact.key(),
        parent_card: pact.parent_card,
        vault: ctx.accounts.vault.key(),
        rate_lamports_per_slot: params.rate_lamports_per_slot,
        max_total_lamports: params.max_total_lamports,
        funded_amount: params.max_total_lamports,
        opened_slot: now_slot,
        expiry_slot: pact.expiry_slot,
        allowlist_count: pact.allowlist.len() as u8,
    });

    Ok(())
}
