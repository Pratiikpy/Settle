use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use crate::{state::*, errors::*, events::*};

/// Authority-signed spend (legacy / direct mode).
///
/// Order of operations (mirrors policy decision tree):
///   1. revoked / expired → deny
///   2. cap window reset if needed
///   3. per_call_max + daily_cap (Q2 lock — both enforced on-chain)
///   4. allowlist match by merchant; if entry has Some(capability_hash), require pin
///      against the `capability_hash` ix arg (real on-chain capability enforcement)
///   5. CPI TransferChecked (mint + decimals validated by SPL token program)
///   6. emit PolicyDecisionEvent::ALLOW
///
/// `merchant_owner` MUST own `merchant_usdc` (enforced via `token::authority` constraint
/// on `merchant_usdc`). `usdc_mint` MUST equal `card.usdc_mint`. `authority_usdc` MUST
/// have `authority` as authority and `usdc_mint` as mint. These constraints prevent the
/// "any mutable token account" exploit.
#[derive(Accounts)]
#[instruction(amount: u64, capability_hash: [u8; 32])]
pub struct Spend<'info> {
    #[account(mut, address = card.authority @ SettleError::UnauthorizedAuthority)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [AgentCard::SEED_PREFIX, card.authority.as_ref(), card.label_hash.as_ref()],
        bump = card.bump,
    )]
    pub card: Account<'info, AgentCard>,

    /// USDC mint, pinned to card.usdc_mint.
    #[account(address = card.usdc_mint @ SettleError::WrongMint)]
    pub usdc_mint: Account<'info, Mint>,

    /// Authority's USDC token account (source) — must hold the pinned mint.
    #[account(mut, token::authority = authority, token::mint = usdc_mint)]
    pub authority_usdc: Account<'info, TokenAccount>,

    /// Merchant's USDC token account (destination) — must be owned by `merchant_owner`
    /// and hold the pinned mint.
    #[account(mut, token::authority = merchant_owner, token::mint = usdc_mint)]
    pub merchant_usdc: Account<'info, TokenAccount>,

    /// CHECK: merchant pubkey, validated against allowlist below.
    pub merchant_owner: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<Spend>,
    amount: u64,
    capability_hash: [u8; 32],
    receipt_hash: [u8; 32],
    reason_hash: [u8; 32],
    policy_snapshot_hash: [u8; 32],
) -> Result<()> {
    require!(amount > 0, SettleError::ZeroAmount);

    let card = &mut ctx.accounts.card;
    let clock = Clock::get()?;
    let now_slot = clock.slot;

    // 1. revoked / expired
    require!(!card.revoked, SettleError::CardRevoked);
    require!(now_slot < card.expiry_slot, SettleError::CardExpired);

    // 2. slot-based cap window reset
    if now_slot.saturating_sub(card.last_reset_slot) >= AgentCard::CAP_WINDOW_SLOTS {
        card.used_today = 0;
        card.last_reset_slot = now_slot;
    }

    // 3. per_call_max + daily_cap
    require!(amount <= card.per_call_max_lamports, SettleError::OverCap);
    let new_total = card
        .used_today
        .checked_add(amount)
        .ok_or(SettleError::OverCap)?;
    require!(new_total <= card.daily_cap_lamports, SettleError::OverCap);

    // 4. allowlist + capability pin
    let merchant = ctx.accounts.merchant_owner.key();
    let entry = card
        .allowlist
        .iter()
        .find(|e| e.merchant_pubkey == merchant)
        .ok_or(SettleError::OffAllowlist)?;
    if let Some(pinned) = entry.capability_hash {
        require!(pinned == capability_hash, SettleError::CapabilityNotPinned);
    }

    // 5. CPI TransferChecked
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.authority_usdc.to_account_info(),
        mint: ctx.accounts.usdc_mint.to_account_info(),
        to: ctx.accounts.merchant_usdc.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer_checked(
        CpiContext::new(cpi_program, cpi_accounts),
        amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    card.used_today = new_total;

    // 6. emit
    emit!(PolicyDecisionEvent {
        card: card.key(),
        merchant,
        decision: 0, // ALLOW
        deny_code: 0,
        amount,
        receipt_hash,
        reason_hash,
        policy_snapshot_hash,
        slot: now_slot,
        policy_version: card.policy_version,
        pact: Pubkey::default(),
    });

    Ok(())
}
