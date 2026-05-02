# Integration Graph

## Main Runtime Graph

```text
User / Wallet / Phantom
  -> apps/web pages
  -> apps/web API routes
  -> packages/sdk helpers
  -> Solana RPC / Anchor program / SPL token / Memo / Actions
  -> Helius logs
  -> apps/indexer
  -> Supabase Postgres
  -> apps/web receipt/dashboard/profile pages
```

## Agent Spend Graph

```text
Demo agent or MCP client
  -> x402 proxy route
  -> dual signature / nonce / policy check
  -> Anchor spend_via_pact or record_denial
  -> PolicyDecisionEvent
  -> indexer mirror
  -> receipts table
  -> receipt page / leaderboard / webhook / badge/compression workers
```

## Consumer Payment Graph

```text
User opens /send, /pay/[token], /at/[handle], /split-bill/[id]
  -> UI builds payment intent
  -> API builds transaction
  -> wallet signs
  -> SPL TransferChecked + memo/reference
  -> receipt row / kernel commit
  -> receipt page / feed / handle profile
```

## Receipt Graph

```text
Payment or policy decision
  -> receipt_hash + reason_hash + policy_snapshot_hash + purpose/context hash
  -> Postgres receipt row
  -> optional attachment/narration/tag/refund state
  -> optional cNFT/compressed mirror/badge
  -> verify endpoint + SDK verifier
```

## Worker Graph

```text
Solana logs / Postgres rows
  -> apps/indexer/src/index.ts
  -> escrow-cron.ts
  -> webhook-worker.ts
  -> badges-mint.ts / badge-cron.ts
  -> compress-cron.ts
  -> federation-poller.ts
```

## Developer Graph

```text
External app / MCP server / SDK consumer
  -> @settle/sdk or MCP middleware
  -> Settle API / on-chain program
  -> receipts + verification widgets
```

## Integration Checks Required

- Every user-facing payment flow must produce a receipt.
- Every receipt must verify or honestly state why partial.
- Every on-chain event mirrored in DB must have an indexer decoder.
- Every public/private surface must respect `public_feed` and RLS.
- Every API that writes money state must have auth, idempotency, and error handling.
- Every worker must be restart-safe and idempotent.

