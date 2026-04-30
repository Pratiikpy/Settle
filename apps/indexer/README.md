# @settle/indexer

Helius LaserStream-based indexer that watches the `settle-agent-card` program for `PolicyDecisionEvent` emissions, decodes the Borsh, writes to Supabase, and runs the webhook delivery worker.

## Run
```bash
pnpm dev:indexer
```

Also runs in `pnpm dev:all`.

## What it does

1. **Subscribes** to `connection.onLogs(SETTLE_PROGRAM_ID)` over Helius WebSocket
2. **Filters** for `Program data:` log lines (Anchor's event encoding)
3. **Decodes** the 8-byte discriminator + Borsh struct (matching the IDL in `@settle/sdk`)
4. **Writes** each event into Supabase `policy_decisions` table → triggers `/activity` Realtime updates
5. **Polls** `receipts` where `webhook_delivery_status='pending'` every 30s and fires HMAC-signed POSTs to merchant webhook URLs

## Required env

```
HELIUS_API_KEY=
SETTLE_PROGRAM_ID=
SETTLE_CLUSTER=devnet
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SETTLE_WEBHOOK_SIGNING_SECRET=     # HMAC for webhook signatures
MERCHANT_WEBHOOK_URL_<PREFIX>=     # per-merchant webhook URL (V1 lookup)
```

## Architecture notes

- Subscribe runs forever; webhook worker is a 30s polling loop alongside it
- Both share one Supabase client + one Solana connection
- `SIGINT` cleanly stops the webhook worker before exiting
