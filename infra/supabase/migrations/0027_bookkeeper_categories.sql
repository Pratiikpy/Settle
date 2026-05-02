-- F29.3 — AI bookkeeper.
--
-- Categorizes each receipt into a high-level spending category. The
-- category is derived from the receipt's narration_text (or the raw
-- target_path / capability when narration is absent) by an LLM, and
-- cached on the row so subsequent dashboard reads are O(1).
--
-- Categories are coarse on purpose — too many = unusable in a UI.
-- Add new ones via the check constraint update if a real pattern
-- emerges from observed data.

alter table public.receipts
    add column if not exists bookkeeper_category    text,
    add column if not exists bookkeeper_categorized_at timestamptz;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'receipts_bookkeeper_category_check') then
        alter table public.receipts add constraint receipts_bookkeeper_category_check
            check (bookkeeper_category is null or bookkeeper_category in (
                'ai_research',
                'ai_translate',
                'ai_summarize',
                'ai_other',
                'subscription',
                'one_time_purchase',
                'transfer_to_self',
                'gift',
                'refund',
                'unclear'
            ));
    end if;
end $$;

create index if not exists receipts_bookkeeper_category_idx
    on public.receipts (bookkeeper_category)
    where bookkeeper_category is not null;

comment on column public.receipts.bookkeeper_category is
    'F29.3 — coarse spending category. LLM-derived, cached on first /api/bookkeeper run.';
