# Mainnet migration tracker

The complete pre-launch checklist when the cluster flips from devnet to mainnet, plus a
record of every architectural decision that's intentionally devnet-only today.

Convention per row: `<area>` → `<devnet today>` → `<mainnet target>` → `<owner action>`.

## Architectural primitives (v0.2 — codex audit rounds 1+2 fixes)

These are the things the v0.2 program rewrite locked in. All on-chain enforcement, no
silent middleware fallbacks.

| # | Area | Devnet today | Mainnet target | Action |
|---|------|--------------|----------------|--------|
| 1 | Autonomous spend primitive | `spend_via_pact` ix: agent signs, Vault PDA executes TransferChecked via program-derived signing. Authority does NOT sign per-spend. | unchanged | works as designed |
| 2 | USDC mint enforcement | `card.usdc_mint` pinned at create_card; both spend paths enforce via `address = card.usdc_mint`; TransferChecked validates decimals | unchanged | works as designed |
| 3 | Capability hash | Real BLAKE3 over canonical merchant spec (`@settle/sdk computeCapabilityHashHex`); enforced on-chain via allowlist entry's `Option<[u8;32]>` + ix arg comparison | unchanged | works as designed |
| 4 | Pact funding model | Vault PDA at `[b"pact-vault", pact]` owns the Pact's USDC ATA; `open_pact` atomically creates Pact + funds vault | unchanged | works as designed |
| 5 | Pact spent tracking | `spend_via_pact` increments `pact.spent` in the same atomic ix as the SPL transfer | unchanged | works as designed |
| 5a | **Cross-pact daily-cap enforcement** | `spend_via_pact` is `mut card` — every pact spend updates `card.used_today` + slot-based reset. Multiple pacts CANNOT compound past parent daily_cap (regression-tested on-chain). | unchanged | landed in round-2 codex fixes |
| 6 | Pact refund | `close_pact` does the on-chain TransferChecked from Vault → authority signed by Vault PDA. No off-band merchant signature required. | unchanged | works as designed |
| 7 | Revoke + policy_version | `revoke` bumps `policy_version` and emits PolicyDecisionEvent (decision=2 REVOKE) for unified ledger | unchanged | works as designed |
| 7a | **Unified DENY ledger** | `record_denial` accepts EITHER card.authority OR card.agent_pubkey as signer. Pact-mode DENYs (where facilitator == agent) now land on-chain too. | unchanged | landed in round-2 codex fixes |
| 8 | Indexer event filter | Anchor 8-byte sha256("event:<Name>") discriminator filter; explicit handlers for Policy/Pact{Opened,Closed,Spend}; unknown events are logged-not-decoded | unchanged | works as designed |
| 9 | **Custody-separated demo bootstrap** | `seed-demo-card` generates a fresh demo-user keypair (or accepts `DEMO_USER_PRIVKEY`) as authority and uses the facilitator as agent. Refuses to run if they're the same key. The `.demo-user.json` file is the only thing that can `close_pact` and reclaim funds. | replace demo-user with real user wallet | landed in round-2 codex fixes |
| 10 | **Agent keypair custody** | `/api/agents/create-card` accepts client-supplied `agent_pubkey` (server never sees agent privkey) OR falls back to server-generated for sandbox demos. Production users opt into client-supplied. | client-supplied required for production | landed in round-2 codex fixes |

## Cluster + RPC

| # | Area | Devnet | Mainnet | Action |
|---|------|--------|---------|--------|
| 9 | `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet` | `mainnet` | flip env var |
| 10 | `NEXT_PUBLIC_RPC_URL` | helius devnet | helius mainnet | regenerate API key |
| 11 | `HELIUS_API_KEY` | devnet | mainnet | swap |
| 12 | Helius Sender | devnet | mainnet | URL is the same; routes by API key |
| 13 | Indexer WS | devnet | mainnet | swap endpoints |

## Program ID + on-chain accounts

| # | Area | Devnet | Mainnet | Action |
|---|------|--------|---------|--------|
| 14 | Anchor program ID | **deployed devnet:** `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD` (commit `790be4f`) | regenerate via `solana-keygen` for mainnet — DO NOT reuse the devnet ID | from current devnet baseline: `solana-keygen new -o keys/program-mainnet.json`; `anchor build` + `anchor deploy --provider.cluster mainnet`; patch `lib.rs declare_id!` + `Anchor.toml` + env vars `NEXT_PUBLIC_SETTLE_PROGRAM_ID` + `SETTLE_AGENT_CARD_PROGRAM_ID` + `SETTLE_PROGRAM_ID`. (The dead `PLACEHOLDER_PROGRAM_ID = "SettLe1111…"` constant in `apps/web/lib/anchor-client.ts` is unused at runtime — env-based lookup throws on missing — but should be removed per AU-01-007 cleanup.) |
| 15 | USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (devnet test USDC) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | hardcoded in `lib/solana.ts` cluster check |
| 16 | Bubblegum tree authority | facilitator key | dedicated tree authority keypair | rotate; create new tree on mainnet |
| 17 | SAS Credential PDA | `SETTLE_SAS_CREDENTIAL_PDA` env | unchanged shape | run `pnpm sas:setup` (script TBD) on mainnet to create new Credential |
| 18 | SAS Schema PDA | `SETTLE_SAS_MERCHANT_SCHEMA_PDA` env | unchanged shape | re-create on mainnet |
| 19 | Lighthouse program | mainnet+devnet `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95` | unchanged | flip `SETTLE_ENABLE_LIGHTHOUSE=1` once you've tested perf |
| 20 | Squads V4 program | mainnet+devnet `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` | unchanged | detection logic still wraps the vault-PDA owner check; NOT load-bearing for spend |
| 21 | Bonfida SNS | mainnet only | unchanged | SNS only exists on mainnet — devnet returns null |
| 22 | Pyth Hermes | mainnet feeds | unchanged | one URL across clusters |

## Keys + secrets to rotate

| # | Area | Devnet | Mainnet | Action |
|---|------|--------|---------|--------|
| 23 | `SETTLE_FACILITATOR_PRIVKEY` | dev keypair = card.agent_pubkey for the demo card | mainnet keypair = card.agent_pubkey for each user's card | every user creates their own card; the facilitator is per-deployment |
| 24 | `SETTLE_SEALED_BOX_PUBKEY/PRIVKEY` | rotate | rotate | run `pnpm seal:keygen` |
| 25 | `SETTLE_VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` | rotate | rotate | run `pnpm vapid:keygen`, set subject to real `mailto:` |
| 26 | `SETTLE_WEBHOOK_SECRET` | dev secret | mainnet secret | rotate per merchant; redistribute |
| 27 | Upstash Redis | devnet instance | mainnet instance | provision separate Redis to avoid cross-cluster nonce collisions; **mandatory for spend route** |
| 28 | Supabase project | devnet project | mainnet project | recommend separate project; reapply migrations 0001..0006 |

## Demo merchants + handles

| # | Area | Devnet | Mainnet | Action |
|---|------|--------|---------|--------|
| 29 | `MERCHANT_PUBKEY_*` env vars | seeded devnet pubkeys (or your own keypairs) | real merchant pubkeys | delete demo merchants, onboard real ones via `verified_merchants` |
| 30 | `verified_merchants` table | seeded `verification_method='manual_devnet_seed'` | only `verification_method='dns_txt'` | DNS-verify each merchant via TXT at `_settle.<domain>` |
| 31 | `agent_templates` seed rows | author = `'SystemDefault…'` (intentionally non-pubkey sentinel) | claim by real authors | one-time SQL: `update agent_templates set author_pubkey=<real> where slug in (...)` |
| 32 | Demo handle seeds | optional; `DEMO_HANDLE_*_PUBKEY` env vars | not seeded | users claim their own via `/settings` |

## Feature flags / behaviors

| # | Area | Devnet | Mainnet | Action |
|---|------|--------|---------|--------|
| 33 | `SETTLE_SAS_FAIL_OPEN` | unset by default → fails closed | strict | leave unset |
| 34 | Supabase verified_merchants fallback | active when SAS env vars unset | should be replaced by mainnet SAS attestations | run `sas:setup` script before mainnet launch |
| 35 | Solscan URLs | `?cluster=devnet` | no query | `lib/solana.ts:getSolscanUrl` reads cluster |
| 36 | x402 proxy spend modes | both `spend_via_pact` (preferred) and `spend` (legacy) | unchanged | for autonomous agents prefer pact mode |

## Observability

| # | Area | Devnet | Mainnet | Action |
|---|------|--------|---------|--------|
| 37 | Console.warn for non-fatal failures | acceptable | route to Sentry/Datadog | wire structured logger before launch |
| 38 | Push notification failures | logs `failed_count` in DB | alert if `failed_count > N` per pubkey | basic monitoring rule |
| 39 | RPC timeouts | tolerated on devnet | retry with backoff on mainnet | wrap getSlot/getLatestBlockhash with retry |
| 40 | Pre-mainnet audit | not done | required | external audit of Anchor program before mainnet |

## Code references for migration sweep

When flipping cluster:
- `apps/web/lib/solana.ts` — cluster detection, USDC mint
- `apps/web/lib/anchor-client.ts` — placeholder fallback throws when actually used
- `apps/web/app/api/x402/proxy/[merchant]/route.ts` — RPC URL, USDC, facilitator key
- `apps/web/app/api/send/build/route.ts` and `apps/web/app/api/send/link/build/route.ts` — USDC mint
- `apps/web/app/api/send/link/claim/route.ts` — USDC mint
- `apps/web/lib/cnft.ts` — Bubblegum tree authority
- `programs/settle-agent-card/src/lib.rs` — `declare_id!`
- `packages/sdk/src/idl.ts` — programId default
- `apps/indexer/src/index.ts` — `SETTLE_PROGRAM_ID` env

## Things explicitly NOT done in v0.2

Documented constraints, not silent bugs. Each row carries the reason and the path to ship.

| # | Item | Why not | Path to ship |
|---|------|---------|--------------|
| 41 | Bubblegum V2 cNFTs | V2 requires MPL-Core collections + `@metaplex-foundation/mpl-bubblegum@^5.x` + `mpl-account-compression`; current code uses V1. Functional but not "V2". | bump dep, port `cnft-setup.ts` from `mintToCollectionV1` → `mintV2` (collection + metadata args change), rebuild collection on mainnet |
| 42 | Real Lighthouse SDK | We hand-build the `AssertTokenAccount` ix bytes directly. Working & verified against the published kit-js client format, but not a TypeScript-imported SDK. | install `@lighthouse-web3/clients/kit-js` once it ships @solana/web3.js bindings |
| 43 | Solana Mobile MWA | No adapter wired in `providers.tsx`. | install `@solana-mobile/wallet-adapter-mobile` + add to `wallets` array |
| 44 | Privy hooks actually used | `PrivyProvider` wraps the tree but no component imports `usePrivy`. | add `<PrivyLogin />` button to `/onboarding` if we keep Privy at all |
| 45 | Jupiter swap UI | No imports of `@jup-ag/api`, no swap route. | build a `/swap` page or remove the claim |
| 46 | Helius LaserStream gRPC | Indexer uses standard JSON-RPC `logsSubscribe` over WebSocket. Functional but not gRPC. | port to `yellowstone-grpc` against Helius gRPC endpoint |
| 47 | Codama codegen | `codama.config.ts` is a stub. Hand-written client at `apps/web/lib/anchor-client.ts` is the actual truth. | install `@codama/nodes-from-anchor` + `@codama/renderers-js` and emit a real client |
| 48 | External Anchor program audit | Only internal review + the integration tests in `programs/settle-agent-card/tests/settle-agent-card.ts`. | required before mainnet launch |
