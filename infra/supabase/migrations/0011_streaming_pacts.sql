-- Wave 5 / P1 — Streaming Pact storage.
--
-- v0.3 adds a Streaming Pact mode alongside the existing OneShot. The on-chain Pact
-- account encodes mode as a PactMode enum; the Postgres mirror flattens it: a `mode`
-- text column ('oneshot' | 'streaming') plus mode-specific columns that are NULL when
-- not applicable.
--
-- Existing rows default to mode='oneshot' so historical data keeps deserializing
-- through the new API contract without rewriting any rows.

alter table public.pacts add column if not exists mode text not null default 'oneshot';

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'pacts_mode_check'
    ) then
        alter table public.pacts add constraint pacts_mode_check
            check (mode in ('oneshot', 'streaming'));
    end if;
end $$;

-- Streaming-only columns. Kept NULL for oneshot rows. `claimed` defaults to 0 so the
-- API can read it uniformly even before any claim has happened.
alter table public.pacts add column if not exists rate_lamports_per_slot bigint;
alter table public.pacts add column if not exists max_total_lamports     bigint;
alter table public.pacts add column if not exists claimed                bigint not null default 0;
alter table public.pacts add column if not exists last_claim_slot        bigint;
alter table public.pacts add column if not exists paused                 boolean not null default false;
alter table public.pacts add column if not exists pause_started_slot     bigint;
alter table public.pacts add column if not exists pause_accumulated_slots bigint not null default 0;

-- cap_lamports / spent become "OneShot-only" — nullable so streaming rows can omit them.
alter table public.pacts alter column cap_lamports drop not null;
alter table public.pacts alter column spent        drop not null;

create index if not exists pacts_mode_idx on public.pacts (mode);
create index if not exists pacts_streaming_open_idx on public.pacts (mode) where mode = 'streaming' and closed = false;

comment on column public.pacts.mode is 'OneShot uses cap_lamports/spent. Streaming uses rate/max_total/claimed/last_claim_slot + pause bookkeeping.';
