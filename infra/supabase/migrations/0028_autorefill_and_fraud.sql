-- F33.4 + F29.4 — Auto-refill rules and fraud-flag audit log.
--
-- Two separate concerns; same migration because they share the
-- "wallet-scoped derived signal" shape and ship together as Phase 3
-- treasury/safety surface.
--
-- Auto-refill rules: a per-card declarative spec — "when balance < $5,
-- top up by $20 from owner_pubkey." A separate cron job (NOT this
-- migration) will read these and execute via spend_via_pact. For now we
-- just store the rules so the UI can collect them.
--
-- Fraud flags: append-only log of anomaly scores. Each scan run inserts
-- one row per receipt that exceeded a threshold. Wallets see their own
-- flags via /api/fraud/scan; admins page through the table.

create table if not exists public.auto_refill_rules (
    rule_id          uuid primary key default gen_random_uuid(),
    card_pubkey      text not null,
    owner_pubkey     text not null,
    -- Trigger: refill when card's daily-cap-remaining drops below this
    -- many lamports. Default 1 USDC = 1_000_000.
    threshold_lamports bigint not null,
    -- Amount to refill (a Pact open with this cap). Capped per the
    -- card's daily_cap so we can't dodge limits via auto-refill loops.
    refill_lamports  bigint not null,
    -- Cooldown so a single drop doesn't trigger N refills back-to-back.
    cooldown_seconds integer not null default 3600,
    enabled          boolean not null default true,
    last_refill_at   timestamptz,
    created_at       timestamptz not null default now(),
    constraint refill_threshold_positive check (threshold_lamports > 0),
    constraint refill_amount_positive check (refill_lamports > 0)
);

create index if not exists auto_refill_card_idx
    on public.auto_refill_rules (card_pubkey);
create index if not exists auto_refill_owner_idx
    on public.auto_refill_rules (owner_pubkey);
create index if not exists auto_refill_enabled_idx
    on public.auto_refill_rules (enabled)
    where enabled = true;

comment on table public.auto_refill_rules is
    'F33.4 — declarative auto-refill rules; a separate cron actually fires the spend_via_pact.';

-- Fraud flag log.
create table if not exists public.fraud_flags (
    flag_id        uuid primary key default gen_random_uuid(),
    -- The wallet the flag is about. Could be card.authority or a
    -- merchant_pubkey depending on the rule that fired.
    subject_pubkey text not null,
    -- Optional: pin a specific receipt this flag is about.
    request_id     uuid,
    -- Coarse rule id: 'sudden_volume_spike', 'novel_merchant',
    -- 'off_hours_burst', 'deny_cluster', 'suspicious_capability'.
    rule           text not null,
    -- 0..1 score; higher = more anomalous.
    score          double precision not null,
    -- Free-form context the rule wants to log (e.g. "spike from $1/day to $50/day").
    context_json   jsonb not null default '{}'::jsonb,
    created_at     timestamptz not null default now(),
    constraint score_range check (score >= 0 and score <= 1)
);

create index if not exists fraud_flags_subject_idx
    on public.fraud_flags (subject_pubkey, created_at desc);
create index if not exists fraud_flags_score_idx
    on public.fraud_flags (score desc);

comment on table public.fraud_flags is
    'F29.4 — append-only anomaly log. /api/fraud/scan writes; UI reads.';
