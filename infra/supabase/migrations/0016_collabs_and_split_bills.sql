-- Wave 7 / F20 + F21 — Atomic multi-party.
--
-- Two new tables, both server-side coordination (no new on-chain primitive). For F20
-- the on-chain mechanism is "two TransferChecked ixs in one tx" — atomic by virtue of
-- being a single Solana tx. For F21 it's "N independent single-payer txs aggregated
-- by request_id" — the on-chain side is plain Solana Pay; the table just tracks
-- progress so the UI can close the bill at N/N completed.
--
-- F20 design (collabs):
--   creator_a + creator_b agree off-chain on a split. ratio_bps_a is creator A's share
--   in basis points (5000 = 50%). At pay time the buyer's tx sends:
--     amount * ratio_bps_a / 10000     to creator_a
--     amount - that                     to creator_b
--   …in two TransferChecked ixs in the same tx. Atomic.
--
-- F21 design (split_bills):
--   organizer creates a bill with target_total + n_payers. Each payer's tx sends
--   target_total / n_payers to the organizer (transfer_request) and references the
--   bill_id via memo. Webhook/realtime on the bill table announces "X / N paid."

-- ─── F20 collabs ─────────────────────────────────────────────────────────────
create table if not exists public.collabs (
    id                  uuid primary key default gen_random_uuid(),
    organizer_pubkey    text not null,                  -- creator_a (must wallet-sig auth on POST)
    creator_a_pubkey    text not null,                  -- typically = organizer
    creator_b_pubkey    text not null,
    ratio_bps_a         int  not null check (ratio_bps_a between 1 and 9999),
    label               text not null,
    description         text,
    created_at          timestamptz not null default now(),
    active              boolean not null default true,
    constraint collabs_distinct_creators check (creator_a_pubkey <> creator_b_pubkey)
);
create index if not exists collabs_organizer_idx on public.collabs (organizer_pubkey);
create index if not exists collabs_active_idx on public.collabs (active) where active = true;

alter table public.collabs enable row level security;
drop policy if exists collabs_owner_write on public.collabs;
create policy collabs_owner_write on public.collabs
    for all using (organizer_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''))
    with check (organizer_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));
drop policy if exists collabs_public_read on public.collabs;
create policy collabs_public_read on public.collabs for select using (true);

comment on column public.collabs.ratio_bps_a is
    'Creator A''s share in basis points (5000 = 50%). Server clamps to 1..9999 so neither side gets 0%.';

-- ─── F21 split_bills ─────────────────────────────────────────────────────────
create table if not exists public.split_bills (
    id                  uuid primary key default gen_random_uuid(),
    organizer_pubkey    text not null,
    label               text not null,
    target_total_lamports bigint not null check (target_total_lamports > 0),
    per_payer_lamports  bigint not null check (per_payer_lamports > 0),
    n_payers            int not null check (n_payers between 2 and 50),
    created_at          timestamptz not null default now(),
    completed_at        timestamptz
);
create index if not exists split_bills_organizer_idx on public.split_bills (organizer_pubkey);

create table if not exists public.split_bill_payments (
    id                  uuid primary key default gen_random_uuid(),
    bill_id             uuid not null references public.split_bills(id) on delete cascade,
    payer_pubkey        text not null,
    amount_lamports     bigint not null,
    sig_solscan         text,
    created_at          timestamptz not null default now(),
    unique (bill_id, payer_pubkey)   -- one payment per payer per bill
);
create index if not exists split_bill_payments_bill_idx on public.split_bill_payments (bill_id);

alter table public.split_bills enable row level security;
alter table public.split_bill_payments enable row level security;

drop policy if exists split_bills_organizer_write on public.split_bills;
create policy split_bills_organizer_write on public.split_bills
    for all using (organizer_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''))
    with check (organizer_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));
drop policy if exists split_bills_public_read on public.split_bills;
create policy split_bills_public_read on public.split_bills for select using (true);

drop policy if exists split_bill_payments_public_read on public.split_bill_payments;
create policy split_bill_payments_public_read on public.split_bill_payments for select using (true);
-- Inserts on payments table are service-role only (server records confirmed payment after on-chain settle).

comment on table public.split_bill_payments is
    'One row per payer per bill. Inserted by the server after observing on-chain settle.';
