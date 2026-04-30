use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use crate::{state::*, errors::*, events::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateCardParams {
    pub agent_pubkey: Pubkey,
    pub label_hash: [u8; 32],
    pub daily_cap_lamports: u64,
    pub per_call_max_lamports: u64,
    pub allowlist: Vec<AllowlistEntry>,
    pub expiry_slot: u64,
    pub policy_version: u32,
}

#[derive(Accounts)]
#[instruction(params: CreateCardParams)]
pub struct CreateCard<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = AgentCard::SPACE,
        seeds = [AgentCard::SEED_PREFIX, authority.key().as_ref(), params.label_hash.as_ref()],
        bump
    )]
    pub card: Account<'info, AgentCard>,

    /// USDC mint pinned at creation; spend rejects any other mint.
    pub usdc_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateCard>, params: CreateCardParams) -> Result<()> {
    require!(
        params.allowlist.len() <= MAX_ALLOWLIST,
        SettleError::AllowlistTooLong
    );
    require!(params.daily_cap_lamports > 0, SettleError::ZeroAmount);
    require!(params.per_call_max_lamports > 0, SettleError::ZeroAmount);
    require!(
        params.per_call_max_lamports <= params.daily_cap_lamports,
        SettleError::OverCap
    );

    let card = &mut ctx.accounts.card;
    let clock = Clock::get()?;

    card.authority = ctx.accounts.authority.key();
    card.agent_pubkey = params.agent_pubkey;
    card.label_hash = params.label_hash;
    card.usdc_mint = ctx.accounts.usdc_mint.key();
    card.daily_cap_lamports = params.daily_cap_lamports;
    card.per_call_max_lamports = params.per_call_max_lamports;
    card.used_today = 0;
    card.last_reset_slot = clock.slot;
    card.allowlist = params.allowlist.clone();
    card.expiry_slot = params.expiry_slot;
    card.revoked = false;
    card.policy_version = params.policy_version;
    card.created_at = clock.unix_timestamp;
    card.bump = ctx.bumps.card;

    emit!(CardCreatedEvent {
        card: card.key(),
        authority: card.authority,
        agent_pubkey: card.agent_pubkey,
        usdc_mint: card.usdc_mint,
        daily_cap: card.daily_cap_lamports,
        per_call_max: card.per_call_max_lamports,
        allowlist_count: card.allowlist.len() as u8,
        expiry_slot: card.expiry_slot,
        policy_version: card.policy_version,
    });

    Ok(())
}
