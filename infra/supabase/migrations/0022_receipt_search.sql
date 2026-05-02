-- F2.10 — Receipt search via Postgres full-text search.
--
-- Adds a generated tsvector column on receipts covering the user-visible
-- searchable fields:
--   - merchant_pubkey (substring + word match for "alice" → matches @alice)
--   - target_method + target_path
--   - narration_text (added in 0020 — when present, this is what the
--     user actually reads, so it's the highest-leverage search field)
--   - receipt_kind  (so "direct_send" / "refund" filter via search)
--
-- Why a generated column + GIN index instead of an external search engine:
--   - Postgres FTS is already in the Supabase plan; no Algolia/Meili.
--   - GIN index keeps queries sub-100ms up to ~1M rows on a small instance.
--   - Generated column = automatic refresh on UPDATE; no trigger code to
--     maintain.
--   - Limitation: doesn't search encrypted_metadata (by design — sealed
--     box stays sealed). Users who want to search by purpose_text can
--     hit the LLM-generated narration_text, which IS searchable.

alter table public.receipts
    add column if not exists search_tsv tsvector generated always as (
        to_tsvector(
            'english',
            coalesce(merchant_pubkey, '') || ' ' ||
            coalesce(target_method, '') || ' ' ||
            coalesce(target_path, '') || ' ' ||
            coalesce(receipt_kind, '') || ' ' ||
            coalesce(narration_text, '')
        )
    ) stored;

create index if not exists receipts_search_idx
    on public.receipts using gin (search_tsv);

comment on column public.receipts.search_tsv is
    'F2.10 — auto-maintained tsvector covering merchant, method, path, kind, narration. Searchable via to_tsquery() match.';
