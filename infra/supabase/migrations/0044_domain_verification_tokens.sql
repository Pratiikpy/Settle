-- C112 — Domain verification tokens for verified_merchants self-serve.
--
-- Until now `verified_merchants.verification_method` could be set to
-- 'dns_txt' but we had no flow to actually issue + check the TXT
-- records. The table here holds short-lived tokens (default 72h TTL)
-- bound to (merchant_pubkey, domain) so a merchant can't replay a
-- token across handles.
--
-- Lifecycle:
--   1. POST /api/merchants/verify-domain {action:"init"} → upserts a row
--      with a fresh token + expires_at.
--   2. Merchant adds TXT record at _settle.<domain> with value
--      "settle-verify=<token>".
--   3. POST {action:"check"} → server fetches TXT, compares, and on
--      match: marks consumed_at + upserts verified_merchants.
--
-- Why upsert (not insert) for re-init: a merchant who lost their
-- registered TXT value re-runs init and gets a fresh token. The old
-- token becomes stale at the DB level (we overwrite it).

create table if not exists public.domain_verification_tokens (
    merchant_pubkey text not null,
    domain          text not null,
    token           text not null,
    expires_at      timestamptz not null,
    consumed_at     timestamptz,
    created_at      timestamptz not null default now(),
    primary key (merchant_pubkey, domain)
);

create index if not exists dv_tokens_pending_idx
    on public.domain_verification_tokens (expires_at)
    where consumed_at is null;

comment on table public.domain_verification_tokens is
    'C112 — short-lived DNS TXT tokens bound to (merchant_pubkey, domain). 72h TTL, single-use.';
