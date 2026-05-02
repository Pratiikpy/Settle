-- Phase 5 consumer breadth: scheduled, save-for-X, round-up, group accounts,
-- allowance, send-as-gift. All six features ship as declarative rule rows;
-- a separate cron worker (NOT in this migration) reads them and fires the
-- actual on-chain spend_via_pact / direct_send transactions.
--
-- Why one migration for all six? They share a shape:
--   1. Owner pubkey (the wallet that authorized the rule).
--   2. A funding source (a card_pubkey OR direct from owner).
--   3. A trigger condition (cron, balance threshold, parent payment).
--   4. An effect (transfer to dest_pubkey).
-- Splitting into six migrations would scatter that shared shape across
-- six files for no operational benefit.
--
-- Each table has:
--   - enabled boolean so users can pause without deleting (and history)
--   - last_fired_at so the cron worker can compute cooldowns/idempotency
--   - created_at for audit
--   - row-level security checks happen at the API layer (see
--     /api/scheduled-sends, /api/save-for, etc.) since Supabase RLS
--     would require a JWT-issued by Settle, which we don't have yet.

-- ─────────────────────────────────────────────────────────────────────────────
-- F7.3 — Scheduled sends.
-- ─────────────────────────────────────────────────────────────────────────────
-- A user-defined cron-like rule that auto-fires a direct send. Useful for
-- rent, allowance, subscription mirroring. We store cron via a coarse enum
-- (DAILY, WEEKLY, MONTHLY) + day_of_week / day_of_month so users don't write
-- raw cron strings and we can validate cleanly server-side.
create table if not exists public.scheduled_sends (
    schedule_id     uuid primary key default gen_random_uuid(),
    owner_pubkey    text not null,
    card_pubkey     text,
    dest_pubkey     text not null,
    amount_lamports bigint not null,
    -- DAILY | WEEKLY | MONTHLY
    cadence         text not null,
    -- 0..6 (Sun..Sat) for WEEKLY; 1..28 for MONTHLY (28 = always exists in feb)
    day_of_period   smallint,
    -- "HH:MM" 24h, UTC
    time_of_day     text not null default '12:00',
    note            text,
    enabled         boolean not null default true,
    last_fired_at   timestamptz,
    next_fire_at    timestamptz,
    created_at      timestamptz not null default now(),
    constraint sched_amount_pos check (amount_lamports > 0),
    constraint sched_cadence_valid check (cadence in ('DAILY','WEEKLY','MONTHLY')),
    constraint sched_dom_valid check (
        cadence != 'MONTHLY' or (day_of_period between 1 and 28)
    ),
    constraint sched_dow_valid check (
        cadence != 'WEEKLY' or (day_of_period between 0 and 6)
    )
);

create index if not exists scheduled_sends_owner_idx
    on public.scheduled_sends (owner_pubkey);
create index if not exists scheduled_sends_next_fire_idx
    on public.scheduled_sends (next_fire_at)
    where enabled = true;

comment on table public.scheduled_sends is
    'F7.3 — declarative recurring sends. Cron worker reads next_fire_at and fires direct_send.';

-- ─────────────────────────────────────────────────────────────────────────────
-- F7.5 — Save-for-X buckets.
-- ─────────────────────────────────────────────────────────────────────────────
-- A user creates a goal ("$500 for AWS bill"). Funds accumulate in a
-- dedicated card_pubkey (a Pact card with a high daily_cap and tight
-- allow_capabilities = []). We track the goal so the UI can render
-- progress without re-deriving from the card.
create table if not exists public.save_for_buckets (
    bucket_id        uuid primary key default gen_random_uuid(),
    owner_pubkey     text not null,
    -- The Pact card holding the funds. NULL until the user spawns one.
    holding_card     text,
    label            text not null,
    target_lamports  bigint not null,
    -- Optional: deadline by which the user wants to hit target.
    target_by        timestamptz,
    -- Optional: auto-contribution amount per period (DAILY/WEEKLY/MONTHLY).
    contribution_lamports bigint,
    contribution_cadence  text,
    -- "ai", "rent", "vacation", "other" — for grouping in the UI.
    category         text not null default 'other',
    enabled          boolean not null default true,
    created_at       timestamptz not null default now(),
    completed_at     timestamptz,
    constraint save_target_pos check (target_lamports > 0),
    constraint save_contrib_cadence_valid check (
        contribution_cadence is null
        or contribution_cadence in ('DAILY','WEEKLY','MONTHLY')
    )
);

create index if not exists save_for_owner_idx
    on public.save_for_buckets (owner_pubkey);

comment on table public.save_for_buckets is
    'F7.5 — savings goals; funds live on a separate Pact card linked via holding_card.';

-- ─────────────────────────────────────────────────────────────────────────────
-- F7.6 — Round-up rules.
-- ─────────────────────────────────────────────────────────────────────────────
-- Every direct_send the user makes triggers a separate transfer that
-- rounds up to the next $0.50 / $1 / $5 and sends the difference to a
-- target (typically a save_for_bucket's holding_card).
-- The rule is evaluated post-transfer by the indexer; we don't try to
-- atomically bundle round-ups into the original tx.
create table if not exists public.round_up_rules (
    rule_id        uuid primary key default gen_random_uuid(),
    owner_pubkey   text not null,
    -- 50000 ($0.05), 100000 ($0.10), 500000 ($0.50), 1000000 ($1.00), 5000000 ($5.00)
    round_to_lamports bigint not null,
    -- Where the rounded-up delta lands.
    dest_pubkey    text not null,
    -- Optional cap: never round up more than this much per day.
    daily_cap_lamports bigint,
    enabled        boolean not null default true,
    created_at     timestamptz not null default now(),
    constraint round_round_to_pos check (round_to_lamports > 0),
    constraint round_one_per_owner unique (owner_pubkey)
);

create index if not exists round_up_owner_idx
    on public.round_up_rules (owner_pubkey);

comment on table public.round_up_rules is
    'F7.6 — round-up-to-nearest-X. Indexer emits a follow-up direct_send when the rule matches.';

-- ─────────────────────────────────────────────────────────────────────────────
-- F7.8 — Group accounts (multi-sig-lite shared spending).
-- ─────────────────────────────────────────────────────────────────────────────
-- A pact card whose authority is logically shared between N members.
-- We don't change the on-chain authority (the card still has a single
-- authority_pubkey per Anchor). Instead, group accounts use a hosted
-- "approval table": each spend > a threshold requires N-of-M off-chain
-- signatures (each member signs an Ed25519 attestation against the
-- request_id) before the relayer fires the spend_via_pact ix.
create table if not exists public.group_accounts (
    group_id         uuid primary key default gen_random_uuid(),
    label            text not null,
    holding_card     text not null,
    -- The wallet that physically holds the card authority.
    custodian_pubkey text not null,
    -- Number of approvals required for spends > threshold_lamports.
    quorum           smallint not null,
    threshold_lamports bigint not null default 100000000, -- $100 default
    created_at       timestamptz not null default now(),
    constraint group_quorum_pos check (quorum > 0)
);

create table if not exists public.group_account_members (
    group_id      uuid not null references public.group_accounts(group_id) on delete cascade,
    member_pubkey text not null,
    role          text not null default 'voter', -- voter | viewer
    joined_at     timestamptz not null default now(),
    primary key (group_id, member_pubkey)
);

create index if not exists group_members_pubkey_idx
    on public.group_account_members (member_pubkey);

create table if not exists public.group_spend_approvals (
    approval_id   uuid primary key default gen_random_uuid(),
    group_id      uuid not null references public.group_accounts(group_id) on delete cascade,
    request_id    uuid not null,
    member_pubkey text not null,
    -- Ed25519 sig over (request_id || amount_lamports || dest_pubkey) by member.
    signature_b58 text not null,
    decision      text not null, -- approve | deny
    created_at    timestamptz not null default now(),
    constraint group_approve_decision_valid check (decision in ('approve','deny')),
    unique (request_id, member_pubkey)
);

create index if not exists group_approvals_request_idx
    on public.group_spend_approvals (request_id);

comment on table public.group_accounts is
    'F7.8 — N-of-M shared spending; on-chain authority unchanged, off-chain quorum gates the relayer.';

-- ─────────────────────────────────────────────────────────────────────────────
-- F7.9 — Allowance (parent → kid recurring funding with cap).
-- ─────────────────────────────────────────────────────────────────────────────
-- A scheduled_send + a Pact card with hard daily_cap. We model it as its
-- own table because the UX is distinct: the parent picks a kid handle,
-- caps it weekly, and the kid sees ONLY that card balance. We keep
-- relationship state here so we can render "Allowances" cleanly without
-- joining four tables.
create table if not exists public.allowances (
    allowance_id    uuid primary key default gen_random_uuid(),
    parent_pubkey   text not null,
    kid_pubkey      text not null,
    kid_card        text, -- the Pact card the kid spends from
    weekly_lamports bigint not null,
    daily_cap_lamports bigint not null,
    enabled         boolean not null default true,
    created_at      timestamptz not null default now(),
    last_funded_at  timestamptz,
    constraint allow_weekly_pos check (weekly_lamports > 0),
    constraint allow_daily_pos check (daily_cap_lamports > 0)
);

create index if not exists allowance_parent_idx on public.allowances (parent_pubkey);
create index if not exists allowance_kid_idx on public.allowances (kid_pubkey);

comment on table public.allowances is
    'F7.9 — recurring parent→kid funding rule with on-chain Pact daily cap.';

-- ─────────────────────────────────────────────────────────────────────────────
-- F7.10 — Gift sends.
-- ─────────────────────────────────────────────────────────────────────────────
-- Sender deposits USDC to a temp escrow card. Recipient (a handle, not yet
-- a pubkey) "claims" by signing a message with their wallet. After claim,
-- the indexer fires a direct_send from escrow to the claimer's wallet.
-- Unclaimed gifts auto-refund after `expires_at`.
create table if not exists public.gift_sends (
    gift_id          uuid primary key default gen_random_uuid(),
    sender_pubkey    text not null,
    recipient_handle text not null,
    -- Temp escrow card holding the funds; sender authority.
    escrow_card      text not null,
    amount_lamports  bigint not null,
    note             text,
    -- 'pending' | 'claimed' | 'refunded' | 'expired'
    status           text not null default 'pending',
    -- Set when claimed.
    claimer_pubkey   text,
    claim_request_id uuid,
    -- Auto-refund target (usually = sender_pubkey but allow override for
    -- "send to my savings if unclaimed").
    refund_pubkey    text,
    expires_at       timestamptz not null default now() + interval '30 days',
    created_at       timestamptz not null default now(),
    claimed_at       timestamptz,
    refunded_at      timestamptz,
    constraint gift_amount_pos check (amount_lamports > 0),
    constraint gift_status_valid check (
        status in ('pending','claimed','refunded','expired')
    )
);

create index if not exists gift_sender_idx on public.gift_sends (sender_pubkey);
create index if not exists gift_recipient_idx on public.gift_sends (recipient_handle);
create index if not exists gift_status_idx on public.gift_sends (status, expires_at)
    where status = 'pending';

comment on table public.gift_sends is
    'F7.10 — claim-by-handle escrow. Indexer fires direct_send from escrow_card on claim.';
