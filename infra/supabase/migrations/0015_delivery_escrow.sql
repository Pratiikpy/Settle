-- Wave 7 / P9 — DeliveryEscrow Pact mode storage.
--
-- Extends the existing pacts.mode check constraint to include 'delivery_escrow' and
-- adds the escrow-specific columns (NULL for oneshot/streaming rows).
--
-- State machine: open → released | refunded. Two flags + two deadlines + a pinned
-- merchant + the capability_hash promise. The buyer's USDC ATA is implicit (= the
-- card.authority's ATA), so it's not stored.

-- Replace the mode check to include the new variant.
do $$
begin
    if exists (
        select 1 from pg_constraint where conname = 'pacts_mode_check'
    ) then
        alter table public.pacts drop constraint pacts_mode_check;
    end if;
    alter table public.pacts add constraint pacts_mode_check
        check (mode in ('oneshot', 'streaming', 'delivery_escrow'));
end $$;

alter table public.pacts add column if not exists escrow_amount           bigint;
alter table public.pacts add column if not exists escrow_merchant_pubkey  text;
alter table public.pacts add column if not exists escrow_capability_hash  bytea;
alter table public.pacts add column if not exists confirm_deadline_slot   bigint;
alter table public.pacts add column if not exists dispute_deadline_slot   bigint;
alter table public.pacts add column if not exists released                boolean not null default false;
alter table public.pacts add column if not exists refunded                boolean not null default false;
alter table public.pacts add column if not exists released_at             timestamptz;
alter table public.pacts add column if not exists refunded_at             timestamptz;
alter table public.pacts add column if not exists released_caller_pubkey  text;
alter table public.pacts add column if not exists released_is_buyer_confirmed boolean;

-- Index for the permissionless-release cron: it polls for delivery_escrow pacts that
-- are still pending and whose confirm_deadline_slot has been reached.
create index if not exists pacts_escrow_pending_idx
    on public.pacts (mode, confirm_deadline_slot)
    where mode = 'delivery_escrow' and released = false and refunded = false;

comment on column public.pacts.escrow_merchant_pubkey is
    'Pinned at open. release_delivery_escrow rejects any other destination ATA owner.';
comment on column public.pacts.confirm_deadline_slot is
    'After this slot, anyone may permissionlessly call release_delivery_escrow.';
comment on column public.pacts.dispute_deadline_slot is
    'Until this slot, the buyer may call dispute_delivery_escrow for a refund.';
