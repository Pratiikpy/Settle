-- C115 — Streaming claim cron worker.
--
-- The claim_streaming ix exists in TS + Rust + Python SDKs but no
-- automated worker drains streaming pacts. Without this, agents that
-- earn from streaming pacts have to manually invoke claim_streaming.
--
-- Lifecycle:
--   1. phase5-tick reads streaming pacts where mode='streaming' and
--      not closed/paused. Computes claimable = min(max_total - claimed,
--      (current_slot - last_claim_slot) * rate). If claimable >=
--      MIN_CLAIM_LAMPORTS (default 100_000 = $0.10), enqueues here.
--   2. Cooldown: don't re-enqueue if last fire was within last hour.
--   3. signer cron drains pending rows via claim_streaming ix.
--
-- Same queue pattern as round_up_queue + auto_refill_queue. Explicit
-- queue (not direct phase5_executions writes from tick) so the audit
-- log stays the signer's domain.

create table if not exists public.streaming_claim_queue (
    queue_id          uuid primary key default gen_random_uuid(),
    pact_pubkey       text not null,
    card_pubkey       text not null,
    -- Merchant on the pact's allowlist that earns. For multi-merchant
    -- streaming pacts, each merchant gets a separate queue row.
    merchant_pubkey   text not null,
    owner_pubkey      text not null,
    claimable_lamports bigint not null,
    -- Snapshot of pact state at enqueue time (for audit).
    last_claim_slot_at_enqueue bigint not null,
    status            text not null default 'pending',
    signature         text,
    created_at        timestamptz not null default now(),
    fired_at          timestamptz,
    constraint streaming_claim_status_valid check (
        status in ('pending', 'fired', 'failed', 'skipped')
    ),
    constraint streaming_claim_amount_pos check (claimable_lamports > 0)
);

create index if not exists streaming_claim_pending_idx
    on public.streaming_claim_queue (status, created_at)
    where status = 'pending';
create index if not exists streaming_claim_pact_idx
    on public.streaming_claim_queue (pact_pubkey, created_at desc);

-- Allow streaming_claim as an intent_kind in phase5_executions.
do $$
begin
    if exists (
        select 1 from pg_constraint
        where conname = 'p5_intent_kind_valid'
    ) then
        alter table public.phase5_executions
            drop constraint p5_intent_kind_valid;
    end if;
    alter table public.phase5_executions
        add constraint p5_intent_kind_valid
        check (intent_kind in (
            'scheduled_send',
            'auto_refill',
            'gift_claim',
            'gift_refund',
            'group_spend',
            'round_up',
            'streaming_claim'
        ));
end $$;

comment on table public.streaming_claim_queue is
    'C115 — phase5-tick enqueues when claimable accumulates; signer drains via claim_streaming ix.';
