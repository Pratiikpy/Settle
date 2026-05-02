-- C111 — Refund linkage column on receipts.
--
-- The kernel commit input for kind='refund' carries
-- `refund_of_request_id` (UUID of the original receipt being refunded),
-- but until now we never persisted it on the receipts table — only
-- the canonical commit inside the kernel hash. That means the receipt
-- page couldn't link from a refund row → its original receipt without
-- re-deriving from the canonical_receipt blob.
--
-- This adds the column + an index for the reverse lookup ("show me
-- all refunds against THIS receipt").
--
-- Lifecycle: when a refund tx lands, the receipts-record handler
-- decodes the kernel commit and populates this column from the input.
-- For pre-existing refund rows, the column stays NULL — no backfill
-- since the canonical_receipt isn't queryable that way.

alter table public.receipts
    add column if not exists refund_of_request_id uuid;

-- Reverse lookup: "all refunds against request X" → indexed.
create index if not exists receipts_refund_of_idx
    on public.receipts (refund_of_request_id)
    where refund_of_request_id is not null;

-- The forward lookup (refund row → original) is already covered by
-- the receipts_pkey on request_id; no additional index needed.

comment on column public.receipts.refund_of_request_id is
    'C111 — for receipt_kind=refund, the request_id of the original receipt being refunded. NULL otherwise.';
