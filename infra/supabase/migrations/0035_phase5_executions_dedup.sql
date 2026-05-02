-- C39 — Idempotency for phase5_executions concurrent cron runs.
--
-- Background: phase5-signer ticks every 5min. If two pods run the
-- signer concurrently (deploys, retries, regional fan-in), both
-- in-process "have we already logged this?" checks may both see zero
-- rows and BOTH insert. Result: double-fires and double-audit-rows.
--
-- Fix: a UNIQUE constraint on (intent_kind, intent_id, fire_window).
-- We use a derived `fire_window_ms` integer = floor(epoch_ms /
-- IDEMPOTENCY_WINDOW_MS) so two firings of the same scheduled_send
-- on consecutive cycles aren't conflated, but two CONCURRENT pods
-- trying to log the same fire are. Window default: 1 hour, which is
-- well over the longest realistic cron-tick spacing.
--
-- Why this column rather than UNIQUE on (intent_kind, intent_id,
-- created_at): created_at is timestamptz with microsecond precision,
-- so two inserts that race milliseconds apart still differ — the
-- constraint wouldn't fire. The bucketed window is intentional
-- coarsening to make idempotency provable.
--
-- Migration is forward-only — the existing rows lack fire_window_ms,
-- so we backfill it before adding the constraint, in two steps:
--   1. add column nullable
--   2. backfill from created_at
--   3. set NOT NULL
--   4. add unique index

alter table public.phase5_executions
    add column if not exists fire_window_ms bigint;

-- Backfill: floor(epoch_ms / 3_600_000) — 1-hour buckets.
update public.phase5_executions
set fire_window_ms = floor(extract(epoch from created_at) * 1000 / 3600000)::bigint
where fire_window_ms is null;

alter table public.phase5_executions
    alter column fire_window_ms set not null;

-- Unique on (intent_kind, intent_id, fire_window_ms) — two pods racing
-- the same fire collide here, the second pod's insert raises 23505
-- (which the signer treats as "already logged, move on").
create unique index if not exists phase5_executions_dedup_uq
    on public.phase5_executions (intent_kind, intent_id, fire_window_ms);

comment on column public.phase5_executions.fire_window_ms is
    'C39 — coarse-grained dedup window (1h buckets). UNIQUE with (intent_kind, intent_id) — see phase5_executions_dedup_uq.';
