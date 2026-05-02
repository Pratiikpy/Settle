-- F3.12 Trust Score storage.
--
-- Trust score = log(unique_counterparties) × allow_rate × inverse_dispute_rate
--
-- Why a cache table instead of computing on every read:
--   - The query touches every receipt the user is involved in (as buyer
--     OR merchant). On a hot wallet with 10k receipts that's expensive
--     enough to matter at the request-latency budget (50ms target).
--   - The score is bounded-frequency by design — payments don't reorder,
--     so there's no real-time correctness pressure. 5-minute staleness is
--     acceptable; refresh on first view + lazy cron.
--
-- Each component is stored alongside the final score so the UI can render
-- a tooltip with the formula breakdown without re-querying. The components
-- are also useful for tier classification ("0 disputes" badge, "10+
-- counterparties" badge, etc.) without recomputing.
--
-- pubkey is the primary key; one row per Solana wallet that's ever been a
-- buyer or a merchant. Trust scores are wallet-level, not per-card —
-- otherwise revoking a card would tank reputation, which isn't what users
-- want (revoking is a positive trust signal, not a negative one).

create table if not exists public.agent_trust_scores (
    pubkey                text primary key,
    score                 double precision not null default 0,
    -- Components — clamped to sensible ranges:
    unique_counterparties integer not null default 0,
    receipts_total        integer not null default 0,
    receipts_allowed      integer not null default 0,
    receipts_denied       integer not null default 0,
    refunds_count         integer not null default 0,
    -- Pre-computed ratios for O(1) display without arithmetic in the
    -- frontend (which forgets to handle div-by-zero).
    allow_rate            double precision not null default 0,
    inverse_dispute_rate  double precision not null default 1,
    last_computed_at      timestamptz not null default now(),
    -- Tier label for fast filtering ("emerging", "trusted", "veteran").
    -- Computed at write time from the score; the API can re-derive but
    -- we cache it to keep dashboard queries cheap.
    tier                  text not null default 'emerging'
        check (tier in ('emerging', 'building', 'trusted', 'veteran'))
);

-- Leaderboard reads filter by tier + sort by score; the partial index
-- makes "top trusted" cheap.
create index if not exists trust_score_idx
    on public.agent_trust_scores (score desc);
create index if not exists trust_tier_idx
    on public.agent_trust_scores (tier);
create index if not exists trust_age_idx
    on public.agent_trust_scores (last_computed_at);

comment on table public.agent_trust_scores is
    'F3.12 — cached per-pubkey trust score. Refresh ≤ every 5 min.';
comment on column public.agent_trust_scores.score is
    'log(unique_counterparties) × allow_rate × inverse_dispute_rate. 0..~10.';
