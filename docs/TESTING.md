# Testing Guide

This document covers test infrastructure for the Settle Anchor program and the broader monorepo. For the strategy of WHAT to test, see [STRATEGY.md](./STRATEGY.md).

## Anchor program tests (24 tests, 14 ix coverage)

Path: `programs/settle-agent-card/tests/`. Two files:
- `settle-agent-card.ts` — OneShot Pact lifecycle, revoke, daily-cap enforcement, `record_denial`, legacy `spend`
- `streaming-and-escrow.ts` — Streaming Pact + Delivery Escrow

Coverage map (every ix in `lib.rs` is tested):

| Ix | Tests | File |
|---|---|---|
| `create_card` | 1 happy + 1 reject (in spend block) | settle-agent-card.ts |
| `spend` (legacy) | 3 (happy, OverCap, unauthorized) | settle-agent-card.ts |
| `spend_via_pact` | 6 (happy, OverCap, OffAllowlist, unauthorized agent, post-revoke, daily-cap cross-pact) | settle-agent-card.ts |
| `revoke` | 1 | settle-agent-card.ts |
| `record_denial` | 1 happy + 1 reject (attacker) | settle-agent-card.ts |
| `open_pact` | 1 (also exercised inside spend tests) | settle-agent-card.ts |
| `close_pact` | 2 (happy + re-close reject) | settle-agent-card.ts |
| `open_streaming_pact` | 1 happy | streaming-and-escrow.ts |
| `claim_streaming` | 2 (entitlement math, paused-time excluded) | streaming-and-escrow.ts |
| `pause_streaming` + `resume_streaming` | 1 combined | streaming-and-escrow.ts |
| `open_delivery_escrow` | 3 (early confirm, dispute, permissionless release) | streaming-and-escrow.ts |
| `release_delivery_escrow` | 3 (with above + double-release reject) | streaming-and-escrow.ts |
| `dispute_delivery_escrow` | 2 (happy + post-deadline reject) | streaming-and-escrow.ts |

## Running tests

### CI (recommended)
GitHub Actions on Ubuntu runs the full suite on every push. See `.github/workflows/ci.yml`.

### Local (Linux, macOS)
```bash
cd programs/settle-agent-card
anchor test               # spins up solana-test-validator + deploys + runs
```

### Local (Windows)
`solana-test-validator` requires `SeCreateSymbolicLinkPrivilege` to set up its ledger snapshot. Enable **Windows Developer Mode** (Settings → System → For developers → Developer Mode = On) to grant this without administrator elevation. Then the same command works:
```bash
cd programs/settle-agent-card
anchor test
```

Alternative without local validator (slower, hits devnet rate limits):
```bash
cd programs/settle-agent-card
anchor test --skip-local-validator    # uses the deployed devnet program
```

### Typecheck only (no validator needed, ~5s)
```bash
cd programs/settle-agent-card
pnpm exec tsc --noEmit -p tsconfig.json
```

## Indexer event-handler audit

The indexer (`apps/indexer/src/index.ts`) decodes 12 distinct event types from the program. After A1 (Bucket A, May 1, 2026), every handler:
- validates byte length against the IDL-derived event size
- uses `count: 'exact'` on UPDATEs to detect 0-row drift (logs `INDEXER_DB_FAILURE` on miss)
- routes errors through a single `critical()` helper for log-aggregator alerting
- awaits the DB write so multi-event txs (e.g. `spend_via_pact` emits PactSpend + PolicyDecision) serialize correctly
- a try/catch in the dispatch loop prevents one event's exception from breaking the whole batch

Run a quick handler-byte-size cross-check:
```bash
pnpm --filter @settle/indexer exec tsc --noEmit
```

## End-to-end smoke test

`scripts/bootstrap-test-wallet.ts` generates a dedicated test wallet and outputs a Circle-faucet URL. After fauceting USDC (manual one-time), the wallet at `.test-wallet.json` (gitignored) is reusable forever for E2E tests. See `docs/STRATEGY.md` §15 for the verification gates this satisfies.
