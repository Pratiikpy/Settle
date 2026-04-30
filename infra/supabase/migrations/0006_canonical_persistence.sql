-- Persist canonical reason and policy_snapshot JSON alongside receipts so the
-- /api/receipts/[id]/verify endpoint can honestly recompute all 4 hashes,
-- not just receipt_hash + purpose_hash.
--
-- Pre-existing receipts will have NULL in these columns. The verifier handles
-- NULL by falling back to a "partial verification" response — but for any
-- receipt inserted after this migration, all 4 hashes are honestly verifiable.

alter table public.receipts
    add column if not exists canonical_reason_json   jsonb,
    add column if not exists canonical_policy_json   jsonb;

create index if not exists receipts_canonical_present_idx
    on public.receipts ((canonical_reason_json is not null and canonical_policy_json is not null));

-- Update the agent_receipts view to expose the new columns (full visibility)
create or replace view public.agent_receipts as
select
    request_id, card_pubkey, pact_pubkey, merchant_pubkey,
    amount_lamports, decision, deny_code,
    capability_hash, purpose_text_hash, purpose_hash,
    receipt_hash, reason_hash, policy_snapshot_hash,
    canonical_reason_json, canonical_policy_json,
    target_method, target_path,
    sig_solscan, decision_slot, policy_version,
    webhook_delivery_status, merchant_acknowledgment_status,
    created_at
from public.receipts
where decision in ('ALLOW', 'DENY', 'REVIEW');

-- Merchant view stays redacted (no canonical objects exposed)
create or replace view public.merchant_receipts as
select
    request_id, merchant_pubkey,
    amount_lamports, decision,
    receipt_hash, sig_solscan, decision_slot,
    merchant_acknowledgment_status,
    created_at
from public.receipts
where decision = 'ALLOW';
