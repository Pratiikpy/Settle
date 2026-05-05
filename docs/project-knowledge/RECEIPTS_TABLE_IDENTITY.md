# `public.receipts` — column-identity contract

This file documents the most consequential architectural insight from the
2026-05-05 audit (Bug #10 → Bug #38 class). **Read this before touching any
endpoint that queries `receipts`** — the silent-empty-results pattern lurks
in every aggregation query that doesn't follow it.

## The columns

`public.receipts` was originally designed for x402 agent-card spending.
Two pubkey columns identify each row:

- **`card_pubkey`** — the spending identity. **NOT always an agent card.**
- **`merchant_pubkey`** — the recipient (always a Solana pubkey).

There is also a `pact_pubkey` (nullable, links to a pact for x402 spends).

There are NO `sender_pubkey` or `recipient_pubkey` columns. Several routes
assumed there were. Those routes silently returned empty results because
PostgREST 400'd on the unknown column and the destructure swallowed the
error. See `apps/web/app/api/ledger/route.ts` (commit 4b39429) for the
fix pattern.

## What `card_pubkey` means depends on `receipt_kind`

| `receipt_kind`        | `card_pubkey` is…                           |
|-----------------------|---------------------------------------------|
| `x402_spend`          | the agent's card pubkey                     |
| `agent_send`          | the agent's card pubkey                     |
| `agent_card_action`   | the agent's card pubkey                     |
| `direct_send`         | **the sender's wallet pubkey**              |
| Solana Pay imports    | the importer's wallet pubkey                |

So `card_pubkey` is a **synthetic spending identity** — agent card OR
sender wallet. Any query that aggregates receipts for a user must
include both.

## The query pattern

To fetch receipts where the user is the spender (any kind):

```ts
const { data: cards } = await sb
  .from("agent_cards")
  .select("card_pubkey")
  .eq("authority_pubkey", userWallet);
const cardPubkeys = (cards ?? []).map((c) => c.card_pubkey);

// IMPORTANT: include the user's wallet itself for direct sends.
const cardKeysWithSelf = [userWallet, ...cardPubkeys];

const { data: receipts, error } = await sb
  .from("receipts")
  .select(...)
  .in("card_pubkey", cardKeysWithSelf)  // never just cardPubkeys
  ...
```

To fetch receipts where the user is the recipient:

```ts
.eq("merchant_pubkey", userWallet)
```

To fetch both sides in one go (UNION at app layer is more reliable than
PostgREST `.or()` with multiple `eq` clauses on the same column):

```ts
const [byCard, byMerchant] = await Promise.all([
  sb.from("receipts").select(...).in("card_pubkey", cardKeysWithSelf).limit(N),
  sb.from("receipts").select(...).eq("merchant_pubkey", userWallet).limit(N),
]);
const merged = [...(byCard.data ?? []), ...(byMerchant.data ?? [])];
const seen = new Set<string>();
const deduped = merged.filter((r) => !seen.has(r.request_id) && seen.add(r.request_id));
deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
```

See `apps/web/app/api/dashboard/v6/route.ts` (commit af8a4b8) for the
canonical implementation.

## Always destructure the error

The **silent failure** that made Bug #10 hard to diagnose was that
`sb.from(...).select(...).or(<bad-filter>)` returned `{ data: null,
error: { message: "..." } }`. The route did `const { data } = await ...`
and used `data ?? []`, which looked identical to "no rows."

**Always**:

```ts
const { data, error } = await sb.from("receipts").select(...).or(...);
if (error) {
  console.error("[<route>] supabase:", error.message);
  // Surface in API response if appropriate, e.g.:
  return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
}
```

A wrong column name would have been caught the first time the endpoint
was hit if every read destructured `error`. Don't skip it.

## Endpoints fixed during the audit (reference)

| Endpoint | Commit | Bug |
|---|---|---|
| `/api/ledger` | 4b39429 | #10 |
| `/api/swap/quote-and-build` (insert) | 4b39429 | #10 |
| `/api/dashboard` recent_receipts | 48833e2 | #21 |
| `/api/dashboard/v6` recent_receipts | af8a4b8 | #21 v2 |
| `/api/dashboard/v6` outboundToday | 3a71268 | #38 |
| `/api/search/receipts` | 3a71268 | #38 |
| `/api/spending/insights` | 3a71268 | #38 |
| `/api/handles/[handle]/profile` | bac09b9 | #38 |
| `/api/trust/[pubkey]` | bac09b9 | #38 |
| `/api/spend/forecast` | (this commit) | #38 |
| `/api/graphql.receiptsForWallet` | 9b0dd3f | #37 |

## Endpoints that may still need this treatment

- `/api/bookkeeper/categorize` — likely intentional agent-only
- `/api/crosschain/cards` — agent-card-specific
- `/api/fraud/scan` — agent-card-specific
  
Audit each as user-aggregation surfaces are added.
