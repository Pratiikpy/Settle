-- Wave 6 / P8 — Capability leaderboard view.
--
-- Aggregates ALLOW + public_feed receipts by (capability_hash, merchant_pubkey) into a
-- ranked view. This is the audit-data-as-marketing surface: agents and merchants
-- compete on real-measured metrics (avg latency, completed jobs, total volume), and the
-- numbers come straight from the on-chain ledger + the proxy's server-clock timing.
--
-- Two latency metrics, deliberately:
--
--   avg_total_latency_ms     — entry-to-exit through the proxy. Includes facilitator
--                              overhead. The user-visible number for "how fast does this
--                              service feel."
--
--   avg_merchant_latency_ms  — upstream-only. Isolates the merchant's service speed,
--                              defensible against arguments about facilitator pipeline.
--
-- Both come from server-clock timestamps in the same proxy process — no clock drift.
-- Receipts predating P10 (NULL timing columns) are excluded honestly via `filter`.

create or replace view public.capability_leaderboard as
select
    capability_hash,
    merchant_pubkey,
    count(*)::int as completed,
    (avg(extract(epoch from (created_at - request_initiated_at)) * 1000)
        filter (where request_initiated_at is not null))::numeric(10,1) as avg_total_latency_ms,
    (avg(extract(epoch from (upstream_returned_at - upstream_called_at)) * 1000)
        filter (
            where upstream_called_at is not null
              and upstream_returned_at is not null
              and upstream_returned_at >= upstream_called_at
        ))::numeric(10,1) as avg_merchant_latency_ms,
    avg(amount_lamports)::bigint as avg_amount_lamports,
    sum(amount_lamports)::bigint as total_volume,
    count(distinct card_pubkey)::int as unique_users,
    max(created_at) as last_used_at
from public.receipts
where decision = 'ALLOW' and public_feed = true
group by capability_hash, merchant_pubkey;

comment on view public.capability_leaderboard is
    'Ranked merchants per capability_hash. Server-clock latencies; pre-P10 rows excluded honestly.';

-- Lightweight summary view: top capability hashes by total volume (powers the index page).
create or replace view public.capability_leaderboard_summary as
select
    capability_hash,
    sum(total_volume)::bigint as total_volume,
    sum(completed)::int as completed,
    count(*)::int as merchant_count,
    max(last_used_at) as last_used_at
from public.capability_leaderboard
group by capability_hash
order by sum(total_volume) desc nulls last;

comment on view public.capability_leaderboard_summary is
    'Top capability hashes by total volume. Powers /leaderboard index.';
