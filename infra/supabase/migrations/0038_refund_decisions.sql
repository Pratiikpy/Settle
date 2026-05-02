-- C90 — Decision state on refund_requests.
--
-- Until now refund_requests was insert-only: the buyer files a request
-- with reason + emoji, end of story. Merchants had no way to record
-- "I approved this" or "I denied this with explanation."
--
-- Adds:
--   decision           — 'pending' (default) | 'approved_refund' | 'denied'
--   decided_at         — when the merchant resolved it
--   refund_signature   — when approved, the on-chain transferChecked
--                        signature returning USDC to the buyer
--   merchant_response  — free-form note the merchant added (often the
--                        AI dispute drafter output the merchant accepted
--                        and pasted)

alter table public.refund_requests
    add column if not exists decision text not null default 'pending',
    add column if not exists decided_at timestamptz,
    add column if not exists refund_signature text,
    add column if not exists merchant_response text;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'refund_requests_decision_valid'
    ) then
        alter table public.refund_requests
            add constraint refund_requests_decision_valid
            check (decision in ('pending', 'approved_refund', 'denied'));
    end if;
end $$;

create index if not exists refund_requests_decision_idx
    on public.refund_requests (decision, created_at desc)
    where decision = 'pending';

comment on column public.refund_requests.decision is
    'C90 — merchant resolution state. pending → approved_refund | denied (terminal).';
