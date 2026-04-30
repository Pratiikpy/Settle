-- Settle handles table — maps "@pratiik" → pubkey.
-- Resolver flow: parseHandleInput("@pratiik") → kind="settle", value="pratiik"
--                → SELECT pubkey FROM handles WHERE handle = 'pratiik'
-- Optional .sol domain stored alongside for display.

create table if not exists public.handles (
    handle              text primary key check (handle ~ '^[a-z0-9_-]{2,32}$'),
    pubkey              text not null check (pubkey ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
    sns_domain          text,
    display_name        text,
    avatar_url          text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint handles_pubkey_unique unique (pubkey)
);

create index if not exists handles_pubkey_idx on public.handles (pubkey);

drop trigger if exists handles_set_updated_at on public.handles;
create trigger handles_set_updated_at
    before update on public.handles
    for each row execute function public.set_updated_at();

alter table public.handles enable row level security;

-- Anyone can read handles (public directory, like Cash $cashtags)
create policy handles_public_read on public.handles
    for select using (true);

-- Owner can update their own row (auth.jwt()->>'wallet_pubkey' must match)
create policy handles_owner_update on public.handles
    for update using (pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''))
    with check (pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

-- Service role bypasses RLS for first-time create + admin management.
