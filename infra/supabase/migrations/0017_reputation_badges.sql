-- Wave: Soulbound reputation badges via MPL Core (TransferRestrict plugin).
--
-- Each row is one earned badge for one user. The badge is a soulbound MPL Core
-- asset — the on-chain truth lives at `asset_address`. The Postgres mirror
-- exists for fast reads on /at/[handle] without round-tripping DAS for every
-- profile view.
--
-- Idempotency: the unique (user_pubkey, badge_kind) constraint prevents the
-- cron from double-minting if its threshold detection runs twice. The cron
-- attempts insert; duplicates fail-fast and the cron logs + skips.
--
-- Visibility: public read (badges are intentional reputation signals; pubkeys
-- are public). Writes restricted to service role (the badge cron).

create table if not exists public.reputation_badges (
    id              uuid primary key default gen_random_uuid(),
    user_pubkey     text not null,
    badge_kind      text not null,
    asset_address   text not null,                  -- MPL Core asset pubkey
    metadata_uri    text,                           -- off-chain JSON metadata (optional)
    sig_solscan     text,                           -- mint tx signature for audit
    earned_at       timestamptz not null default now(),
    constraint reputation_badges_kind_check check (
        badge_kind in (
            'first_payer',
            'polymath',
            'high_frequency_operator',
            'long_streamer',
            'honest_disputer',
            'public_spender'
        )
    ),
    constraint reputation_badges_unique_per_user unique (user_pubkey, badge_kind)
);

create index if not exists reputation_badges_user_idx
    on public.reputation_badges (user_pubkey, earned_at desc);

create index if not exists reputation_badges_kind_idx
    on public.reputation_badges (badge_kind);

alter table public.reputation_badges enable row level security;

drop policy if exists reputation_badges_public_read on public.reputation_badges;
create policy reputation_badges_public_read
    on public.reputation_badges
    for select using (true);

comment on table public.reputation_badges is
    'Soulbound MPL Core reputation badges. Mirror of the on-chain assets. Writes via service role only (badge cron).';

comment on column public.reputation_badges.badge_kind is
    'Stable identifier for the badge species. New kinds require a migration AND a cron-side threshold definition.';
