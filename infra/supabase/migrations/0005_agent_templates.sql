-- Agent template marketplace.
-- Anyone can browse templates; only the author (author_pubkey) can edit/delete.
-- A template is a recipe for spawning a Pact: cap, expiry, merchant allowlist, default purpose.
-- Spawning a template = open_pact ix with the template's parameters.

create table if not exists public.agent_templates (
    slug                text primary key,
    title               text not null,
    description         text not null,
    author_pubkey       text not null,
    cap_usdc            numeric(10, 6) not null check (cap_usdc > 0 and cap_usdc <= 10000),
    expiry_minutes      integer not null check (expiry_minutes >= 1 and expiry_minutes <= 10080),
    merchant_allowlist  text[] not null default '{}',
    default_purpose     text not null default '',
    icon_emoji          text not null default 'AI',
    use_count           bigint not null default 0,
    featured            boolean not null default false,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists agent_templates_author_idx
    on public.agent_templates (author_pubkey);
create index if not exists agent_templates_use_idx
    on public.agent_templates (use_count desc, created_at desc);
create index if not exists agent_templates_featured_idx
    on public.agent_templates (featured, created_at desc) where featured = true;

drop trigger if exists agent_templates_set_updated_at on public.agent_templates;
create trigger agent_templates_set_updated_at
    before update on public.agent_templates
    for each row execute function public.set_updated_at();

alter table public.agent_templates enable row level security;

-- Public read.
create policy agent_templates_public_read on public.agent_templates
    for select using (true);

-- Author-only writes (service role bypasses).
create policy agent_templates_author_write on public.agent_templates
    for all using (author_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''))
    with check (author_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

-- Seed three featured starter templates so the marketplace is populated on day 1.
-- Use NULL-safe upsert so re-running the migration doesn't error.
insert into public.agent_templates (slug, title, description, author_pubkey, cap_usdc, expiry_minutes, merchant_allowlist, default_purpose, icon_emoji, featured)
values
    ('research', 'Research Assistant',
     'Pulls papers from arXiv, translates Japanese ones, and writes ELI12 summaries. Caps at $0.50 across 3 merchants.',
     'SystemDefault11111111111111111111111111111', 0.50, 15,
     ARRAY[]::text[], 'Research a paper end-to-end', 'RES', true),
    ('translate', 'Translator',
     'Translates one document Japanese to English. Caps at $0.30, 10-minute expiry, single-merchant.',
     'SystemDefault11111111111111111111111111111', 0.30, 10,
     ARRAY[]::text[], 'Translate a document', 'TRA', true),
    ('summary', 'Summarizer',
     'Summarize one PDF or article in plain English. Caps at $0.05, 5-minute expiry.',
     'SystemDefault11111111111111111111111111111', 0.05, 5,
     ARRAY[]::text[], 'Summarize an article', 'SUM', true)
on conflict (slug) do nothing;
