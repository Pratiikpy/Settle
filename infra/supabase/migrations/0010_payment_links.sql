-- F10 — one-time-use payment links (off-chain).
--
-- Creator generates a link `/pay/<token>`. First buyer to scan/click pays the fixed
-- amount. Server marks claimed_at on first POST; subsequent POSTs return 410 Gone.
--
-- Distinct from /send/link (escrow-style "I funded this, anyone claims") and from
-- /qr/<merchant>/<slug> (multi-use repricing). This is a one-shot pay-TO-creator link,
-- e.g. "first 10 buyers pay $5" promo links, single-use discount codes, ephemeral checkouts.
--
-- The on-chain single-use Pact flag (P2 in the build plan) is a separate primitive that
-- ships with the streaming-pact wave (W5); it solves agent-authorization tokens. This
-- table is the consumer-side equivalent and ships without an Anchor change.

create table if not exists public.payment_links (
    token             text primary key,                              -- unguessable random URL slug
    creator_pubkey    text not null,                                 -- recipient of the payment
    amount_usdc       numeric(12, 6) not null check (amount_usdc > 0 and amount_usdc <= 100000),
    label             text not null,
    description       text,
    expires_at        timestamptz,                                   -- optional hard expiry
    claimed_at        timestamptz,                                   -- set on first successful POST
    claimed_by_pubkey text,                                          -- buyer that claimed
    claim_tx_sig      text,                                          -- on-chain settlement tx
    created_at        timestamptz not null default now()
);

create index if not exists payment_links_creator_idx
    on public.payment_links (creator_pubkey, created_at desc);
create index if not exists payment_links_unclaimed_idx
    on public.payment_links (created_at desc) where claimed_at is null;

alter table public.payment_links enable row level security;

-- Public read so the buyer can see "what is this?" before connecting their wallet.
create policy payment_links_public_read on public.payment_links
    for select using (true);

-- Owner-only writes (create + cancel).
create policy payment_links_owner_write on public.payment_links
    for all using (creator_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''))
    with check (creator_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));
