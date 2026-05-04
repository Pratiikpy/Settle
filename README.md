# Settle

**Pay anyone. Hire any AI. Trust the receipts.**

Settle is a payment app for the AI age — built on Solana. Send money to anyone with a `@handle`. Hire AI agents to spend on your behalf with cryptographically scoped permissions. Pay creators in atomic splits, hold funds in delivery-escrow with on-chain dispute, stream agent salaries per-slot. Every cent is provable on-chain.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Built on Solana](https://img.shields.io/badge/built%20on-Solana-9945FF.svg)](https://solana.com)
[![Solana Frontier 2026](https://img.shields.io/badge/Solana%20Frontier-2026-14F195.svg)](https://colosseum.com/frontier)

> 📘 The single source of truth for what Settle does and how it does it is [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md). This README is the elevator pitch.

## Public surfaces

- `/` — landing with live magic-moment terminal pulling real on-chain receipts
- `/watch` — live demo: a real agent on devnet spends, gets allowed/blocked per spending rule
- `/start` — 3-fork onboarding (I send / I sell / I build), each ending in a real receipt
- `/r/<request_id>` — public, shareable cryptographic receipt poster with auto-generated OG image
- `/m/<handle>` — public merchant profile with trust badge (receipts × revenue × disputes)
- `/leaderboard` — service usage leaderboard
- `/watch-crosschain`, `/start/agent-crosschain` — Settle × Ika cross-chain custody demo + onboarding (sidetrack submission; see [`docs/IKA-INTEGRATION.md`](docs/IKA-INTEGRATION.md))

## Try it now (2 minutes, devnet)

You can prove every claim above without installing anything.

1. **Watch an agent spend** → [`/watch`](https://settle.so/watch). A real card on devnet. The terminal shows live ALLOW / DENY decisions; click any row to see the on-chain receipt.
2. **Send a payment** → [`/start/consumer`](https://settle.so/start/consumer). Connect Phantom on devnet, get an airdrop from the in-app sandbox, send to `@alice`. Watch your receipt land at `/r/<id>` with full hash chain + Solscan link.
3. **Hire your own agent** → [`/start/agent`](https://settle.so/start/agent). Pick a budget. Pick what it can buy. Hit go. Revoke any time — one transaction kills the credential.
4. **Verify a receipt without us** → grab any `receipt_hash` from `/r/<id>`, drop it into [`/verify`](https://settle.so/verify). The SDK function (`@settle/sdk` `verifyReceipt`) re-derives the hash chain in your browser — no Settle servers required.

Running the full stack locally? Skip to [Run locally](#run-locally) below.

---

## Settle × Ika sidetrack (cross-chain custody)

> **Solana defines the policy. Ika enforces custody and signing across chains. Settle shows proof of what was allowed, blocked, signed, and executed.**

A sibling Anchor 1.0 program (`programs-ika/settle-dwallet-router`, deployed on devnet at [`FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK`](https://solscan.io/account/FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK?cluster=devnet)) extends Settle's policy gate to sign for assets on any chain Ika supports. Day-1 chain: Ethereum Sepolia.

The full integration story, build/test instructions, devnet ids, and pre-alpha caveats live in [`docs/IKA-INTEGRATION.md`](docs/IKA-INTEGRATION.md). The plan + per-phase log: [`SIDETRACK-IKA-PLAN.md`](SIDETRACK-IKA-PLAN.md), [`IKA-PROGRESS.md`](IKA-PROGRESS.md). Test evidence + honesty rules: [`docs/IKA-TEST-REPORT.md`](docs/IKA-TEST-REPORT.md).

68 cross-chain tests across the integration: 15 router policy-gate (Rust), 12 receipt-kernel (SDK), 11 API validation (SDK), 21 EIP-1559 / RLP (SDK), 9 UI Playwright. All green.

---

## Why Settle

AI agents are about to spend trillions of dollars on behalf of consumers and businesses. Today there is no payment rail that lets you give an AI agent a scoped credential, audit what it did, and prove what it spent. Stripe assumes a human at the keyboard. Cash App doesn't run on a chain. Crypto wallets are wallets, not products.

Settle is the consumer payment app where AI agent payments are a first-class feature, with a cryptographic audit chain that makes every cent provable. Built on Solana for sub-second confirmations, low fees, and on-chain receipts that anyone can verify.

---

## What you can do with Settle (v0.3 — 22 features)

### Speed sensory
- **Confetti calibrated to amount** ($1 puff → $50+ takeover with haptic + push)
- **Sub-400 ms trust gesture** with elapsed-time readout ("Confirmed in 0.42 s")
- **Live audience counter on receipt** via Supabase Realtime
- **Refund by emoji (😞)** — mode-routed: `close_pact` for OneShot/Streaming, `dispute_delivery_escrow` for Escrow within window

### Live receipt
- **Voice-note attachment** sealed-box encrypted to per-deployment pubkey, only the original recipient can decrypt server-side after wallet-sig auth
- **Live receipt object** with mode-aware status (Open / Streaming · Live / Streaming · Paused / Held — awaiting confirm or dispute / Released / Refunded)

### Programmable links
- **Universal Blink router** — `/api/actions/router/[handle]/[type]` with `actions.json` wildcard registration; any Settle URL pasted into X / Discord / Telegram becomes a Phantom Blink
- **Handle as Venmo request** — `settle.so/at/<handle>?req=20&note=pizza` triggers a one-tap pay CTA
- **Self-repricing QR** — Solana Pay transaction-request URLs at `/qr/<merchant>/<slug>`; price updates live with the merchant pricelist
- **One-time-use payment links** with atomic single-use enforcement (`UPDATE ... WHERE claimed_at IS NULL`)
- **Pre-connect USDC balance preview** on `/claim/<escrow>` and `/pay/<token>`

### Pay with any token
- **TokenPicker + Jupiter swap composition** in a single v0 versioned tx with Address Lookup Tables. USDC sends work on devnet; non-USDC swap activates on mainnet (honest UX — Jupiter has no devnet liquidity)

### Streaming pact (NEW v0.3, on-chain)
- **Open + claim flow** — fund a streaming agent salary at `rate_lamports_per_slot` up to `max_total_lamports`. Agent claims periodically.
- **One-tap pause / resume / cancel-with-pro-rata-refund** — pause math correctly subtracts paused time from billable slots without retro-charging the just-claimed period

### Identity composability
- **Wallet-aware profile** — connected viewer sees "you've sent $X to @handle across N payments"
- **Save creator/agent to fan list (Follow)** — public follow graph + Web Push fanout when followed pubkey receives a public_feed receipt
- **Public capability leaderboard** with two server-clock-consistent latency metrics: total round-trip and merchant-only
- **Public earnings transparency** — opt-in via `agent_cards.public_feed_default`
- **Tap-to-pay from screenshot** — drop / paste / pick a Solana Pay QR image, jsQR decodes, `parseURL` parses, `/send` autofills

### Atomic multi-party (NEW v0.3)
- **Two-tap collab payment** — two creators agree on a split (basis points); buyer's tx contains two TransferChecked ixs in one Solana tx (atomic)
- **Split bill QR** — N payers, ceiling-divided per-payer amount, server-side aggregation closes the bill at N/N
- **Buy-now-pay-on-delivery escrow** (P9 on-chain) — pinned merchant + dispute window + permissionless release after deadline; cron worker handles auto-release

---

## Architecture

### On-chain: one Anchor program (`settle-agent-card`), 14 instructions

**v0.2 (existing):**
- `create_card`, `spend`, `spend_via_pact`, `revoke`, `record_denial`, `open_pact`, `close_pact`

**v0.3 streaming pact (P1):**
- `open_streaming_pact`, `claim_streaming`, `pause_streaming`, `resume_streaming`

**v0.3 delivery escrow (P9):**
- `open_delivery_escrow`, `release_delivery_escrow` (dual-caller: buyer any time / anyone post-deadline), `dispute_delivery_escrow`

`Pact.mode` is a `PactMode` enum with three variants: `OneShot { cap, spent }`, `Streaming { rate, max_total, claimed, last_claim_slot, paused, pause_started_slot, pause_accumulated_slots }`, `DeliveryEscrow { amount, merchant, capability_hash, confirm_deadline_slot, dispute_deadline_slot, released, refunded }`.

### Hash-committed receipts
Every `PolicyDecisionEvent` commits 3 × 32-byte BLAKE3 hashes on-chain (`receipt_hash`, `reason_hash`, `policy_snapshot_hash`). The off-chain `purpose_hash` binds them to HTTP context. Anyone can verify a receipt with the public `@settle/sdk` `verifyReceipt` function — no Settle servers required.

### Refunds + escrow disputes
- **OneShot / Streaming pact:** `close_pact` — vault drains to authority's USDC ATA. No off-band merchant signature needed.
- **DeliveryEscrow:** `dispute_delivery_escrow` (within window) refunds buyer; `release_delivery_escrow` (buyer any time, anyone post-deadline) pays the pinned merchant.

### Custody guarantees (all enforced on-chain)
- Per-call cap, daily cap (cross-pact via parent card), allowlist, capability pin, expiry, revoked — all checked atomically in one ix → no TOCTOU.
- Slot-based cap window (`CAP_WINDOW_SLOTS = 220_000`, ≈ 24 h) cannot be exploited by validator clock manipulation.
- Merchant pubkey **pinned** in the DeliveryEscrow variant payload — permissionless release cannot redirect funds.
- USDC mint pinned at card create — spend rejects any other mint.

Full spec in [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md). Build plan in [`docs/v0.3-build-plan.md`](docs/v0.3-build-plan.md).

---

## Solana primitives composed

**On-chain (used today):** Anchor 0.31.1 · SPL Token + ATA · SPL Memo · Solana Pay (transfer-request, transaction-request, reference pubkeys) · Compressed NFTs (Bubblegum V1) for receipts · Address Lookup Tables (Jupiter v0 tx) · Versioned transactions (v0) · Lighthouse transaction assertion (defense-in-depth on x402 spend, gated) · **MPL Core soulbound assets** (PermanentFreezeDelegate plugin, frozen-at-create — true SBT semantics) for the 6 reputation badges · **Light Protocol compressed tokens** (`@lightprotocol/compressed-token` v1) — every ALLOW receipt earns a 1-unit compressed-token mirror at ~$0.001/account vs ~$0.00204 for a regular Solana account

**Off-chain (used today):** Helius RPC + WebSocket `onLogs` subscription · Helius Sender (Jito-bundle wrapper for confirmed-on-first-try sends) · Jupiter Lite API (quote + swap-instructions) · **Pyth Hermes pull oracle** (live SOL/USD ticker on `/sandbox` + `/send`) · **Photon RPC** (Light Protocol compressed-account indexer, bundled in Helius endpoint) · Solana Attestation Service (verified merchant lookup) · Squads V4 detection (UI surface) · Bonfida SNS resolver · Solana Actions / Blinks · Dialect actions.json compatible · VAPID Web Push (RFC 8291/8292) · **Codama-equivalent IDL drift detector** in CI (`scripts/verify-idl.ts`) · **Capability heatmap** (`/leaderboard`) — Supabase Realtime rolling-60-s aggregation of public_feed ALLOW receipts as a glowing grid

**Intentionally not used in v0.3** (deferred to v0.4): Bubblegum V2 · Token-2022 transfer hooks · Squads spend-flow integration (we detect, not propose) · Solana Mobile MWA · Codama-generated runtime client (we hand-maintain `idl.ts` and verify it against the Anchor-generated IDL JSON in CI).

See [`docs/PRODUCT_SPEC.md` §7](docs/PRODUCT_SPEC.md#7-solana-primitive-inventory) for the honest used / not-used / why table.

---

## DevNet vs Mainnet (honest)

DevNet is the development cluster for v0.3. Most features work end-to-end on devnet today. The honest exceptions:

| Capability | DevNet | Mainnet |
|---|---|---|
| All `settle-agent-card` ixs | Works once deployed | Works after audit |
| USDC sends, streaming pacts, delivery escrow, splits, collabs, follows, leaderboard | ✅ | ✅ |
| **Jupiter non-USDC swap execution** | ❌ — no DEX liquidity. UI shows live quote + "swap activates on mainnet" banner | ✅ |
| Receipt cNFT mints (Bubblegum V1) | ✅ via Helius DAS | ✅; visible on Tensor / Magic Eden |
| MPL Core soulbound badges (`PermanentFreezeDelegate`) | ✅ once `pnpm badge:keygen` + airdrop | ✅; render in Phantom + Solscan |
| Light Protocol ZK Compressed receipts | ✅ once `pnpm zk:keygen` + `pnpm zk:mint-setup` + Helius API key | ✅ via Photon RPC bundled in Helius |
| Solana Actions / Blinks (Phantom-in-X) | ✅ once domain registered with Dialect | ✅ |

Full table at [`docs/PRODUCT_SPEC.md` §8](docs/PRODUCT_SPEC.md#8-devnet-vs-mainnet--honest-table).

---

## Run locally

```bash
git clone https://github.com/Pratiikpy/settle-protocol
cd settle-protocol

pnpm install
cp .env.example .env.local
# fill: NEXT_PUBLIC_RPC_URL, Helius API key, Supabase, Upstash, sealed-box keys

pnpm dev          # turbo run dev --parallel (web + indexer)
pnpm anchor:build # cd programs/settle-agent-card && anchor build
pnpm test         # vitest — 83 unit tests on @settle/sdk
```

### One-time setup
```bash
pnpm vapid:keygen          # generate VAPID keypair for Web Push
pnpm seal:keygen           # generate sealed-box keypair for voice notes
pnpm deploy:devnet         # builds + deploys Anchor program + patches SETTLE_PROGRAM_ID
pnpm seed:supabase         # apply migrations 0001–0016
pnpm seed:demo-card        # seeds a demo agent card + pacts (oneshot/streaming/escrow)
```

### Required env vars

| Var | Where to get it |
|---|---|
| `NEXT_PUBLIC_RPC_URL`, `HELIUS_API_KEY` | [helius.dev](https://helius.dev) |
| `NEXT_PUBLIC_SUPABASE_URL` + `_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` | [supabase.com](https://supabase.com) |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | [upstash.com](https://upstash.com) |
| `SETTLE_SEALED_BOX_PUBKEY` + `_PRIVKEY` | `pnpm seal:keygen` |
| `SETTLE_VAPID_PUBLIC_KEY` + `_PRIVATE_KEY` | `pnpm vapid:keygen` |
| `SETTLE_FACILITATOR_PRIVKEY` | base58 secret key — equals `card.agent_pubkey` for proxy-managed cards |
| `SETTLE_ESCROW_CRON_PRIVKEY` | base58 secret key — pays tx fees for permissionless release after deadline |
| `SETTLE_AGENT_CARD_PROGRAM_ID` (`NEXT_PUBLIC_SETTLE_PROGRAM_ID`) | set after `pnpm deploy:devnet` |

### Optional (mainnet-only or hardening)
| Var | Purpose |
|---|---|
| `JUPITER_API_KEY` | higher rate limit on Jupiter Lite (free tier ~60 rpm) |
| `LIGHTHOUSE_PROGRAM_ID` | enables Lighthouse defense-in-depth assertion on x402 spend |
| `SETTLE_SAS_PROGRAM_ID` + credential/schema | enables on-chain SAS verified-merchant attestation (otherwise falls back to `verified_merchants` DB row) |

---

## Repo layout

```
settle-protocol/
├── apps/
│   ├── web/                  Next.js 15 App Router — UI + every API endpoint + x402 proxy
│   ├── indexer/              Helius onLogs WS subscriber + webhook worker + escrow-cron
│   ├── demo-merchants/       Sample merchant servers (arxiv-fetch, translate)
│   └── demo-agent/           Sample autonomous agent that pays via x402 proxy
├── packages/
│   ├── types/                Canonical DenyCode enum + ix arg types
│   ├── sdk/                  @settle/sdk — canonical hashing + verifyReceipt + sealed-box (MIT, public good)
│   └── ui/                   Shared React primitives
├── programs/
│   └── settle-agent-card/    Anchor 0.31 — one program, 14 instructions
├── infra/
│   └── supabase/migrations/  0001–0016 — schema + RLS + dual-receipt views
└── docs/
    ├── PRODUCT_SPEC.md       Truth document — every feature, every primitive, every limit
    └── v0.3-build-plan.md    Wave-by-wave build plan (annotated with codex review fixes)
```

---

## Honest gaps (read before you judge)

1. **Program isn't deployed yet.** `SETTLE_PROGRAM_ID` placeholder in `lib.rs` until `pnpm deploy:devnet` patches the real ID.
2. **Migrations 0011–0016 unapplied** until you run `pnpm seed:supabase`. Affects streaming pact, delivery escrow, follows, leaderboard, collabs, splits.
3. **Anchor integration tests written but unrun.** 9 tests in `programs/.../tests/streaming-and-escrow.ts` — needs `anchor test --skip-deploy` against a localnet validator.
4. **Plan P2 (single-use OneShot pact flag)** deferred to v0.4. F10 ships off-chain via DB row-lock instead.
5. **Receipt cNFT transfer = collectible only**, not rights bundle (Codex round-2 closed). Voice-note decryption rights pinned to original recipient pubkey.
6. **Dialect Actions Registry submission** not done — Phantom-in-X Blinks render only after registration.

Full list: [`docs/PRODUCT_SPEC.md` §11](docs/PRODUCT_SPEC.md#11-known-gaps--trade-offs).

---

## License

[MIT](./LICENSE). The `@settle/sdk` canonical hashing + `verifyReceipt` modules are published as a public good for any team building hash-committed audit trails on Solana.

---

## Built for

[Solana Frontier Hackathon 2026](https://colosseum.com/frontier) — submission deadline May 11, 2026.

Tracks: **Payments + Commerce** (primary), Agents + Tokenization (secondary), Blinks + Actions (tertiary).

---

## Security

See [`SECURITY.md`](./SECURITY.md). Audited against [`coral-xyz/sealevel-attacks`](https://github.com/coral-xyz/sealevel-attacks) patterns. Report security issues to `xprtqk@gmail.com` with subject `SETTLE SECURITY`.

---

## Contributing

The `@settle/sdk` canonical hashing module + `verifyReceipt` are MIT-licensed and accept PRs. The on-chain Anchor program is also MIT — fork, audit, or build on top.
