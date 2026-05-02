-- C48 — Group spend requests state machine.
--
-- Until now /api/group-accounts/approve wrote a phase5_executions row
-- on quorum reach with intent_kind='scheduled_send' (placeholder) and
-- the real kind tucked inside plan_json. That conflates the audit log
-- with the work queue: there's no clean way to ask "is this group
-- spend pending or already fired?" without scanning audit rows.
--
-- Fix: a dedicated group_spend_requests table that's the canonical
-- state for "this group wants to send X to Y." The audit log
-- continues recording each fire attempt; the queue lives here.
--
-- Lifecycle:
--   pending     → custodian created request; quorum not yet reached
--   quorum_met  → enough voters approved; signer cron will fire on next tick
--   fired       → signer fired the spend_via_pact tx; sig stamped here
--   cancelled   → custodian cancelled before quorum
--   expired     → request_id older than 7 days without quorum

create table if not exists public.group_spend_requests (
    request_id        uuid primary key default gen_random_uuid(),
    group_id          uuid not null references public.group_accounts(group_id) on delete cascade,
    -- custodian who created this request. Authority to cancel.
    requester_pubkey  text not null,
    dest_pubkey       text not null,
    amount_lamports   bigint not null,
    note              text,
    -- The Pact under group_accounts.holding_card that scopes this spend.
    -- Custodian spawns it BEFORE collecting approvals — the Pact's PDA
    -- locks in cap + allowlist so members are voting on a known artifact.
    pact_pubkey       text not null,
    status            text not null default 'pending',
    -- After quorum_met, signer can fire. signature populated on success.
    signature         text,
    created_at        timestamptz not null default now(),
    fired_at          timestamptz,
    expires_at        timestamptz not null default now() + interval '7 days',
    constraint group_req_amount_pos check (amount_lamports > 0),
    constraint group_req_status_valid check (
        status in ('pending', 'quorum_met', 'fired', 'cancelled', 'expired')
    )
);

create index if not exists group_req_group_idx
    on public.group_spend_requests (group_id, created_at desc);
create index if not exists group_req_pending_idx
    on public.group_spend_requests (status, expires_at)
    where status in ('pending', 'quorum_met');

-- Allow group_spend as an intent_kind in phase5_executions audit rows.
-- Drop the existing constraint and recreate with the additional value.
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
            'group_spend'
        ));
end $$;

comment on table public.group_spend_requests is
    'C48 — group spend queue. Custodian creates with a pre-spawned Pact; members approve; signer fires on quorum.';
