-- F5.11 — Cross-app receipt importer.
--
-- Lets users mirror a Solana Pay (or any SPL TransferChecked) tx into
-- Settle's receipts table so it gets a kernel commit + verifiable proof
-- page + appears in the trust score graph. The original tx is unchanged
-- on-chain; we just create a receipt row that POINTS at it.
--
-- Three new columns on receipts:
--   - import_source: where the receipt came from. Null = native Settle
--     receipt; otherwise one of 'solana_pay', 'helio', 'sphere', 'manual'.
--   - imported_from_sig: the original tx signature being mirrored.
--   - imported_at: when the import happened (distinct from created_at,
--     which is now "when the row appeared in Settle" — for imports the
--     real payment time is in the on-chain tx).
--
-- Why: a key Phase 2 deliverable is "Settle is the verification layer for
-- all Solana payments." Without this, our receipts table is closed —
-- only payments that started inside Settle can be verified. The importer
-- inverts that: any Solana payment can land here.
--
-- We DO NOT create a special imported_receipts table because every imported
-- receipt should look identical to a native one in dashboards, search,
-- trust scores, and verify-by-hash. Adding columns is the minimum-shape
-- delta that achieves this.

alter table public.receipts
    add column if not exists import_source     text,
    add column if not exists imported_from_sig text,
    add column if not exists imported_at       timestamptz;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'receipts_import_source_check') then
        alter table public.receipts add constraint receipts_import_source_check
            check (import_source is null or import_source in (
                'solana_pay', 'helio', 'sphere', 'manual'
            ));
    end if;
end $$;

-- Unique-when-set so we can't double-import the same tx.
create unique index if not exists receipts_imported_sig_uniq
    on public.receipts (imported_from_sig)
    where imported_from_sig is not null;

create index if not exists receipts_import_source_idx
    on public.receipts (import_source)
    where import_source is not null;

comment on column public.receipts.import_source is
    'F5.11 — provenance of imported receipts. Null = native Settle receipt.';
comment on column public.receipts.imported_from_sig is
    'F5.11 — original on-chain tx signature being mirrored. Unique when set.';
