# ENV_REQUIRED_FOR_FULL_DEMO

Environment variables that gate full-app behaviour. Set these on the
Vercel deploy before a hackathon demo or stakeholder walkthrough.

Legend:
- 🔴 **REQUIRED** — demo will visibly fail without it
- 🟡 **OPTIONAL** — feature gracefully degrades or is hidden
- 🟢 **ALREADY SET** — confirmed live on `use-settle.vercel.app`

| Env var | Status | Feature blocked | Routes affected | Safe placeholder | Notes |
|---|---|---|---|---|---|
| `SUPABASE_URL` | 🟢 SET | All Supabase reads/writes | every receipts/cards/handles route | `https://nbufrcbqjwlfrodinniy.supabase.co` (visible in /api/health) | Confirmed via /api/health |
| `SUPABASE_SERVICE_ROLE_KEY` | 🟢 SET | RLS bypass for server routes | /api/dashboard, /api/ledger, /api/dashboard/v6, /api/spending/insights, /api/trust, /api/handles/[handle]/profile, /api/graphql, /api/swap/quote-and-build (insert) | from Supabase project settings | Confirmed because /api/ledger reads RLS'd rows |
| `NEXT_PUBLIC_SUPABASE_URL` | 🟢 SET | Client-side anon Supabase reads | client components that hit Supabase directly | (same as `SUPABASE_URL` for the project) | Mirror of SUPABASE_URL prefixed for client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 🟢 SET | Client-side reads, server fallback | every receipts route as fallback | from Supabase project settings | |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | 🟢 SET (`devnet`) | RPC selection | every wallet flow | `devnet` for hackathon, `mainnet` for prod | |
| `NEXT_PUBLIC_RPC_URL` | 🟡 OPTIONAL | Override default Solana RPC | every tx build | `https://devnet.helius-rpc.com/?api-key=...` | Falls back to Helius+key or `clusterApiUrl` |
| `HELIUS_API_KEY` | 🟡 OPTIONAL | Helius RPC if no explicit URL | every tx build | from helius.dev | Used as fallback when NEXT_PUBLIC_RPC_URL unset |
| `NEXT_PUBLIC_E2E_BURNER` | 🔴 **NEVER on production** | E2E Persona wallet (testing only) | wallet modal | `1` only on the `audit/e2e-burner` preview branch | If set on prod, anyone can sign as the audit's test wallet (security hole) |
| `NEXT_PUBLIC_MERCHANT_ARXIV` | 🔴 REQUIRED for agent flows | /cards/new defaults, agent template Hire | /cards/new, /agents/templates/[slug]/hire | a real allowlisted Solana pubkey of the arxiv-fetch service | Without this, `/cards/new` form starts with empty merchant rows; `/api/actions/hire/[slug]/spawn` returns 503 `merchant_allowlist_unconfigured` |
| `NEXT_PUBLIC_MERCHANT_TRANSLATE` | 🔴 REQUIRED for agent flows | same | same | a real translate service pubkey | |
| `NEXT_PUBLIC_MERCHANT_SUMMARY` | 🔴 REQUIRED for agent flows | same | same | a real summary service pubkey | |
| `SETTLE_RELAYER_PRIVATE_KEY` | 🟢 SET | Phase 5 cron signer | `/api/cron/tick`, `/api/cron/sign-and-fire` | base58 keypair secret | Confirmed via /admin/preflight (Relayer keypair: green) |
| `SETTLE_RELAYER_LIVE` | 🟢 SET (`true`) | Toggles whether the relayer fires real txs | scheduled allowance flow | `true` on prod | /admin/preflight shows Live mode green |
| `CRON_SECRET` | 🟢 SET (probably) | Operator endpoints | /admin/cron Run-Now, /api/cron/tick, /api/cron/sign-and-fire | random 32-byte hex | /admin/preflight shows Cron secret green |
| `SETTLE_WEBHOOK_SIGNING_SECRET` | 🟡 NOT SET | Signed webhook delivery | /m/[handle]/webhook delivery | random 32-byte hex | /admin/preflight shows yellow: webhook payloads will be unsigned |
| `SETTLE_CNFT_TREE_PUBKEY` | 🟡 NOT SET | Compressed-NFT receipt mints | every receipt mint flow | a Solana pubkey of the cNFT tree | /api/health shows `cnft_infra: { ok: false, detail: "SETTLE_CNFT_TREE_PUBKEY not set" }` |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | 🟡 NOT SET | Idempotency keys, rate limit | /api/swap/quote-and-build (idempotency), /api/sandbox/airdrop (rate-limit) | from upstash.com console | /api/health shows ok: false. Sandbox airdrop falls back gracefully but loses single-airdrop-per-24h enforcement |
| `NEXT_PUBLIC_APP_URL` or `APP_URL` | 🟡 OPTIONAL (recommended) | Server-side fetch base URL | /r/[id], /m/[handle], /receipts/[id]/print | `https://use-settle.vercel.app` | Falls back to `VERCEL_URL` if unset, then `localhost:3000` (which 404s on Vercel; this caused Bug #3, #22) |
| `OPENAI_API_KEY` | 🟡 OPTIONAL | AI dispute drafts | /api/disputes/draft | from platform.openai.com | Without it, dispute draft would 503 |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | 🟡 OPTIONAL | Error reporting | dev-only | from sentry.io | When unset the Sentry wrapper is skipped (faster local dev) |
| `SENTRY_ORG`, `SENTRY_PROJECT` | 🟡 OPTIONAL | Source-map upload to Sentry | build-time | | Only matters if SENTRY_DSN is set |
| `NEXT_PUBLIC_BASE_URL` | 🟡 OPTIONAL legacy | Same role as APP_URL | older server-rendered pages | `https://use-settle.vercel.app` | Mostly superseded by VERCEL_URL fallback after Bug #3 fix |

## Hackathon demo checklist

Before walking a judge through a demo, confirm:
- [x] Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] Solana: `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`, RPC works
- [x] Relayer: `SETTLE_RELAYER_PRIVATE_KEY`, `SETTLE_RELAYER_LIVE=true`, `CRON_SECRET`
- [ ] Merchants for agent flows: `NEXT_PUBLIC_MERCHANT_ARXIV`, `NEXT_PUBLIC_MERCHANT_TRANSLATE`, `NEXT_PUBLIC_MERCHANT_SUMMARY`
  - **If you skip these, the agent template Hire flow will 503.** Set at minimum the ARXIV one with a known allowlisted merchant on devnet.
- [ ] Optional polish: `SETTLE_WEBHOOK_SIGNING_SECRET`, `SETTLE_CNFT_TREE_PUBKEY`, `UPSTASH_REDIS_REST_URL/TOKEN`
- [ ] Production safety: `NEXT_PUBLIC_E2E_BURNER` is **NOT** set
- [ ] Server-side fetch: `NEXT_PUBLIC_APP_URL=https://use-settle.vercel.app` (or rely on VERCEL_URL fallback)

## What if a demo blocker still hits during the live show?

| Symptom | Likely missing var | Workaround |
|---|---|---|
| /agents/templates Hire → 503 | `NEXT_PUBLIC_MERCHANT_*` | Skip Hire; use /cards/new with a manually pasted merchant pubkey |
| /m/[handle]/webhook → register fails | `SETTLE_WEBHOOK_SIGNING_SECRET` | Skip webhook segment; demo /m/[handle]/qr or /receive instead |
| Receipt mint never appears | `SETTLE_CNFT_TREE_PUBKEY` | The receipt still exists in Supabase + on-chain `record_receipt`. Show /verify with the hash to demonstrate the cryptographic guarantee. |
| /admin/cron Run Now → 401 | `CRON_SECRET` | Show that Vercel cron auto-fires on schedule (visible on /audit page). |
| /sandbox airdrop → exhausted | (rate-limited externally) | Show fallback CTA links to faucet.solana.com / faucet.circle.com — that's already wired (Bug #11 verified graceful). |
