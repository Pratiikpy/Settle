# Audit Findings Ledger

Use this file for open findings. Do not delete findings silently. Mark them closed with evidence.

## Finding Format

```text
ID:
Severity: BLOCKER / HIGH / MEDIUM / LOW / DOC_DRIFT
Category:
Files:
Expected:
Actual:
Why it matters:
How to verify:
Suggested fix:
Can AI fix it:
Human action required:
Status:
```

## Open Findings

### PK-001: Universal Receipt Kernel coverage must be proven across every payment kind

Severity: HIGH

Category: Spec-to-code traceability / receipt integrity

Files:

- `docs/STRATEGY.md`
- `docs/BUILD_ORDER.md`
- `packages/sdk/src/receipt-kernel.ts`
- receipt-producing API routes under `apps/web/app/api`

Expected:

Every payment kind emits and verifies the same four-hash receipt model or is explicitly marked partial.

Actual:

Docs already identify the historical risk: x402 has the strongest path, while direct send, streaming claims, escrow releases, refunds, send-by-link, and imported receipts must be verified against the universal kernel.

Why it matters:

Settle's wedge is "every payment proves itself." That cannot be selectively true.

How to verify:

Run a multi-kind receipt smoke that covers x402, direct send, send link, streaming claim, escrow release/dispute, refund, imported receipt, split bill, and collab. Each receipt page must show all expected hashes and verifier success or an honest partial state.

Suggested fix:

Follow `docs/BUILD_ORDER.md` Phase 1 Week 1 and Path A upgrade.

Can AI fix it: yes, except deploy/browser wallet signing.

Human action required: devnet deploy and wallet smoke.

Status: OPEN.

### PK-002: Chrome extension surface not present

Severity: LOW

Category: Surface inventory

Files:

- repository root

Expected:

If Chrome extension is part of the product claim, it should have an app/package path.

Actual:

No extension directory was found in the repo scan.

Why it matters:

Prevents accidental claims that a browser extension exists.

Suggested fix:

Add `apps/extension` when actually starting extension work, or keep extension marked planned.

Status: OPEN.

### PK-003: Runtime verification depends on local Solana/Anchor toolchain

Severity: MEDIUM

Category: Test/runtime confidence

Expected:

Anchor build/test pass locally or in CI.

Actual:

Prior audit saw Anchor available but Solana/SBF toolchain missing locally. Re-check before claiming runtime confidence.

Why it matters:

TypeScript builds cannot prove on-chain instruction behavior.

Suggested fix:

Install Solana CLI/SBF toolchain and run Anchor tests.

Human action required: likely yes.

Status: OPEN.

## Closed Findings

None recorded in this ledger yet.

