# API Map

This is a grouped inventory, not a full OpenAPI spec.

## Auth and Identity

- `/api/auth/challenge`
- `/api/handles/claim`
- `/api/handles/by-pubkey`
- `/api/handles/[handle]/profile`
- `/api/handles/[handle]/relationship`
- `/api/handles/[handle]/badges`
- `/api/sealed-box-pubkey`
- `/api/notifications/subscribe`

## Cards, Pacts, Agents

- `/api/agents/create-card`
- `/api/agents/credential`
- `/api/agents/spawn`
- `/api/cards/list`
- `/api/cards/delegated`
- `/api/cards/[id]/revoke`
- `/api/cards/[id]/privacy`
- `/api/cards/[id]/pacts`
- `/api/cards/[id]/receipts`
- `/api/cards/[id]/receipts/csv`
- `/api/cards/[id]/authority-info`
- `/api/cards/[id]/bulk-close`
- `/api/x402/proxy/[merchant]`

## Streaming And Escrow

- `/api/streaming-pacts/open`
- `/api/streaming-pacts/[id]/claim`
- `/api/streaming-pacts/[id]/pause`
- `/api/streaming-pacts/[id]/resume`
- `/api/escrows/open`
- `/api/escrows/[id]/release`
- `/api/escrows/[id]/dispute`

## Receipts

- `/api/receipts/[requestId]`
- `/api/receipts/[requestId]/verify`
- `/api/receipts/[requestId]/refund`
- `/api/receipts/[requestId]/refund-links`
- `/api/receipts/[requestId]/tags`
- `/api/receipts/[requestId]/attachments`
- `/api/receipts/[requestId]/attachments/[attachmentId]/play`
- `/api/receipts/[requestId]/decrypt`
- `/api/receipts/[requestId]/narrate`
- `/api/search/receipts`

## Payments And Consumer Flows

- `/api/payment-links`
- `/api/payment-links/[token]`
- `/api/send/link/claim`
- `/api/swap/quote-and-build`
- `/api/intent/parse`
- `/api/sp/[merchant]/[slug]`
- `/api/pricelist`
- `/api/price/sol-usd`
- `/api/sandbox/airdrop`
- `/api/relayer`
- `/api/preflight`

## Split, Group, Gift, Schedule, Allowance

- `/api/split-bills`
- `/api/split-bills/[id]`
- `/api/split-bills/[id]/pay`
- `/api/split-bills/[id]/confirm`
- `/api/group-accounts`
- `/api/group-accounts/approve`
- `/api/group-accounts/request-spend`
- `/api/group-accounts/[group_id]/requests`
- `/api/gift-sends`
- `/api/gift-sends/claim`
- `/api/gift-sends/spawn-pact`
- `/api/gift-sends/attach-pact`
- `/api/scheduled-sends`
- `/api/scheduled-sends/spawn-pact`
- `/api/scheduled-sends/attach-pact`
- `/api/scheduled-sends/topup-pact`
- `/api/allowances`
- `/api/allowances/spawn-kid-card`
- `/api/allowances/attach-kid-card`
- `/api/round-up`
- `/api/save-for`

## Merchants

- `/api/merchants/[handle]/profile`
- `/api/merchants/[handle]/analytics`
- `/api/merchants/[handle]/disputes`
- `/api/merchants/[handle]/disputes/resolve`
- `/api/merchants/[handle]/webhook`
- `/api/merchants/verify-domain`

## Public, Protocol, Federation

- `/api/actions/router/[handle]/[type]`
- `/api/actions/request/[slug]`
- `/api/actions/revoke/[card]`
- `/api/actions/hire/[slug]`
- `/api/actions/hire/[slug]/spawn`
- `/api/federation/list`
- `/api/federation/import`
- `/api/admin/federation/origins`
- `/api/admin/federation/retry`
- `/api/import/solana-pay`
- `/api/leaderboard`
- `/api/leaderboard/[capabilityHash]`
- `/api/capabilities`
- `/api/stats`
- `/api/feed`
- `/api/ledger`
- `/api/trust/[pubkey]`
- `/api/verify/[hash]`
- `/api/verify-build`
- `/api/graphql`
- `/api/health`

## AI/Assistant/Bookkeeping

- `/api/bookkeeper/categorize`
- `/api/disputes/draft`
- `/api/fraud/scan`
- `/api/voice/transcribe`
- `/api/spend/forecast`
- `/api/spending/insights`

## Cron/Admin

- `/api/cron/phase5-tick`
- `/api/cron/phase5-signer`
- `/api/admin/cron/recent`
- `/api/audit/phase5`

## API Audit Questions

- Which routes require wallet signature?
- Which routes require service role?
- Which routes can be called publicly?
- Which routes write money state?
- Which routes create on-chain txs?
- Which routes are idempotent?
- Which routes are devnet-only, mainnet-only, or simulated?

