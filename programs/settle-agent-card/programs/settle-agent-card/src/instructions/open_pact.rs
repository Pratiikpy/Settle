use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use crate::{state::*, errors::*, events::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OpenPactParams {
    pub scope_label_hash: [u8; 32],
    pub cap_lamports: u64,
    pub allowlist: Vec<AllowlistEntry>, // strict subset of parent (validated below)
    pub expiry_slot: u64,
}

/// Open a Pact and atomically fund its Vault PDA's USDC ATA.
///
/// In a single ix the authority:
///   1. Creates the Pact PDA
///   2. Initializes the Vault PDA's USDC ATA (rent-funded by authority)
///   3. Transfers `cap_lamports` USDC from authority's ATA → Vault's ATA
///
/// After this ix, `spend_via_pact` can run autonomously without authority signatures.
/// The authority can reclaim unspent funds via `close_pact` at any time.
#[derive(Accounts)]
#[instruction(params: OpenPactParams)]
pub struct OpenPact<'info> {
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

    /// Authority's USDC ATA (source of funding).
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = authority,
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    /// Vault's USDC ATA (init if needed; authority pays rent).
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

pub fn handler(ctx: Context<OpenPact>, params: OpenPactParams) -> Result<()> {
    require!(
        params.allowlist.len() <= MAX_PACT_ALLOWLIST,
        SettleError::PactAllowlistTooLong
    );
    require!(params.cap_lamports > 0, SettleError::ZeroAmount);
    require!(
        params.cap_lamports <= ctx.accounts.parent_card.daily_cap_lamports,
        SettleError::OverCap
    );

    // Strict subset check: every pact merchant + capability MUST appear identically in the
    // parent allowlist. Capability hashes must match exactly (None vs Some(h) is significant).
    for pact_entry in params.allowlist.iter() {
        let parent_match = ctx
            .accounts
            .parent_card
            .allowlist
            .iter()
            .find(|e| e.merchant_pubkey == pact_entry.merchant_pubkey)
            .ok_or(SettleError::OffAllowlist)?;
        // Pact entry must be at-least-as-restrictive: if parent has Some(h), pact must equal.
        // Pact may pin a capability the parent doesn't (tighter scope is allowed).
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

    pact.parent_card = ctx.accounts.parent_card.key();
    pact.authority = ctx.accounts.parent_card.authority;
    pact.agent_pubkey = ctx.accounts.parent_card.agent_pubkey;
    pact.scope_label_hash = params.scope_label_hash;
    pact.usdc_mint = ctx.accounts.usdc_mint.key();
    pact.mode = PactMode::OneShot {
        cap_lamports: params.cap_lamports,
        spent: 0,
    };
    pact.allowlist = params.allowlist.clone();
    pact.expiry_slot = params.expiry_slot;
    pact.closed = false;
    pact.created_at = clock.unix_timestamp;
    pact.bump = ctx.bumps.pact;
    pact.vault_bump = ctx.bumps.vault;

    // Fund the vault: TransferChecked from authority → vault ATA, exactly cap_lamports.
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.authority_usdc.to_account_info(),
        mint: ctx.accounts.usdc_mint.to_account_info(),
        to: ctx.accounts.vault_usdc.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer_checked(
        CpiContext::new(cpi_program, cpi_accounts),
        params.cap_lamports,
        ctx.accounts.usdc_mint.decimals,
    )?;

    emit!(PactOpenedEvent {
        pact: pact.key(),
        parent_card: pact.parent_card,
        vault: ctx.accounts.vault.key(),
        cap: params.cap_lamports,
        funded_amount: params.cap_lamports,
        expiry_slot: pact.expiry_slot,
        allowlist_count: pact.allowlist.len() as u8,
    });

    Ok(())
}
