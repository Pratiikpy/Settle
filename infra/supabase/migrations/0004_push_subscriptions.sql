-- Web Push subscriptions per wallet pubkey.
-- Endpoint is the unique identifier (Mozilla autopush / Google FCM URL).
-- Auth + p256dh are used by the web-push library to encrypt the payload.

create table if not exists public.push_subscriptions (
    endpoint        text primary key,
    pubkey          text not null,
    p256dh          text not null,
    auth            text not null,
    user_agent      text,
    created_at      timestamptz not null default now(),
    last_used_at    timestamptz not null default now(),
    failed_count    integer not null default 0
);

create index if not exists push_sub_pubkey_idx on public.push_subscriptions (pubkey);
create index if not exists push_sub_recent_idx on public.push_subscriptions (last_used_at desc);

alter table public.push_subscriptions enable row level security;

-- Owner read/delete (own subscriptions only).
create policy push_sub_owner_read on public.push_subscriptions
    for select using (pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

create policy push_sub_owner_delete on public.push_subscriptions
    for delete using (pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));
