-- F7.3 / F7.10 / F33.4 — Phase 5 execution audit log.
--
-- The phase5-tick cron writes "intent" rows (last_fired_at,
-- claim_request_id, status='expired'). The phase5-signer cron picks
-- those intents up, builds + signs + sends txs, and writes the result
-- here. One row per intent fire, append-only, never updated after
-- final state lands.
--
-- We deliberately track BOTH dry-run and live executions in the same
-- table — a `mode` column distinguishes them. The reason: when an
-- operator flips LIVE on, you want to be able to compare the dry-run
-- audit against the first few live runs and confirm the same intents
-- got picked up. Two tables would make that join awkward.

create table if not exists public.phase5_executions (
    execution_id      uuid primary key default gen_random_uuid(),
    -- Which intent table this fire originated from.
    intent_kind       text not null,
    -- Foreign id INTO that table — NOT a foreign key (intent rows can
    -- be deleted by the user; executions are an append-only audit and
    -- should survive that). Indexed for "show me executions for this
    -- intent" lookups.
    intent_id         uuid not null,
    -- 'dry_run' = signer logged what it would do; 'live' = actually sent.
    mode              text not null default 'dry_run',
    -- 'pending' → 'sent' → 'confirmed' | 'failed' for live mode.
    -- For dry_run, status is always 'dry_run_logged'.
    status            text not null default 'pending',
    -- The Solana tx signature, set once we have one (live mode only).
    signature         text,
    -- The "what would have been sent" details — recipient, amount, instruction
    -- summary. Useful for both audit and debugging.
    plan_json         jsonb not null default '{}'::jsonb,
    -- Free-form failure cause if status='failed'.
    error_message     text,
    created_at        timestamptz not null default now(),
    confirmed_at      timestamptz,
    constraint p5_intent_kind_valid check (
        intent_kind in (
            'scheduled_send',
            'auto_refill',
            'gift_claim',
            'gift_refund'
        )
    ),
    constraint p5_mode_valid check (mode in ('dry_run', 'live')),
    constraint p5_status_valid check (
        status in (
            'pending',
            'sent',
            'confirmed',
            'failed',
            'dry_run_logged'
        )
    )
);

create index if not exists p5_executions_intent_idx
    on public.phase5_executions (intent_kind, intent_id, created_at desc);
create index if not exists p5_executions_status_idx
    on public.phase5_executions (status, created_at desc);
create index if not exists p5_executions_mode_idx
    on public.phase5_executions (mode, created_at desc);

comment on table public.phase5_executions is
    'F7.3/F7.10/F33.4 — append-only audit of Phase 5 intent fires. dry_run + live coexist by design.';
