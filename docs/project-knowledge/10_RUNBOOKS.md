# Runbooks

## Install

```bash
pnpm install
```

## Typecheck

```bash
pnpm typecheck
```

## Build

```bash
pnpm build
```

For only the web app:

```bash
pnpm --filter @settle/web build
```

## SDK Tests

```bash
pnpm test:sdk
```

## IDL Verification

```bash
pnpm verify:idl
pnpm check:idl-drift
```

## Anchor

```bash
pnpm anchor:build
pnpm anchor:test
```

If Anchor fails with missing Solana/SBF tooling, install and configure the Solana CLI/toolchain before claiming runtime confidence.

## Devnet Deploy

```bash
pnpm deploy:devnet
```

Expected result:

- Program deploys.
- Real program ID is patched where needed.
- IDL is regenerated/verified.

## Seed And Setup

```bash
pnpm seed:supabase
pnpm seed:demo-card
pnpm cnft:setup
pnpm badge:keygen
pnpm zk:keygen
pnpm zk:mint-setup
pnpm seal:keygen
pnpm vapid:keygen
```

## Smoke Scripts

```bash
tsx scripts/smoke-multikind-goldens.ts
tsx scripts/smoke-path-a-direct-send.ts
tsx scripts/smoke-record-receipt.ts
tsx scripts/smoke-receipt-importer.ts
tsx scripts/smoke-python-parity.ts
tsx scripts/smoke-ix-data-parity.ts
tsx scripts/smoke-verify-build.ts
tsx scripts/e2e-payment-flow.ts
```

## Audit Scripts

```bash
pnpm audit:indexer
tsx scripts/verify-migrations.ts
tsx scripts/probe-ddl.ts
```

## Required Browser Smoke

Run at least:

1. Open app locally or deployed.
2. Connect Phantom on devnet.
3. Send USDC.
4. Open receipt.
5. Verify receipt.
6. Confirm cNFT/compressed/badge side effects where configured.
7. Revoke/close/refund path where applicable.

