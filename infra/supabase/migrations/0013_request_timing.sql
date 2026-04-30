-- Wave 6 / P10 — Server-clock request-timing columns on receipts.
--
-- Replaces the earlier slot-derived latency math (which was unsound across clock drift)
-- with three real timestamps captured by the x402 proxy in the same process:
--
--   request_initiated_at: proxy received the request (before any RPC roundtrip)
--   upstream_called_at:   merchant's HTTP service was called
--   upstream_returned_at: merchant's HTTP service returned
--
-- All three are populated by the proxy's persistReceipt path, which already lives in
-- one place (apps/web/app/api/x402/proxy/[merchant]/route.ts). Subtractions inside the
-- same proxy process are safe — no clock drift.
--
-- The three are NULLable so historical receipts (pre-migration) keep deserializing.
-- Capability leaderboard view uses `filter (where ... is not null)` to honestly skip
-- those rows in the average.

alter table public.receipts
    add column if not exists request_initiated_at  timestamptz,
    add column if not exists upstream_called_at    timestamptz,
    add column if not exists upstream_returned_at  timestamptz;

-- Index for capability_leaderboard view: ALLOW + public_feed slice, grouped by
-- capability_hash + merchant_pubkey. Partial index keeps the leaderboard query cheap
-- even when the receipts table grows past millions of rows (most won't be public_feed).
create index if not exists receipts_capability_leaderboard_idx
    on public.receipts (capability_hash, merchant_pubkey)
    where decision = 'ALLOW' and public_feed = true;

comment on column public.receipts.request_initiated_at is
    'Proxy entry time. Used by capability_leaderboard end-to-end latency.';
comment on column public.receipts.upstream_called_at is
    'Merchant HTTP call started. Used to isolate upstream service latency.';
comment on column public.receipts.upstream_returned_at is
    'Merchant HTTP call returned. Pair with upstream_called_at for merchant-only latency.';
