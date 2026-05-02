-- 0050_waitlist.sql — Wave 6.1 landing email capture.
--
-- Single-purpose table: stores emails from the landing "Request access"
-- form. Anon role inserts via the API route (RLS denies direct PostgREST
-- writes from the browser); service role can read for triage.

create table if not exists public.waitlist (
    id           uuid primary key default gen_random_uuid(),
    email        text not null,
    source       text not null default 'landing',
    user_agent   text,
    ip_country   text,
    created_at   timestamptz not null default now(),
    -- One row per email, regardless of source. We don't want to bother
    -- the user when they accidentally submit twice.
    unique (email)
);

alter table public.waitlist enable row level security;

-- Default deny — anon and authenticated cannot SELECT / INSERT / UPDATE
-- / DELETE. Only service role (via SUPABASE_SERVICE_ROLE_KEY) can read,
-- which is what the API route uses. This is intentional: emails are
-- low-sensitivity but still personal data.
revoke all on public.waitlist from public;
revoke all on public.waitlist from anon;
revoke all on public.waitlist from authenticated;
