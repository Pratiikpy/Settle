# Database Map

Supabase migrations live in `infra/supabase/migrations`.

## Migration Ranges

| Range | Main purpose |
|---|---|
| `0001` | Initial tables: receipts, policy decisions, cards, pacts, verified merchants, nonce cache, RLS/views. |
| `0002`-`0005` | Handles, privacy, push subscriptions, agent templates. |
| `0006`-`0010` | Canonical receipt persistence, refunds, attachments, pricelist, payment links. |
| `0011`-`0018` | Streaming pacts, follows, request timing, leaderboard, delivery escrow, collabs/split bills, badges, compressed receipts. |
| `0019`-`0023` | Receipt kernel, narration/emoji, trust scores, search, tags. |
| `0024`-`0030` | Imported receipts, capability registry, idempotency, bookkeeper, auto-refill/fraud, phase5 consumer breadth, federation. |
| `0031`-`0045` | Phase5 executions, federation origins/webhook delivery, scheduled sends, gifts, groups, refund decisions/linkage, round-up, merchant webhooks, domain verification, streaming claim queue. |

## Critical Tables/Views To Audit

- `receipts`
- `policy_decisions`
- `agent_cards`
- `pacts`
- `verified_merchants`
- `nonce_cache`
- `handles`
- `push_subscriptions`
- `receipt_attachments`
- `refund_requests`
- `merchant_pricelist`
- `merchant_payment_links`
- `follows`
- `collabs`
- `split_bills`
- `split_bill_payments`
- `reputation_badges`
- `compressed_receipts`
- `capability_registry`
- `idempotency_keys`
- `imported_receipts`
- `merchant_webhooks`

## RLS Audit Checklist

- Users can only read private receipts they are allowed to see.
- Public feed only shows `public_feed=true`.
- Merchant views only expose merchant-side data.
- Service role writes are limited to server/indexer routes.
- Wallet-signed routes cannot spoof another pubkey.
- Attachments/decryption rights are pinned to allowed recipient logic.
- Admin/federation/cron routes are not public write surfaces unless explicitly intended.

## Data Integrity Checklist

- Receipt kind is present for every payment path.
- Request IDs are unique and idempotent.
- Split bill payments cannot double-pay.
- Gift claims cannot double-claim.
- Payment links cannot double-claim.
- Refunds link to original receipt.
- Streaming claims are deduplicated.
- Webhook deliveries retry without duplicate semantic effects.

