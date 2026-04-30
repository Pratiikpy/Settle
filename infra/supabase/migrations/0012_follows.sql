-- Wave 6 / P7 — Public follow graph.
--
-- A follow is a directed edge: follower follows following. (follower, following) is the
-- composite primary key, so the same wallet can't follow the same target twice.
--
-- RLS policies:
--   1. follows_owner_write: a wallet can only insert/update/delete its own follow rows
--      (i.e. follower_pubkey must equal the JWT's wallet_pubkey claim).
--   2. follows_public_count: anyone can read. This makes follower counts and recent-
--      followers lists shareable on profiles. There's no PII here — pubkeys are public.
--
-- The `push_on_receipt` flag lets a follower opt out of receipt-based push
-- notifications without unfollowing. Default true matches the intuitive "follow means
-- alert me" UX; users mute via this flag if a creator becomes spammy.
--
-- The since column is just for display (e.g., "Following since March 2026").

create table if not exists public.follows (
    follower_pubkey  text not null,
    following_pubkey text not null,
    since            timestamptz not null default now(),
    push_on_receipt  boolean not null default true,
    primary key (follower_pubkey, following_pubkey),
    constraint follows_no_self_follow check (follower_pubkey <> following_pubkey)
);

create index if not exists follows_following_idx on public.follows (following_pubkey);
create index if not exists follows_follower_idx  on public.follows (follower_pubkey);
-- For "show me public receipts I'd want pushed to my followers": fast follower lookup
-- when an ALLOW receipt with public_feed=true gets inserted.
create index if not exists follows_following_push_idx
    on public.follows (following_pubkey)
    where push_on_receipt = true;

alter table public.follows enable row level security;

drop policy if exists follows_owner_write on public.follows;
create policy follows_owner_write on public.follows
    for all using (follower_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''))
    with check (follower_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

drop policy if exists follows_public_count on public.follows;
create policy follows_public_count on public.follows for select using (true);

comment on table public.follows is
    'Directed follow edges. RLS lets the follower manage their own rows; reads are public for follower counts.';
