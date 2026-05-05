# Settle

**Pay anyone. Hire any AI. Trust the receipts.**

Settle is the payment app for the AI age. Send USDC to anyone with a `@handle`. Hire AI agents to spend on your behalf with cryptographically scoped permissions. Every payment writes a 4-hash chain anyone can verify on-chain — no Settle servers required.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Built on Solana](https://img.shields.io/badge/built%20on-Solana-9945FF.svg)](https://solana.com)
[![CI](https://github.com/Pratiikpy/Settle/actions/workflows/ci.yml/badge.svg)](https://github.com/Pratiikpy/Settle/actions/workflows/ci.yml)
[![npm: settle-merchant](https://img.shields.io/npm/v/create-settle-merchant.svg?label=create-settle-merchant)](https://www.npmjs.com/package/create-settle-merchant)
[![PyPI](https://img.shields.io/pypi/v/settle-protocol-sdk.svg?label=settle-protocol-sdk)](https://pypi.org/project/settle-protocol-sdk/)

![Settle landing — magic-moment terminal mid-flight](docs/screenshots/hero.png)

**Live:** [use-settle.vercel.app](https://use-settle.vercel.app/) · [`/verify`](https://use-settle.vercel.app/verify) · [`/stats`](https://use-settle.vercel.app/stats) · Anchor program [`HU4piq8…77nD`](https://solscan.io/account/HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD?cluster=devnet) (devnet)

**Status:** devnet today · 14 ix on-chain · 3 SDKs in TS / Python / Rust producing byte-identical hashes · mainnet after audit ([`SECURITY.md`](./SECURITY.md))

---

## Try it in 2 minutes

No install needed. All four work on devnet right now:

1. **Watch an agent spend** → [`/watch`](https://use-settle.vercel.app/watch) — real ALLOW / DENY decisions stream live; click any row to open the on-chain receipt.
2. **Send a payment** → [`/start/consumer`](https://use-settle.vercel.app/start/consumer) — connect Phantom, take a sandbox airdrop, send to `@alice`.
3. **Hire your own agent** → [`/start/agent`](https://use-settle.vercel.app/start/agent) — pick a budget and what it can buy; revoke in one tx.
4. **Verify a receipt without us** → drop any `receipt_hash` into [`/verify`](https://use-settle.vercel.app/verify) — the SDK re-derives the hash chain in your browser.

---

## What it looks like

| Watch (`/watch`) | Receipt poster (`/r/<id>`) |
|---|---|
| ![Agent demo](docs/screenshots/panel-watch.png) | ![Receipt poster](docs/screenshots/panel-receipt.png) |
| **Dashboard (`/dashboard`)** | **Cross-chain (`/watch-crosschain`)** |
| ![Dashboard](docs/screenshots/panel-dashboard.png) | ![Cross-chain](docs/screenshots/panel-crosschain.png) |

---

## How a payment flows

```mermaid
flowchart LR
    A[User] -->|create card| B[AgentCard PDA]
    B -->|policy: cap, allowlist, expiry| C{Policy Gate}
    D[AI Agent] -->|spend request| C
    C -->|ALLOW| E[USDC TransferChecked]
    C -->|DENY| F[record_denial ix]
    E --> G[4-hash receipt on-chain]
    F --> G
    G -->|verifyReceipt| H[Anyone, anywhere]
```

Same primitive runs the cross-chain extension: Settle's policy gate evaluates on Solana, [Ika dWallets](https://ika.xyz) produce the signature for the target chain, the hash chain still settles on Solana. See [`docs/IKA-INTEGRATION.md`](docs/IKA-INTEGRATION.md).

---

## 5 lines and you're shipping receipts

```ts
import { kernelCommit, verifyReceipt } from "@settle/sdk";

const result = kernelCommit({
  kind: "x402_spend",
  request_id,
  card_pubkey, agent_pubkey,
  amount_lamports: "5000000",
  capability_hash, /* ...policy snapshot fields */
});

// Server-side: result.hashes go into the on-chain `record_receipt` ix.
// Client-side, anywhere:
const ok = verifyReceipt(canonicalReceipt, result.hashes);
```

The SDK is published in three runtimes:

- **TypeScript:** [`@settle/sdk`](packages/sdk) (workspace-internal) + the helpers `create-settle-merchant`, `@settle-web/web-components` on npm.
- **Python:** [`settle-protocol-sdk`](https://pypi.org/project/settle-protocol-sdk/) — receipt kernel + `verifyReceipt` + LangChain and CrewAI adapters.
- **Rust:** [`packages/rust-sdk`](packages/rust-sdk) for on-chain consumers.

### Same hashes, three runtimes

```ts
// TypeScript — packages/sdk
import { verifyReceipt } from "@settle/sdk";
const v = verifyReceipt({ receipt, reason, policy_snapshot, http, expected });
// v.ok === true ⇒ all 4 hashes match
```

```python
# Python — pip install settle-protocol-sdk
from settle_sdk import verify_receipt
v = verify_receipt({"receipt": r, "reason": s, "policy_snapshot": p,
                    "http": h, "expected": e})
# v.ok is True ⇒ all 4 hashes match
```

```rust
// Rust — packages/rust-sdk
use settle_sdk::verify_receipt;
let v = verify_receipt(&VerifyInput { receipt, reason, policy_snapshot,
                                      purpose_input, expected });
// v.ok ⇒ all 4 hashes match
```

All three call sites compute the same 4 BLAKE3 hashes from the same canonical-JSON encoding. Cross-language parity is enforced by [`packages/python-sdk/test_kernel_parity.py`](packages/python-sdk/test_kernel_parity.py) and [`test_parity.py`](packages/python-sdk/test_parity.py) — the Python suite hashes shared fixtures and compares against precomputed TS + Rust outputs.

---

## What a receipt looks like

```
SETTLE · CRYPTOGRAPHIC RECEIPT
#5e2c1b3a-9f47-4a01-b8a1-...

  Verified ✓     $5.00 USDC

  MERCHANT     5jK...4h2
  CARD         3xR...8aN
  REQUEST      POST /api/translate
  POLICY       v3

  4-HASH CHAIN
    receipt_hash    a91b...e8d4
    context_hash    7f02...c1a6
    reason_hash     d44c...f902
    policy_snapshot 18ee...bb7c

  View tx on Solscan ↗     Verify hashes →
```

Every receipt — happy path or deny — commits the same four BLAKE3 hashes on Solana. Anyone with the receipt JSON can re-derive them in their browser.

**See a live one:** [`/r/93de12a1-01c1-4fc8-83c0-1bff28f5a870`](https://use-settle.vercel.app/r/93de12a1-01c1-4fc8-83c0-1bff28f5a870) — the same shape, with a real on-chain hash you can paste into [`/verify`](https://use-settle.vercel.app/verify) and watch it match.

---

## Settle × Ika · cross-chain custody

> Solana defines the policy. Ika enforces custody and signing across chains. Settle shows proof of what was allowed, blocked, signed, and executed.

A sibling Anchor 1.0 program (`programs-ika/settle-dwallet-router`) extends the policy gate to any chain Ika supports. Day-one chain: Ethereum Sepolia.

| Asset | Where | Verifiable |
|---|---|---|
| Router program | `FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK` | [Solscan](https://solscan.io/account/FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK?cluster=devnet) |
| Cross-chain UI | `/start/agent-crosschain`, `/cards/crosschain/<pda>`, `/watch-crosschain` | live |
| Tests | 68 across the integration (15 Rust + 12 SDK + 11 validation + 21 EIP-1559 + 9 Playwright) | all green |

Full integration story: [`docs/IKA-INTEGRATION.md`](docs/IKA-INTEGRATION.md). Test evidence: [`docs/IKA-TEST-REPORT.md`](docs/IKA-TEST-REPORT.md).

---

## How Settle compares

| | Stripe | Helio | [x402 raw](https://github.com/coinbase/x402) | **Settle** |
|---|:-:|:-:|:-:|:-:|
| Agent-native credentials (cap, allowlist, expiry, revocation) | — | — | partial | ✅ |
| On-chain receipts (kernel-committed) | — | partial | — | ✅ |
| Revocable in one tx | — | — | — | ✅ |
| Verifiable without provider servers | — | — | — | ✅ |
| Cross-chain signing under one policy | — | — | — | ✅ |

---

## Architecture

One Anchor program (`settle-agent-card`) on Solana, 14 instructions. Hash-committed receipts. USDC mint pinned at create-time. Per-call cap, daily cap, allowlist, capability pin, expiry, and revocation are all enforced atomically in one ix — no off-chain middleware in the trust path.

<details>
<summary><b>Instruction list (14)</b></summary>

`create_card`, `spend`, `spend_via_pact`, `revoke`, `record_denial`, `open_pact`, `close_pact`,
`open_streaming_pact`, `claim_streaming`, `pause_streaming`, `resume_streaming`,
`open_delivery_escrow`, `release_delivery_escrow`, `dispute_delivery_escrow`.

`Pact.mode` is a `PactMode` enum: `OneShot`, `Streaming` (rate-per-slot with pause/resume), or `DeliveryEscrow` (pinned merchant + dispute window + permissionless post-deadline release).

</details>

<details>
<summary><b>Hash-committed receipts</b></summary>

Every `PolicyDecisionEvent` commits 3 × 32-byte BLAKE3 hashes on-chain (`receipt_hash`, `reason_hash`, `policy_snapshot_hash`). The off-chain `purpose_hash` binds them to HTTP context. `@settle/sdk::verifyReceipt` re-derives every hash from the canonical JSON in any environment that can run JS.

</details>

<details>
<summary><b>Solana primitives composed</b></summary>

**On-chain:** Anchor 0.31 · SPL Token + ATA · SPL Memo · Solana Pay · Compressed NFTs (Bubblegum V1) · Address Lookup Tables · Versioned transactions · Lighthouse tx assertions · MPL Core soulbound badges · Light Protocol compressed tokens.

**Off-chain:** Helius RPC + WS · Helius Sender (Jito bundles) · Jupiter Lite (quote + swap) · Pyth Hermes · Photon RPC (compressed accounts) · Solana Attestation Service · Solana Actions / Blinks · VAPID Web Push · jsQR + parseURL.

</details>

<details>
<summary><b>Custody guarantees</b></summary>

- Per-call cap, daily cap (cross-pact via parent card), allowlist, capability pin, expiry, revocation — all checked atomically in one ix → no TOCTOU.
- Slot-based cap window (`CAP_WINDOW_SLOTS = 220_000`, ≈ 24h) cannot be exploited by validator clock manipulation.
- Merchant pubkey **pinned** in the DeliveryEscrow variant payload — permissionless release cannot redirect funds.
- USDC mint pinned at card create — spend rejects any other mint.

</details>

<details>
<summary><b>Reproducible builds</b></summary>

The Anchor program ships a hash of the build inputs. [`/verify-build`](https://use-settle.vercel.app/verify-build) shows the deployed program's bytecode hash side-by-side with the hash of `cargo build-sbf` against the source at the tagged commit. Anyone can re-run the build and compare. No "trust our deploy step."

</details>

---

## Run locally

```bash
git clone https://github.com/Pratiikpy/Settle
cd Settle
pnpm install
cp .env.example .env.local        # fill: RPC URL, Helius, Supabase, Upstash, sealed-box keys

pnpm dev                          # web + indexer
pnpm anchor:build                 # cd programs/settle-agent-card && anchor build
pnpm test                         # vitest — 83 unit tests on @settle/sdk
```

<details>
<summary><b>One-time setup + environment variables</b></summary>

```bash
pnpm vapid:keygen           # VAPID keypair for Web Push
pnpm seal:keygen            # sealed-box keypair for voice notes
pnpm deploy:devnet          # builds + deploys Anchor program + patches SETTLE_PROGRAM_ID
pnpm seed:supabase          # apply migrations
pnpm seed:demo-card         # seeds a demo agent card + pacts (oneshot/streaming/escrow)
```

| Var | Where to get it |
|---|---|
| `NEXT_PUBLIC_RPC_URL`, `HELIUS_API_KEY` | [helius.dev](https://helius.dev) |
| `NEXT_PUBLIC_SUPABASE_URL` + `_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` | [supabase.com](https://supabase.com) |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | [upstash.com](https://upstash.com) |
| `SETTLE_SEALED_BOX_PUBKEY` + `_PRIVKEY` | `pnpm seal:keygen` |
| `SETTLE_VAPID_PUBLIC_KEY` + `_PRIVATE_KEY` | `pnpm vapid:keygen` |
| `SETTLE_FACILITATOR_PRIVKEY` | base58 secret — equals `card.agent_pubkey` for proxy-managed cards |
| `SETTLE_ESCROW_CRON_PRIVKEY` | base58 secret — pays tx fees for permissionless release after deadline |
| `SETTLE_AGENT_CARD_PROGRAM_ID` | set after `pnpm deploy:devnet` |

Optional (mainnet hardening): `JUPITER_API_KEY`, `LIGHTHOUSE_PROGRAM_ID`, `SETTLE_SAS_PROGRAM_ID`.

</details>

---

## Repo layout

```
settle-protocol/
├── apps/
│   ├── web/                  Next.js 15 — UI + every API endpoint + x402 proxy
│   ├── indexer/              Helius onLogs WS + webhook worker + escrow-cron
│   ├── demo-merchants/       Sample merchant servers (arxiv-fetch, translate)
│   └── demo-agent/           Sample autonomous agent paying via x402 proxy
├── packages/
│   ├── sdk/                  @settle/sdk — canonical hashing + verifyReceipt + sealed-box
│   ├── types/                Canonical DenyCode enum + ix arg types
│   ├── ui/                   Shared React primitives
│   ├── python-sdk/           settle-protocol-sdk on PyPI
│   ├── rust-sdk/             on-chain consumer SDK
│   ├── create-settle-merchant/   npm scaffold CLI
│   └── web-components/       <settle-pay> + <settle-verify> custom elements
├── programs/settle-agent-card/   Anchor 0.31 — one program, 14 instructions
├── programs-ika/settle-dwallet-router/   Anchor 1.0 — Settle × Ika cross-chain extension
├── infra/supabase/migrations/    schema + RLS + receipt views
└── docs/
    ├── IKA-INTEGRATION.md    Cross-chain integration story
    ├── IKA-TEST-REPORT.md    Test evidence + reproduction commands
    └── PRODUCT_SPEC.md       Full feature decomp + primitive inventory
```

---

## Published packages

| Registry | Package | Use |
|---|---|---|
| npm | [`create-settle-merchant`](https://www.npmjs.com/package/create-settle-merchant) | scaffold a Settle merchant: keypair + webhook secret + capability hash + `.env` template |
| npm | [`@settle-web/web-components`](https://www.npmjs.com/package/@settle-web/web-components) | `<settle-pay>` and `<settle-verify>` custom elements; drop into any HTML page |
| PyPI | [`settle-protocol-sdk`](https://pypi.org/project/settle-protocol-sdk/) | Python receipt kernel + `verifyReceipt` + LangChain + CrewAI adapters |

---

## License

[MIT](./LICENSE). The `@settle/sdk` canonical hashing + `verifyReceipt` modules are public goods for any team building hash-committed audit trails on Solana.

## Security

See [`SECURITY.md`](./SECURITY.md). Audited against [`coral-xyz/sealevel-attacks`](https://github.com/coral-xyz/sealevel-attacks) patterns. Report issues to `xprtqk@gmail.com` with subject `SETTLE SECURITY`.

## Contributing

The TS, Python, and Rust SDKs accept PRs. The on-chain Anchor program is MIT — fork, audit, or build on top.
