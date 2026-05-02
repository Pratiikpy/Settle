-- 0047 — round_up_queue idempotency UNIQUE constraint.
--
-- AU-07-002 fix.
--
-- Problem: indexer's WS subscription can replay PactSpendEvent on
-- reconnect / restart. Each replay would insert another round_up_queue
-- row → second cron tick fires another claim_streaming/spend → user
-- pays the round-up delta TWICE for the same triggering spend.
--
-- Fix: UNIQUE on (rule_id, triggering_request_id) so the second
-- insert raises a constraint violation that the indexer can swallow
-- (already wrapped in a try/catch per Phase 7 audit).
--
-- Note: rule_id is required (not null in 0040), triggering_request_id
-- is nullable but in practice always set by the indexer enqueue path.
-- For older rows where it's null, we add a partial UNIQUE that only
-- enforces when both columns are non-null.

create unique index if not exists round_up_queue_idem_idx
    on public.round_up_queue (rule_id, triggering_request_id)
    where triggering_request_id is not null;

comment on index public.round_up_queue_idem_idx is
    'AU-07-002: prevents double-spend on WS event replay. Reject duplicate (rule_id, triggering_request_id) inserts.';
