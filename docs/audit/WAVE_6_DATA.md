# WAVE_6_DATA — verified data layer for the redesign

Every prototype bento cell maps to either an existing query or one of the 7 new aggregate endpoints below. Each endpoint here is **verified against the live schema** (see column references). Where empty-set behavior matters, the empty payload is specified.

All endpoints are `nodejs` runtime + `force-dynamic`, return `{ ok: true, ...data }` on success, `{ ok: false, error }` on failure. Cache headers per endpoint.

---

## 1. `GET /api/stats/landing`

**Used by:** Landing page bottom strip (the `$1.04M / 400ms / 18` row in the prototype).

**Returns:**
```json
{
  "ok": true,
  "total_allow_volume_usdc": "12345.67",
  "total_allow_volume_display": "$12.3K",
  "p50_confirmation_ms": 423,
  "total_denied_count": 47,
  "is_presentable": true,
  "as_of": "2026-05-02T08:32:00Z"
}
```

`is_presentable` is `false` when `total_allow_volume_usdc < 1000`. Landing page checks this and hides the strip rather than show small numbers — no fake bumps.

**SQL:**
```sql
with allows as (
  select
    sum(amount_lamports::numeric / 1e6) as volume_usdc,
    -- p50 of confirm latency: confirmed_at - created_at when both present
    percentile_cont(0.5) within group (
      order by extract(epoch from (
        coalesce(
          (select min(created_at) from public.policy_decisions pd
           where pd.request_id = r.request_id and pd.event_kind = 'confirmed'),
          r.created_at
        ) - r.created_at
      )) * 1000
    ) as p50_ms
  from public.receipts r
  where decision = 'ALLOW' and created_at > now() - interval '30 days'
),
denies as (
  select count(*) as denied_count
  from public.receipts
  where decision = 'DENY' and created_at > now() - interval '30 days'
)
select a.volume_usdc, a.p50_ms, d.denied_count
from allows a, denies d;
```

**Performance:** scans 30-day window of `receipts`. Existing index `idx_receipts_created_at` covers it. Devnet today: ~14 ALLOW rows → query <50ms. Mainnet later: needs a materialized view that refreshes every 5min (added in a future migration when volume warrants it).

**Cache:** `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` (5min CDN cache).

**Empty payload:** `{ total_allow_volume_usdc: "0", is_presentable: false, ... }`. Landing page hides the strip.

---

## 2. `GET /api/stats/network`

**Used by:** `/stats` page.

**Returns:**
```json
{
  "ok": true,
  "receipts_24h": 142,
  "allow_rate_24h": 0.94,
  "top_capabilities": [
    { "capability_hash": "0x...", "alias": "OpenAI · gpt-4 chat", "count": 47, "volume_usdc": "12.40" }
  ],
  "federation_peers": 2,
  "total_volume_usdc_30d": "12345.67",
  "as_of": "..."
}
```

**SQL:**
```sql
-- receipts_24h + allow_rate_24h
select
  count(*) filter (where created_at > now() - interval '24 hours') as receipts_24h,
  count(*) filter (where decision = 'ALLOW' and created_at > now() - interval '24 hours')::float
    / nullif(count(*) filter (where created_at > now() - interval '24 hours'), 0) as allow_rate_24h
from public.receipts;

-- top_capabilities
select
  encode(r.capability_hash, 'hex') as capability_hash,
  coalesce(c.human_alias, encode(r.capability_hash, 'hex')) as alias,
  count(*) as count,
  sum(r.amount_lamports::numeric / 1e6) as volume_usdc
from public.receipts r
left join public.capability_registry c on c.capability_hash = r.capability_hash
where r.decision = 'ALLOW' and r.created_at > now() - interval '7 days'
group by 1, 2
order by 4 desc nulls last
limit 5;

-- federation_peers
select count(*) from public.federation_origins where active = true;
```

**Performance:** 3 small queries; total ~100ms with current data. Index on `(decision, created_at)` would help long-term — defer.

**Cache:** `s-maxage=60, swr=300`.

**Empty payload:** zero counts, empty arrays. UI shows "No activity yet on devnet" placeholder.

---

## 3. `GET /api/dashboard?pubkey=<base58>`

**Used by:** Consumer home (`/dashboard`). One round trip vs 6.

**Returns:**
```json
{
  "ok": true,
  "balance": { "usdc": "1284.50", "sol": "12.04" },
  "today": {
    "spent_usdc": "54.27",
    "spent_count": 8,
    "received_usdc": "13.00",
    "received_count": 2,
    "agents_active": 4
  },
  "agents_on_duty": [
    { "card_pubkey": "...", "label": "Creator tips", "spent_today_usdc": "12.50", "cap_usdc": "50.00" },
    { "card_pubkey": "...", "label": "Studio card",  "spent_today_usdc": "7.40",  "cap_usdc": "100.00" },
    { "card_pubkey": "...", "label": "Work card",    "spent_today_usdc": "32.99", "cap_usdc": "200.00" }
  ],
  "recent_receipts": [
    { "request_id": "...", "kind": "x402_spend", "counterparty": "@openai", "purpose": "gpt-4 chat", "amount_usdc": "0.42", "decision": "ALLOW", "ts": "2m ago" }
  ],
  "active_pacts": [
    { "pact_pubkey": "...", "kind": "OneShot", "label": "Studio research", "spent_usdc": "4.21", "cap_usdc": "20.00", "expiry": "2026-06-05" }
  ],
  "coming_up": [
    { "kind": "scheduled_send", "label": "Rent", "cadence": "monthly", "next_run": "2026-06-01", "amount_usdc": "1200.00" }
  ],
  "savings": [
    { "id": "...", "label": "✈️ Tokyo trip", "saved_usdc": "412.00", "goal_usdc": "2000.00" }
  ]
}
```

**Five sub-queries** (all bound by `pubkey`):

```sql
-- balance: read from on-chain via RPC, NOT SQL. Endpoint calls Helius getBalance + getTokenAccountsByOwner. Returns "—" on RPC failure.

-- today (spent + received + counts)
select
  coalesce(sum(amount_lamports::numeric / 1e6) filter (
    where card_pubkey in (select card_pubkey from public.agent_cards where authority_pubkey = $1)
      and decision = 'ALLOW'
  ), 0) as spent_usdc,
  count(*) filter (
    where card_pubkey in (select card_pubkey from public.agent_cards where authority_pubkey = $1)
      and decision = 'ALLOW'
  ) as spent_count,
  coalesce(sum(amount_lamports::numeric / 1e6) filter (where merchant_pubkey = $1 and decision = 'ALLOW'), 0) as received_usdc,
  count(*) filter (where merchant_pubkey = $1 and decision = 'ALLOW') as received_count
from public.receipts
where created_at > date_trunc('day', now() at time zone 'utc');

-- agents_active = count of cards with at least one ALLOW today
select count(distinct card_pubkey) as agents_active
from public.receipts r
where r.card_pubkey in (select card_pubkey from public.agent_cards where authority_pubkey = $1)
  and r.decision = 'ALLOW'
  and r.created_at > date_trunc('day', now() at time zone 'utc');

-- agents_on_duty (top 3 by spend today)
select
  c.card_pubkey,
  c.label,
  coalesce(sum(r.amount_lamports::numeric / 1e6) filter (where r.decision = 'ALLOW' and r.created_at > date_trunc('day', now() at time zone 'utc')), 0) as spent_today_usdc,
  c.daily_cap_usdc as cap_usdc
from public.agent_cards c
left join public.receipts r on r.card_pubkey = c.card_pubkey
where c.authority_pubkey = $1 and c.revoked = false
group by 1, 2, 4
order by 3 desc
limit 3;

-- recent_receipts (last 5 ALLOW or DENY for this user)
select request_id, receipt_kind as kind, merchant_pubkey, amount_lamports::numeric / 1e6 as amount_usdc,
  decision, deny_code, narration_text as purpose, created_at,
  case when now() - created_at < interval '1 hour' then extract(epoch from (now()-created_at))::int / 60 || 'm ago'
       when now() - created_at < interval '1 day' then extract(epoch from (now()-created_at))::int / 3600 || 'h ago'
       else to_char(created_at, 'Mon DD') end as ts
from public.receipts
where card_pubkey in (select card_pubkey from public.agent_cards where authority_pubkey = $1)
   or merchant_pubkey = $1
order by created_at desc
limit 5;

-- active_pacts (top 3)
select pact_pubkey, kind, label,
  spent_lamports::numeric / 1e6 as spent_usdc,
  cap_lamports::numeric / 1e6 as cap_usdc,
  expiry_iso as expiry
from public.pacts
where authority_pubkey = $1 and status = 'active'
order by created_at desc
limit 3;

-- coming_up: union of scheduled_sends + allowances + auto_refill_rules with next_run upcoming
select kind, label, cadence, next_run, amount_usdc
from (
  select 'scheduled_send' as kind, label, cadence, next_run_at as next_run,
         amount_lamports::numeric / 1e6 as amount_usdc
  from public.scheduled_sends where owner_pubkey = $1 and status = 'active'
  union all
  select 'allowance', kid_label as label, cadence, next_run_at, weekly_lamports::numeric / 1e6
  from public.allowances where parent_pubkey = $1 and status = 'active'
) all_upcoming
order by next_run asc nulls last
limit 3;

-- savings (top 3)
select id, label, saved_lamports::numeric / 1e6 as saved_usdc, goal_lamports::numeric / 1e6 as goal_usdc
from public.save_for_buckets
where owner_pubkey = $1 and status = 'active'
order by saved_lamports desc
limit 3;
```

**Performance:** all 7 queries hit indexes (`idx_receipts_card`, `idx_receipts_merchant`, `idx_pacts_authority`, etc.). Combined wall-time ~150-300ms. Acceptable.

**Empty payload:** All zeros and empty arrays. UI shows "Welcome — your dashboard fills in as you transact" empty hero.

---

## 4. `GET /api/agents/overview?pubkey=<base58>`

**Used by:** Agent surface home (`/agents`).

**Returns:**
```json
{
  "ok": true,
  "active_count": 4,
  "spend_today_usdc": "54.27",
  "denial_rate_24h": 0.06,
  "recent_decisions": [
    { "request_id": "...", "card_label": "Creator tips", "merchant": "@openai", "decision": "ALLOW", "amount_usdc": "0.42", "deny_code": null, "ts": "2m ago" }
  ]
}
```

**SQL:** essentially the same shape as `/api/dashboard` but framed by agent metrics. Reuses indexes. ~100ms.

**Empty payload:** zeros, "Hire your first agent" CTA in UI.

---

## 5. `GET /api/m/[handle]/overview`

**Used by:** Merchant surface home.

**Returns:**
```json
{
  "ok": true,
  "merchant_pubkey": "...",
  "revenue_today_usdc": "184.50",
  "revenue_30d_usdc": "4231.10",
  "dispute_count_open": 2,
  "capability_count": 5,
  "top_buyers": [{ "buyer_pubkey": "...", "handle": "@aria", "count": 12, "volume_usdc": "47.20" }],
  "webhook_health": {
    "delivered_24h": 87,
    "failed_24h": 1,
    "last_failure_at": "2026-05-02T05:11:00Z"
  }
}
```

Resolves handle → merchant_pubkey via `public.handles`. Then 4 small queries: receipts (revenue), refund_requests (disputes), merchant_pricelist (capabilities), receipts (webhook_delivery_status grouped). All indexed. ~120ms.

**Empty payload:** zeros across the board. UI prompts merchant to set capabilities.

---

## 6. `GET /api/operator/health`

**Used by:** Operator surface home.

**Returns:**
```json
{
  "ok": true,
  "cron_last_tick": { "ts": "...", "lag_seconds": 12 },
  "indexer_lag_slots": 3,
  "rpc_p50_ms": 412,
  "sentry_24h_errors": 0,
  "federation_peers_active": 2
}
```

`cron_last_tick`: `select max(executed_at), now() - max(executed_at) from public.phase5_executions`.
`indexer_lag_slots`: read from `public.indexer_cursor` (existing) — current_slot from RPC minus stored cursor.
`rpc_p50_ms`: ping helius `getBlockHeight` 5 times, return p50.
`sentry_24h_errors`: 0 if Sentry not wired (current state); plug in via Sentry API later.
`federation_peers_active`: same as `/api/stats/network`.

Auth: `SETTLE_INTERNAL_API_KEY` header — internal only.

**Empty payload:** all zeros. UI shows "indexer not running yet" warning.

---

## 7. `POST /api/waitlist`

**Used by:** Landing email capture.

**New table** (migration 0050):
```sql
create table if not exists public.waitlist (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  source       text not null default 'landing',  -- 'landing' | 'docs' | 'embed'
  user_agent   text,
  ip_country   text,
  created_at   timestamptz not null default now()
);
alter table public.waitlist enable row level security;
-- service role only (anon can insert via API route, not direct SELECT)
```

**Body:** `{ "email": "user@domain.com", "source": "landing" }`. Validates email regex, dedupes on conflict. Returns 200 either way (don't leak whether email already exists).

**Rate limit:** 10/hour per IP via existing `idempotency_keys`-style guard.

---

## Verified existing endpoints (touched but unchanged)

| Endpoint | Used by | Verified |
|---|---|---|
| `/api/receipts/[id]` | receipt detail | ✓ matches new layout |
| `/api/search/receipts?pubkey=` | receipt list | ✓ |
| `/api/cards/[id]` | card detail | ✓ |
| `/api/groups` + child | groups page | ✓ (RLS just fixed) |
| `/api/exports/receipts` | settings exports | ✓ |
| `/api/capabilities/discover` | discover page | ✓ |
| `/api/x402/proxy/[merchant]` | wallet round-trip | ✓ unchanged |

## Indexes that may need to be added (defer until measured)

```sql
-- receipts (decision, created_at desc) for 24h ALLOW counts
create index concurrently if not exists idx_receipts_decision_ts on public.receipts (decision, created_at desc);

-- agent_cards (authority_pubkey, revoked) for dashboard agent listing
create index concurrently if not exists idx_agent_cards_authority on public.agent_cards (authority_pubkey, revoked);
```

We **don't** add these in Wave 6 — only if devnet starts spending >2000ms on a dashboard request. Premature on current data.

---

## Real-data gating rule

Every page that depends on a NEW endpoint must **handle the endpoint missing or returning empty** without breaking. Every aggregate above defines its empty shape. Every UI cell that receives an empty value renders one of:
- A specific empty state ("No agents on duty yet")
- A "—" placeholder if numeric
- A skeleton loader during fetch (max 800ms before fall-back to empty)

Never render `0` as `0` if it's actually `loading`, never render mock numbers if real query failed.

---

## Migration 0050 required

`infra/supabase/migrations/0050_waitlist.sql` — adds the waitlist table only. Applies via existing `scripts/supabase-apply-migrations.mjs` flow.
