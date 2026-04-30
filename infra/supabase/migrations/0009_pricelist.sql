-- F9 — self-repricing QR.
--
-- Each (merchant, slug) row is a Solana Pay transaction-request endpoint. The QR encodes
-- `solana:settle.so/qr/<merchant>/<slug>`. Wallets POST to /api/sp/<merchant>/<slug>;
-- server reads the *current* row to build the unsigned tx.
--
-- The merchant prints the QR once; price updates here automatically reflect on every scan.
-- No CMS, no flyer reprint.

create table if not exists public.merchant_pricelist (
    merchant_pubkey  text not null,
    slug             text not null,
    label            text not null,
    amount_usdc      numeric(12, 6) not null check (amount_usdc > 0 and amount_usdc <= 1000000),
    description      text,
    -- Optional: pin to a specific cluster's USDC mint, otherwise resolve at request time
    usdc_mint        text,
    paused           boolean not null default false,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    primary key (merchant_pubkey, slug)
);

create index if not exists pricelist_merchant_idx
    on public.merchant_pricelist (merchant_pubkey, paused);

drop trigger if exists merchant_pricelist_set_updated_at on public.merchant_pricelist;
create trigger merchant_pricelist_set_updated_at
    before update on public.merchant_pricelist
    for each row execute function public.set_updated_at();

alter table public.merchant_pricelist enable row level security;

-- Public read so the Solana Pay transaction-request endpoint can resolve prices for anyone scanning.
create policy pricelist_public_read on public.merchant_pricelist
    for select using (true);

-- Owner-only writes (RLS via wallet_pubkey JWT claim, same pattern as other tables).
create policy pricelist_owner_write on public.merchant_pricelist
    for all using (merchant_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''))
    with check (merchant_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));
