use anchor_lang::prelude::*;

#[error_code]
pub enum SettleError {
    #[msg("Card is revoked.")]
    CardRevoked,
    #[msg("Card is expired.")]
    CardExpired,
    #[msg("Spend exceeds daily cap or per-call max.")]
    OverCap,
    #[msg("Merchant is not on the allowlist.")]
    OffAllowlist,
    #[msg("Capability hash does not match the pinned hash for this merchant.")]
    CapabilityNotPinned,
    #[msg("Merchant is not present in the verified registry.")]
    MerchantNotVerified,
    #[msg("Allowlist exceeds maximum entries (10).")]
    AllowlistTooLong,
    #[msg("Pact merchant allowlist exceeds maximum entries (5).")]
    PactAllowlistTooLong,
    #[msg("Pact is closed.")]
    PactClosed,
    #[msg("Pact spent would exceed cap.")]
    PactOverCap,
    #[msg("Unauthorized authority for this card.")]
    UnauthorizedAuthority,
    #[msg("Unauthorized agent (signer pubkey does not match card.agent_pubkey).")]
    UnauthorizedAgent,
    #[msg("Pact's parent_card does not match the supplied card.")]
    PactCardMismatch,
    #[msg("USDC mint does not match the mint pinned at card creation.")]
    WrongMint,
    #[msg("Invalid deny code.")]
    InvalidDenyCode,
    #[msg("Receipt hash must be 32 bytes (BLAKE3).")]
    InvalidHashLength,
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
    #[msg("Pact merchant_owner does not own the supplied destination token account.")]
    DestinationOwnerMismatch,
    #[msg("Operation requires a OneShot pact; this pact is in Streaming mode.")]
    NotOneShotMode,
    #[msg("Operation requires a Streaming pact; this pact is in OneShot mode.")]
    NotStreamingMode,
    #[msg("No billable slots have accrued since the last claim.")]
    NothingToClaim,
    #[msg("Streaming pact has reached its max_total_lamports.")]
    StreamMaxReached,
    #[msg("Operation requires a DeliveryEscrow pact; this pact is in a different mode.")]
    NotDeliveryEscrowMode,
    #[msg("Delivery escrow has already been released to the merchant.")]
    EscrowAlreadyReleased,
    #[msg("Delivery escrow has already been refunded to the buyer.")]
    EscrowAlreadyRefunded,
    #[msg("Permissionless release requires the confirm deadline to have passed.")]
    EscrowConfirmDeadlineNotPassed,
    #[msg("Dispute window has closed; the escrow can no longer be refunded by the buyer.")]
    EscrowDisputeWindowClosed,
    #[msg("confirm_deadline_slot must be ≤ dispute_deadline_slot, and both must be in the future.")]
    InvalidEscrowDeadlines,
}
