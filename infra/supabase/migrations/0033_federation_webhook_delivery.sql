-- F9.3 / F5.6 — Federation webhook delivery state.
--
-- The webhook delivery state machine for federated_receipts mirrors
-- the one already on `receipts`:
--
--   pending  → first attempt has not landed (or has failed but not
--              exhausted retries)
--   delivered → 2xx received from the merchant's URL
--   failed   → MAX_ATTEMPTS reached without a 2xx
--   na       → no webhook URL configured for this row's recipient
--
-- We store the columns on federated_receipts itself rather than a
-- side table because (origin_id, remote_request_id) is already the
-- natural primary identity — no join needed for the poller's main
-- "find pending" query.

alter table public.federated_receipts
    add column if not exists webhook_delivery_status text not null default 'pending',
    add column if not exists webhook_attempts integer not null default 0,
    add column if not exists webhook_last_attempt_at timestamptz,
    add column if not exists webhook_last_error text;

-- Validate transitions.
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'fed_webhook_status_valid'
    ) then
        alter table public.federated_receipts
            add constraint fed_webhook_status_valid
            check (webhook_delivery_status in ('pending','delivered','failed','na'));
    end if;
end $$;

-- Index for the poller's "what's pending?" query — partial so it stays
-- tight as `delivered`/`failed` rows accumulate.
create index if not exists fed_webhook_pending_idx
    on public.federated_receipts (status, webhook_delivery_status, imported_at desc)
    where webhook_delivery_status = 'pending' and status = 'verified';

comment on column public.federated_receipts.webhook_delivery_status is
    'F9.3 — webhook fanout state for this federation import. Mirrors receipts.webhook_delivery_status.';
