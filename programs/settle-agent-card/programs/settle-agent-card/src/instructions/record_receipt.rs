use anchor_lang::prelude::*;
use crate::events::*;

/// Standalone universal-receipt attestation (F2.0 Path A).
///
/// Permissionless — any signer can attest a receipt. The receipt proves itself
/// by binding via the canonical objects (which a verifier re-hashes), not by
/// who signed. The attestor pubkey is recorded in the event so a verifier can
/// see WHO claims to have witnessed this receipt — useful for trust-graph
/// dashboards ("Settle's operator vouched") but not load-bearing for the
/// commit chain itself.
///
/// Why standalone instead of CPI'd from existing ix's:
///   1. Existing ix's already commit 3 hashes (receipt, reason, policy_snapshot)
///      via PolicyDecisionEvent on the same tx. Adding a 4th-hash CPI would be
///      double-bookkeeping.
///   2. Standalone = strictly additive. No regression risk to the 24-test mocha
///      suite or production txs while Path B (off-chain Memo) is in flight.
///   3. Non-Anchor-routed kinds (direct_send, link_send, refund) can attach
///      this ix to their tx for on-chain attestation that's stronger than
///      Memo program (structured event vs. base64url string).
///
/// Anti-spam: any signer can call, but the program does no state writes —
/// just emits an event. Cost = ~5k lamports for the tx fee, paid by the
/// signer. No write rent, no account growth. Spam attestations are
/// detectable downstream (verifier rejects ones whose canonical objects
/// don't actually exist in the receipts table).
#[derive(Accounts)]
pub struct RecordReceipt<'info> {
    /// Anyone can attest. The signer's pubkey is recorded as `attestor` in
    /// the emitted event so a verifier can decide whether to trust the
    /// attestation (e.g. "only attestations from Settle's operator key
    /// surface in the merchant dashboard").
    pub attestor: Signer<'info>,
}

/// Emit a ReceiptRecordedEvent carrying the 4-hash universal kernel commit
/// chain plus the kind discriminator and context_hash binding identity.
///
/// `kind` is the receipt-kind tag — same encoding used by @settle/sdk
/// `packKernelMemo` (1=x402_spend, 2=direct_send, …, 7=refund). The
/// indexer maps the byte back to the string kind when writing to Postgres.
pub fn handler(
    ctx: Context<RecordReceipt>,
    kind: u8,
    receipt_hash: [u8; 32],
    reason_hash: [u8; 32],
    policy_snapshot_hash: [u8; 32],
    purpose_hash: [u8; 32],
    context_hash: [u8; 32],
) -> Result<()> {
    let clock = Clock::get()?;
    emit!(ReceiptRecordedEvent {
        attestor: ctx.accounts.attestor.key(),
        kind,
        receipt_hash,
        reason_hash,
        policy_snapshot_hash,
        purpose_hash,
        context_hash,
        slot: clock.slot,
    });
    Ok(())
}
