-- F2.3 Receipt-as-story narration + F2.8 Refund-by-emoji storage.
--
-- Two features compressed into one migration because they both extend the
-- receipts table with self-evident user-facing UX columns and want similar
-- backfill behavior (default null on legacy rows, populated lazily on view).
--
-- F2.3: receipts.narration_text — LLM-generated plain-English paragraph
-- describing the receipt. Lazily populated on first view of the receipt page
-- (cache-on-read). Null = never narrated yet; the API endpoint will generate
-- and write on demand.
--
-- F2.3: receipts.narration_provider — provenance tag for which generator
-- produced the cached text. One of: 'nvidia_nim', 'anthropic', 'template'.
-- Useful for QA: filter to see which receipts got the deterministic template
-- vs an LLM, so we can re-narrate when LLM credits return.
--
-- F2.3: receipts.narration_generated_at — timestamp for cache age. The
-- endpoint can re-generate stale narrations (e.g. older than 30d) when
-- product copy changes, without rewriting historical rows.
--
-- F2.8: receipts.refund_emoji — the emoji the user picked when refunding,
-- if any. NULL on receipts that haven't been refunded; one of 😞🤔😡 (or
-- future additions) on refunded receipts. Stored as text — emoji unicode
-- sequences are larger than a single char.
--
-- F2.8: refund_requests.emoji — same value, but on the audit row that
-- captures every refund attempt (including failed ones). receipts.refund_emoji
-- only reflects the LATEST refund; refund_requests.emoji is the full log.

alter table public.receipts
    add column if not exists narration_text         text,
    add column if not exists narration_provider     text,
    add column if not exists narration_generated_at timestamptz,
    add column if not exists refund_emoji           text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'receipts_narration_provider_check') then
        alter table public.receipts add constraint receipts_narration_provider_check
            check (narration_provider is null or narration_provider in (
                'nvidia_nim', 'anthropic', 'template'
            ));
    end if;
end $$;

-- refund_requests already exists (created in 0007). Add the emoji column if
-- it isn't there yet. The CREATE TABLE in 0007 used a strict shape so we
-- ALTER instead of re-creating.
do $$
begin
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = 'refund_requests') then
        if not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'refund_requests'
                       and column_name = 'emoji') then
            alter table public.refund_requests add column emoji text;
        end if;
    end if;
end $$;

create index if not exists receipts_narration_age_idx
    on public.receipts (narration_generated_at)
    where narration_generated_at is not null;

comment on column public.receipts.narration_text is
    'F2.3 — cached LLM-generated plain-English narration. Null until first view.';
comment on column public.receipts.refund_emoji is
    'F2.8 — emoji intent from the latest refund attempt. One of 😞🤔😡 or null.';
