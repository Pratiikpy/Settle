-- Wave / F2.0 — Universal Receipt Kernel storage.
--
-- Adds two columns to public.receipts so any payment kind can be stored,
-- not just x402 spend:
--
--   receipt_kind  — discriminator. One of:
--                     x402_spend, direct_send, link_send,
--                     streaming_claim, escrow_release,
--                     escrow_dispute, refund.
--                   Existing rows backfill to 'x402_spend' (the only kind
--                   the system has emitted before this migration).
--
--   context_hash  — kind-aware indexable identity:
--                     BLAKE3({kind, sender, recipient, amount, request_id}).
--                   Lets a verifier locate any receipt without knowing its
--                   4 hashes upfront. Computed by @settle/sdk kernelCommit.
--                   NULLABLE for existing rows so backfill is non-blocking;
--                   new rows MUST supply it (enforced at API layer).
--
-- Why a check constraint on receipt_kind, not an enum type:
--   Postgres enums require a type-creation step + can't be dropped from
--   columns without re-creating them. A text + check constraint is
--   evolvable: future kinds add a single ALTER + check-constraint update.

alter table public.receipts add column if not exists receipt_kind text;

-- Backfill all existing rows to x402_spend before adding the NOT NULL.
update public.receipts set receipt_kind = 'x402_spend' where receipt_kind is null;

alter table public.receipts alter column receipt_kind set not null;
alter table public.receipts alter column receipt_kind set default 'x402_spend';

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'receipts_kind_check'
    ) then
        alter table public.receipts add constraint receipts_kind_check
            check (receipt_kind in (
                'x402_spend',
                'direct_send',
                'link_send',
                'streaming_claim',
                'escrow_release',
                'escrow_dispute',
                'refund'
            ));
    end if;
end $$;

-- context_hash — 32-byte BLAKE3 over kind+sender+recipient+amount+request_id.
-- Stored as bytea (matches the 3 on-chain hashes already in the table).
alter table public.receipts add column if not exists context_hash bytea;

-- Index for kind-filtered queries (dashboards: "show only direct sends",
-- "show only refunds", etc.)
create index if not exists receipts_kind_idx on public.receipts (receipt_kind);

-- Index for context_hash lookups (verifier locates receipt by binding hash).
create index if not exists receipts_context_hash_idx on public.receipts (context_hash)
    where context_hash is not null;

comment on column public.receipts.receipt_kind is
    'Discriminator: x402_spend|direct_send|link_send|streaming_claim|escrow_release|escrow_dispute|refund';
comment on column public.receipts.context_hash is
    'BLAKE3({kind,sender,recipient,amount,request_id}). Indexable identity per @settle/sdk kernelCommit.';

-- ─────────────────────────────────────────────────────────────
-- F2.0 Path A — on-chain attestation log.
--
-- The Anchor program v0.4 `record_receipt` ix emits ReceiptRecordedEvent
-- which the indexer mirrors here. A single receipt_hash can have N
-- attestations from different signers (Settle operator, merchant, buyer).
-- Trust dashboards filter by attestor_pubkey to surface "Settle's own
-- attestations" vs "third-party attestations".
--
-- Foreign-key relationship to receipts is INTENTIONALLY OMITTED: a Path A
-- attestation can land for a receipt whose canonical row hasn't reached
-- Postgres yet (race between record_receipt confirmation and the
-- sender's API endpoint completing its own DB insert). Joining on
-- context_hash is the right query pattern.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.kernel_receipt_attestations (
    sig_solscan      text primary key,
    attestor_pubkey  text not null,
    receipt_kind     text not null,
    receipt_hash     bytea not null,
    context_hash     bytea not null,
    slot             bigint not null,
    created_at       timestamptz not null default now()
);

create index if not exists kernel_attest_context_idx
    on public.kernel_receipt_attestations (context_hash);
create index if not exists kernel_attest_attestor_idx
    on public.kernel_receipt_attestations (attestor_pubkey);
create index if not exists kernel_attest_kind_idx
    on public.kernel_receipt_attestations (receipt_kind);

comment on table public.kernel_receipt_attestations is
    'F2.0 Path A — on-chain ReceiptRecordedEvent attestations. JOIN to receipts via context_hash.';
