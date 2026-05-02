-- C49 — Link allowances to a scheduled_send so the existing Phase 5
-- signer cron fires it on cadence without duplicating the firing
-- machinery.
--
-- Allowance is structurally a weekly scheduled_send with a specific
-- parent/kid relationship layered on top. Rather than build a parallel
-- firing path, we POST a scheduled_send under the hood when an allowance
-- is created, link it via this column, and reuse the cron + signer +
-- audit infrastructure.
--
-- Lifecycle:
--   1. Parent calls POST /api/allowances → server inserts scheduled_send
--      (cadence=WEEKLY, dest=kid_pubkey, amount=weekly_lamports), stores
--      its schedule_id here.
--   2. Parent clicks "Spawn Pact" → /api/scheduled-sends/spawn-pact runs.
--   3. Cron fires weekly. Each fire writes phase5_executions row.
--   4. Parent deletes allowance → server deletes scheduled_send too
--      (CASCADE not used — explicit delete keeps the audit log intact).

alter table public.allowances
    add column if not exists schedule_id uuid references public.scheduled_sends(schedule_id) on delete set null;

create index if not exists allowances_schedule_idx
    on public.allowances (schedule_id)
    where schedule_id is not null;

comment on column public.allowances.schedule_id is
    'C49 — FK to scheduled_sends row that fires this allowance weekly. Set on create, NULL after delete.';
