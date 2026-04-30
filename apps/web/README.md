# @settle/web

The consumer-facing Settle app. Next.js 15 App Router on Vercel.

## Run
```bash
pnpm dev:web
# or from root:
pnpm dev:all
```

## Routes
| Route | Purpose |
|---|---|
| `/` | Hero + 6-feature grid |
| `/onboarding` | 4-step guided onboarding (≤60s) |
| `/sandbox` | Devnet airdrop |
| `/cards` | Your cards + pacts (Supabase Realtime) |
| `/cards/new` | Create your first AgentCard |
| `/cards/[id]` | Card detail + receipts + revoke (Realtime) |
| `/send` | P2P USDC transfer with Solana Pay reference |
| `/request` | Merchant QR / Blink generator |
| `/agents` | Hire-an-AI-agent flow |
| `/activity` | Live agent activity (Helius LaserStream → Supabase Realtime) |
| `/feed` | Public live feed |
| `/spending` | Spending insights with category breakdown |
| `/blink/[slug]` | Public Blink share page |

## API endpoints (selected)
| Endpoint | Purpose |
|---|---|
| `POST /api/agents/create-card` | Build `create_card` Anchor ix tx |
| `POST /api/agents/spawn` | Build `open_pact` ix tx |
| `POST /api/agents/credential` | Build `settle://` envelope (server- or client-signed) |
| `POST /api/cards/[id]/revoke` | Build `revoke` or `close_pact` ix tx |
| `POST /api/x402/proxy/[merchant]` | Full x402 facilitator (dual-sig + on-chain policy + spend + cNFT mint) |
| `POST /api/sandbox/airdrop` | Devnet faucet (0.5 SOL + 25 test-USDC) |
| `POST /api/send/build` | Build Solana Pay transfer tx |
| `GET /api/cards/list?authority=` | User's cards + pacts |
| `GET /api/cards/[id]/receipts` | Receipt thread |
| `GET /api/cards/[id]/receipts/csv` | Tax-export CSV download |
| `GET /api/cards/[id]/authority-info` | Squads multisig detection |
| `POST /api/cards/[id]/privacy` | Privacy toggle (wallet-sig auth required) |
| `GET /api/receipts/[id]/verify` | verifyReceipt() recompute against on-chain hashes |
| `GET /api/receipts/[id]/decrypt` | Decrypt sealed-box metadata (wallet-sig auth required) |
| `GET /api/auth/challenge?pubkey=` | Wallet-sig challenge nonce |
| `GET /api/feed?limit=` | Public spend feed (filtered by `public_feed`) |
| `GET /api/spending/insights?authority=` | Aggregated spending |
| `GET /api/health` | Integration health check |
| `GET /api/price/sol-usd` | Pyth Hermes SOL/USD live price |
| `GET /api/og` | Default OG image (1200×630) |
| `GET /api/og/cnft/[slot]` | Per-receipt cNFT image (1024×1024) |
| `GET /api/cnft/collection.json` | Token Metadata for Settle Receipts collection |
| `GET /api/cnft/[id]/metadata.json` | Per-cNFT Token Metadata |
| `GET /api/resolve?handle=` | Settle handle / .sol / pubkey resolver |
| `GET/POST /api/actions/hire/[slug]` | Solana Action endpoint for Blinks |
| `GET/POST /api/actions/revoke/[card]` | Solana Action for kill-switch Blinks |
| `GET/POST /api/actions/request/[slug]` | Merchant Solana Pay Action |
| `GET /.well-known/actions.json` | Dialect Blinks registry manifest |

## Required env vars
See `.env.example` at repo root. Minimum to run:
- `NEXT_PUBLIC_RPC_URL` — Helius URL with API key
- `NEXT_PUBLIC_SETTLE_PROGRAM_ID` — set after `pnpm deploy:devnet`
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + anon key
- `SETTLE_FACILITATOR_PRIVKEY` — base58 64-byte secret (sandbox cards)
- `UPSTASH_REDIS_REST_URL` + `_TOKEN` — for nonce dedup + rate limit
- `SETTLE_SEALED_BOX_PUBKEY` + `_PRIVKEY` — generated via `pnpm tsx scripts/seal-keygen.ts`
- `SETTLE_CNFT_TREE_PUBKEY` + `_COLLECTION_PUBKEY` + `_TREE_AUTHORITY_KEYPAIR_B58` — generated via `pnpm cnft:setup`
