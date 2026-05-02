-- F2.11 — Receipt tagging.
--
-- A simple labeling system: any wallet can attach text tags to receipts
-- they're involved in (as buyer or merchant). Tags are private to the
-- tagger — both Alice and Bob can tag the same receipt independently
-- without collision.
--
-- Composite primary key (request_id, tagger_pubkey, tag) means:
--   - One wallet can't double-tag the same receipt with the same tag.
--   - Different wallets can apply the same tag to the same receipt
--     (their tags don't collide).
--
-- No FK to receipts because tags can be created BEFORE the receipt row
-- has been inserted by the indexer — race during a fresh write. The
-- foreign key constraint would block the tag write; better to allow it
-- and reconcile.
--
-- Index on (tagger_pubkey, tag) so dashboard queries like "all my
-- receipts tagged 'rent'" are O(rows-with-that-tag).

create table if not exists public.receipt_tags (
    request_id     uuid not null,
    tagger_pubkey  text not null,
    tag            text not null,
    created_at     timestamptz not null default now(),
    primary key (request_id, tagger_pubkey, tag),
    constraint receipt_tags_tag_format check (tag ~ '^[a-z0-9_-]{1,32}$')
);

create index if not exists receipt_tags_by_tagger
    on public.receipt_tags (tagger_pubkey, tag);
create index if not exists receipt_tags_by_request
    on public.receipt_tags (request_id);

comment on table public.receipt_tags is
    'F2.11 — per-tagger receipt labels. Lowercase alphanumeric + dash/underscore, max 32 chars.';
