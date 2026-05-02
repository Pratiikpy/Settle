# Solana Program Map

Program path:

- `programs/settle-agent-card/programs/settle-agent-card/src`

## Core Accounts

### AgentCard

Expected role:

- Authority-owned programmable budget.
- Stores daily cap, per-call max, allowlist, expiry, revoked state, policy version, pinned USDC mint, and agent pubkey.

### Pact

Expected role:

- Child budget/account under AgentCard.
- Modes include OneShot, Streaming, and DeliveryEscrow.

### Vault PDA

Expected role:

- Derived signer that owns the Pact USDC ATA.
- Allows autonomous agent spend without user signing every spend.

## Instruction Files

- `create_card.rs`
- `spend.rs`
- `spend_via_pact.rs`
- `revoke.rs`
- `record_denial.rs`
- `record_receipt.rs`
- `open_pact.rs`
- `close_pact.rs`
- `open_streaming_pact.rs`
- `claim_streaming.rs`
- `pause_streaming.rs`
- `resume_streaming.rs`
- `open_delivery_escrow.rs`
- `release_delivery_escrow.rs`
- `dispute_delivery_escrow.rs`

## Events And State

- `events.rs`
- `state.rs`
- `errors.rs`
- `lib.rs`

## Solana/Anchor Audit Checklist

- All money movement uses `TransferChecked` with correct mint/decimals.
- Vault PDA signer seeds are correct and canonical.
- Authority and agent signer constraints are separated correctly.
- Per-call cap and daily cap are enforced across all spend/claim paths.
- Revoked cards cannot spend or claim.
- Allowlist and capability hash checks are enforced where required.
- Delivery escrow merchant cannot be changed after open.
- Streaming claim cannot overdraw entitlement or parent caps.
- Close/dispute/release instructions cannot redirect funds.
- `record_denial` cannot be spammed by unrelated signers.
- `record_receipt` does not let untrusted parties forge authoritative receipt state.
- IDL in `packages/sdk/src/idl.ts` matches generated Anchor IDL.

## Runtime Verification

Static code review is not enough. Required commands:

- `pnpm verify:idl`
- `pnpm check:idl-drift`
- `anchor build`
- `anchor test` or `anchor test --skip-deploy` after local/devnet setup

Known environment issue from prior audit: Anchor CLI existed, but Solana CLI / SBF toolchain may be missing locally. That must be handled before runtime test confidence is claimed.

