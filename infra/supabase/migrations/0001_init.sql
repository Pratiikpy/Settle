-- Settle initial migration. devnet-first; safe to run against fresh project.
-- Tables: agent_cards, pacts, receipts, policy_decisions, verified_merchants, nonce_cache.
-- Two RLS-filtered VIEWs over receipts: agent_receipts, merchant_receipts (N5 dual receipts).

create extension if not exists "pgcrypto";
create extension if not exists "pg_stat_statements";

-- ─────────────────────────────────────────────────────────────
-- agent_cards: shadow of on-chain AgentCard for fast UI reads.
-- Source of truth is on-chain; indexer keeps this in sync via LaserStream.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.agent_cards (
    card_pubkey         text primary key,
    authority_pubkey    text not null,
    agent_pubkey        text not null,
    label               text not null,
    label_hash          bytea not null,
    daily_cap_lamports  bigint not null,
    per_call_max_lamports bigint not null,
    used_today          bigint not null default 0,
    last_reset_slot     bigint not null,
    expiry_slot         bigint not null,
    revoked             boolean not null default false,
    policy_version      integer not null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    -- one user (authority) sees their own cards
    constraint agent_cards_authority_idx_uq unique (authority_pubkey, label_hash)
);

create index if not exists agent_cards_authority_idx on public.agent_cards (authority_pubkey);
create index if not exists agent_cards_revoked_idx on public.agent_cards (revoked) where revoked = true;

-- Allowlist as separate table to allow indexed lookups by merchant.
create table if not exists public.agent_card_allowlist (
    card_pubkey       text not null references public.agent_cards(card_pubkey) on delete cascade,
    merchant_pubkey   text not null,
    capability_hash   bytea, -- nullable: NULL = any capability allowed
    primary key (card_pubkey, merchant_pubkey)
);

create index if not exists allowlist_merchant_idx on public.agent_card_allowlist (merchant_pubkey);

-- ─────────────────────────────────────────────────────────────
-- pacts: task-scoped child cards (N13).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.pacts (
    pact_pubkey       text primary key,
    parent_card       text not null references public.agent_cards(card_pubkey) on delete cascade,
    scope_label       text not null,
    scope_label_hash  bytea not null,
    cap_lamports      bigint not null,
    spent             bigint not null default 0,
    expiry_slot       bigint not null,
    closed            boolean not null default false,
    refund_tx_sig     text, -- merchant-signed SPL refund tx signature on close
    created_at        timestamptz not null default now(),
    closed_at         timestamptz
);

create index if not exists pacts_parent_idx on public.pacts (parent_card);
create index if not exists pacts_open_idx on public.pacts (closed) where closed = false;

-- ─────────────────────────────────────────────────────────────
-- receipts: single row → two RLS-filtered VIEWs (N5).
-- request_id is UUID v4 from the agent envelope; idempotency key.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.receipts (
    request_id              uuid primary key,
    card_pubkey             text not null,
    pact_pubkey             text,
    merchant_pubkey         text not null,
    amount_lamports         bigint not null,
    decision                text not null check (decision in ('ALLOW', 'DENY', 'REVIEW')),
    deny_code               smallint, -- 1..=8 when DENY
    capability_hash         bytea,
    -- BLAKE3(NFC(trim(purpose_string))) — committed inside the canonical receipt object → receipt_hash.
    purpose_text_hash       bytea not null,
    -- Binding meta-commitment over (request context, target_method, target_path, amount, 3 on-chain hashes).
    -- Recomputable via @settle/sdk verifyReceipt; lets an auditor prove the DB row matches the chain.
    purpose_hash            bytea not null,
    receipt_hash            bytea not null,
    reason_hash             bytea not null,
    policy_snapshot_hash    bytea not null,
    -- HTTP context bound into purpose_hash (so the receipt can be re-derived for verification).
    target_method           text not null check (target_method in ('GET','POST','PUT','PATCH','DELETE')),
    target_path             text not null,
    sig_solscan             text, -- mainnet/devnet tx signature
    decision_slot           bigint not null,
    policy_version          integer not null,
    -- Encrypted off-chain metadata (libsodium sealed-box) — N6
    encrypted_metadata      bytea,
    -- Webhook delivery tracking — N4
    webhook_delivery_status text not null default 'pending'
        check (webhook_delivery_status in ('pending', 'delivered', 'failed', 'na')),
    webhook_attempts        integer not null default 0,
    -- Merchant ack — N4
    merchant_acknowledgment_status text not null default 'pending'
        check (merchant_acknowledgment_status in ('pending', 'acknowledged', 'na')),
    created_at              timestamptz not null default now()
);

create index if not exists receipts_card_idx on public.receipts (card_pubkey, created_at desc);
create index if not exists receipts_merchant_idx on public.receipts (merchant_pubkey, created_at desc);
create index if not exists receipts_pact_idx on public.receipts (pact_pubkey) where pact_pubkey is not null;
create index if not exists receipts_decision_idx on public.receipts (decision, created_at desc);
create index if not exists receipts_webhook_pending_idx
    on public.receipts (webhook_delivery_status, created_at)
    where webhook_delivery_status = 'pending';

-- ─────────────────────────────────────────────────────────────
-- policy_decisions: append-only ledger of every PolicyDecisionEvent (N18).
-- receipts is for human/agent UI; this is for audit + metrics.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.policy_decisions (
    id                  bigserial primary key,
    card_pubkey         text not null,
    merchant_pubkey     text,
    pact_pubkey         text,
    decision            text not null check (decision in ('ALLOW', 'DENY', 'REVIEW')),
    deny_code           smallint,
    amount_lamports     bigint not null default 0,
    receipt_hash        bytea not null,
    reason_hash         bytea not null,
    policy_snapshot_hash bytea not null,
    slot                bigint not null,
    sig_solscan         text not null,
    policy_version      integer not null,
    created_at          timestamptz not null default now()
);

create index if not exists pd_card_time_idx on public.policy_decisions (card_pubkey, created_at desc);
create index if not exists pd_decision_idx on public.policy_decisions (decision, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- verified_merchants: pubkey ↔ domain binding (N21).
-- Verification: merchant proves control by hosting a TXT record at _settle.<domain>.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.verified_merchants (
    merchant_pubkey     text primary key,
    domain              text not null,
    display_name        text not null,
    verification_method text not null default 'dns_txt'
        check (verification_method in ('dns_txt', 'manual_devnet_seed')),
    verified_at         timestamptz not null default now(),
    revoked_at          timestamptz
);

create index if not exists vm_domain_idx on public.verified_merchants (domain);

-- ─────────────────────────────────────────────────────────────
-- nonce_cache: backup persistence for Upstash nonces (Upstash is primary).
-- Used only for forensic replay analysis after Upstash TTL expiry.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.nonce_cache (
    nonce       bytea primary key,
    card_pubkey text not null,
    seen_at     timestamptz not null default now()
);

create index if not exists nonce_card_time_idx on public.nonce_cache (card_pubkey, seen_at desc);

-- ─────────────────────────────────────────────────────────────
-- Dual-receipt VIEWs (N5)
-- agent_receipts: full visibility (purpose, amount, merchant)
-- merchant_receipts: redacted (no purpose; no encrypted_metadata)
-- ─────────────────────────────────────────────────────────────
create or replace view public.agent_receipts as
select
    request_id, card_pubkey, pact_pubkey, merchant_pubkey,
    amount_lamports, decision, deny_code,
    capability_hash, purpose_text_hash, purpose_hash,
    receipt_hash, reason_hash, policy_snapshot_hash,
    target_method, target_path,
    sig_solscan, decision_slot, policy_version,
    webhook_delivery_status, merchant_acknowledgment_status,
    created_at
from public.receipts
where decision in ('ALLOW', 'DENY', 'REVIEW');

create or replace view public.merchant_receipts as
select
    request_id, merchant_pubkey,
    amount_lamports, decision,
    receipt_hash, sig_solscan, decision_slot,
    merchant_acknowledgment_status,
    created_at
from public.receipts
where decision = 'ALLOW';

-- ─────────────────────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_cards_set_updated_at on public.agent_cards;
create trigger agent_cards_set_updated_at
  before update on public.agent_cards
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────────────────────
alter table public.agent_cards enable row level security;
alter table public.agent_card_allowlist enable row level security;
alter table public.pacts enable row level security;
alter table public.receipts enable row level security;
alter table public.policy_decisions enable row level security;
alter table public.verified_merchants enable row level security;

-- Authority sees their own cards. (auth.jwt()->>'wallet_pubkey' is set by Privy/Phantom adapter.)
create policy agent_cards_owner_read on public.agent_cards
    for select using (authority_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

create policy receipts_card_owner_read on public.receipts
    for select using (
        card_pubkey in (
            select card_pubkey from public.agent_cards
            where authority_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
        )
    );

create policy receipts_merchant_read on public.receipts
    for select using (
        merchant_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
        and decision = 'ALLOW'
    );

-- Verified merchants are public read.
create policy vm_public_read on public.verified_merchants
    for select using (true);

-- Service role bypasses RLS (used by indexer, x402 facilitator).
