-- 0048 — durable indexer cursor.
--
-- AU-07-001 fix.
--
-- Problem: the indexer (apps/indexer/src/index.ts) subscribes to
-- `connection.onLogs(PROGRAM_ID, ...)`. When the WS disconnects
-- (network blip, process restart, deploy), events that arrived in
-- the gap are silently dropped. The /receipts page then has missing
-- rows; phase5 attribution is incomplete.
--
-- Fix: persist `last_processed_signature` + `last_processed_slot` on
-- every event. On startup, fetch signatures newer than the last
-- processed one from RPC and process them sequentially before
-- starting the WS subscription.
--
-- Single-row table (PRIMARY KEY = constant 'main') so the indexer
-- always upserts the same row. No history; we want the latest.

create table if not exists public.indexer_cursor (
    id                          text primary key default 'main',
    last_processed_signature    text,
    last_processed_slot         bigint,
    last_processed_at           timestamptz not null default now(),
    -- For visibility during incident response: how many events the
    -- last batch processed (helps distinguish "WS healthy" from
    -- "replay catching up").
    last_batch_size             integer default 0,
    constraint indexer_cursor_singleton check (id = 'main')
);

-- Insert the singleton row (no-op if it already exists).
insert into public.indexer_cursor (id) values ('main')
on conflict (id) do nothing;

alter table public.indexer_cursor enable row level security;
-- service-role-only; no anon policy.

comment on table public.indexer_cursor is
    'AU-07-001: durable cursor for the indexer. Updated on every event. On restart, indexer fetches signatures newer than last_processed_signature and replays before resuming WS subscription.';
