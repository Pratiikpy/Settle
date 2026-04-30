use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use crate::{state::*, errors::*, events::*};

/// Pact-scoped autonomous spend.
///
/// THIS is the architectural primitive that makes Settle's pitch real: an agent can
/// spend on behalf of a user WITHOUT the user signing per-spend.
///
/// How it works:
///   - At `open_pact`, the user funds a Vault PDA's USDC ATA with `cap_lamports`.
///     The Vault PDA is `[b"pact-vault", pact.key()]` — it has no data, only a derived
///     address; the program signs CPIs as this PDA.
///   - At spend time, the agent (whose pubkey is fixed at `card.agent_pubkey`) signs
///     the ix. The program then signs the TransferChecked CPI as the Vault PDA.
///   - The user is never prompted at spend time. Their custody control is: they can
///     `close_pact` at any time and reclaim unspent funds.
///
/// Policy enforced on-chain (every check is real, no off-chain trust):
///   - card not revoked, not expired
///   - pact not closed, not expired
///   - amount ≤ card.per_call_max_lamports (per-call cap, inherited from card)
///   - **card.used_today + amount ≤ card.daily_cap_lamports** (daily cap inherited from
///     the parent card; multiple Pacts CANNOT bypass this because every spend updates
///     the parent card's used_today)
///   - pact.spent + amount ≤ pact.cap_lamports (pact's local cap)
///   - merchant in pact.allowlist
///   - if allowlist entry has Some(capability_hash) → require equal to the ix arg
///   - mint matches pact.usdc_mint (pinned at open_pact)
///   - merchant_usdc is owned by merchant_owner (no destination redirection)
///   - decimals validated by TransferChecked itself
#[derive(Accounts)]
#[instruction(amount: u64, capability_hash: [u8; 32])]
pub struct SpendViaPact<'info> {
    /// Agent signer — must equal card.agent_pubkey.
    /// This is the only Signer in the ix; the user does NOT sign per-spend.
    #[account(address = card.agent_pubkey @ SettleError::UnauthorizedAgent)]
    pub agent: Signer<'info>,

    /// Fee payer (typically the same as agent, but doesn't have to be).
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    /// Parent AgentCard — MUTABLE because we update used_today + last_reset_slot.
    /// This is what enforces the daily cap across multiple Pacts on the same card.
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

    /// Vault PDA — owns the USDC ATA. Signed by program via with_signer.
    /// CHECK: derived from [b"pact-vault", pact.key()]; verified via seeds.
    #[account(
        seeds = [Pact::VAULT_SEED_PREFIX, pact.key().as_ref()],
        bump = pact.vault_bump,
    )]
    pub vault: AccountInfo<'info>,

    /// USDC mint, pinned to pact.usdc_mint.
    #[account(address = pact.usdc_mint @ SettleError::WrongMint)]
    pub usdc_mint: Account<'info, Mint>,

    /// Vault's USDC ATA (source).
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    /// Merchant's USDC token account (destination) — must be owned by `merchant_owner`.
    #[account(mut, token::authority = merchant_owner, token::mint = usdc_mint)]
    pub merchant_usdc: Account<'info, TokenAccount>,

    /// CHECK: merchant pubkey, validated against pact.allowlist below.
    pub merchant_owner: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(
    ctx: Context<SpendViaPact>,
    amount: u64,
    capability_hash: [u8; 32],
    receipt_hash: [u8; 32],
    reason_hash: [u8; 32],
    policy_snapshot_hash: [u8; 32],
) -> Result<()> {
    require!(amount > 0, SettleError::ZeroAmount);

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

    // Per-call max (inherited from card)
    require!(amount <= card.per_call_max_lamports, SettleError::OverCap);

    // ────────────────────────────────────────────────────────────────────
    // Daily cap window reset + enforcement.
    //
    // This is the critical fix for the cross-Pact cap bypass: every Pact spend
    // updates the parent card's used_today, so two pacts each at 100% of cap
    // can no longer compound past the parent's daily limit.
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

    // Mode check: spend_via_pact only operates on OneShot pacts. Streaming uses
    // claim_streaming; DeliveryEscrow uses release/dispute. Read current cap/spent
    // from the OneShot variant.
    let (cap_lamports, current_spent) = match &pact.mode {
        PactMode::OneShot { cap_lamports, spent } => (*cap_lamports, *spent),
        PactMode::Streaming { .. } | PactMode::DeliveryEscrow { .. } => {
            return err!(SettleError::NotOneShotMode);
        }
    };

    // Pact local cap
    let new_spent = current_spent
        .checked_add(amount)
        .ok_or(SettleError::PactOverCap)?;
    require!(new_spent <= cap_lamports, SettleError::PactOverCap);

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

    // CPI TransferChecked, signed by Vault PDA
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

    // Write back the new spent into the OneShot mode.
    if let PactMode::OneShot { spent, .. } = &mut pact.mode {
        *spent = new_spent;
    }
    card.used_today = new_card_total;

    let cap_remaining = cap_lamports.saturating_sub(new_spent);

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

    emit!(PactSpendEvent {
        pact: pact.key(),
        card: card.key(),
        merchant,
        amount,
        spent_after: new_spent,
        cap_remaining_after: cap_remaining,
        slot: now_slot,
    });

    Ok(())
}
