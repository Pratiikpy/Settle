-- C50 — Round-up live wiring.
--
-- Round-ups need three new pieces:
--   1. round_up_rules.card_pubkey + pact_pubkey — which delegated
--      card + Pact the relayer spends from. Without these the rule
--      describes intent but has no funding source.
--   2. round_up_queue — the indexer enqueues here whenever it sees
--      a spend by a wallet with an enabled rule. The signer cron
--      drains it.
--   3. 'round_up' as a valid intent_kind in phase5_executions.
--
-- Why a queue (not direct phase5_executions inserts from the indexer):
-- audit log is the SIGNER's responsibility, not the indexer's. Same
-- separation we used for group_spend_requests. The queue is the
-- intent (what should fire); phase5_executions is the result (what
-- the signer attempted).

alter table public.round_up_rules
    add column if not exists card_pubkey text,
    add column if not exists pact_pubkey text;

create index if not exists round_up_rules_pact_idx
    on public.round_up_rules (pact_pubkey)
    where pact_pubkey is not null;

create table if not exists public.round_up_queue (
    queue_id          uuid primary key default gen_random_uuid(),
    rule_id           uuid not null references public.round_up_rules(rule_id) on delete cascade,
    -- The wallet whose spend triggered the round-up.
    owner_pubkey      text not null,
    -- The original spend that triggered us (audit trail).
    triggering_request_id uuid,
    triggering_amount_lamports bigint not null,
    -- The rounded-up delta the relayer will spend.
    delta_lamports    bigint not null,
    -- Where the delta lands (= round_up_rules.dest_pubkey at queue time).
    dest_pubkey       text not null,
    -- The Pact under which this fire happens.
    pact_pubkey       text not null,
    status            text not null default 'pending',
    signature         text,
    created_at        timestamptz not null default now(),
    fired_at          timestamptz,
    constraint round_up_queue_status_valid check (
        status in ('pending', 'fired', 'failed', 'skipped')
    ),
    constraint round_up_queue_delta_pos check (delta_lamports > 0)
);

create index if not exists round_up_queue_pending_idx
    on public.round_up_queue (status, created_at)
    where status = 'pending';
create index if not exists round_up_queue_owner_idx
    on public.round_up_queue (owner_pubkey, created_at desc);

-- Allow round_up as an intent_kind in phase5_executions.
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
            'round_up'
        ));
end $$;

comment on table public.round_up_queue is
    'C50 — indexer-fed queue. Signer drains rows where status=pending and fires spend_via_pact for the delta.';
