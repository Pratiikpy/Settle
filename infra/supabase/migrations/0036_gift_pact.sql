-- C40 — Pact binding for gift fulfillment.
--
-- Same shape as scheduled_sends.pact_pubkey: a gift can fire its
-- escrow → claimer transfer via spend_via_pact iff a Pact under
-- escrow_card with the claimer on its allowlist exists. We store the
-- pact_pubkey when the sender spawns it at gift creation (or
-- afterward via a UI prompt).
--
-- Lifecycle:
--   1. Sender creates gift_sends row (status='pending', pact_pubkey=NULL)
--   2. Sender clicks "Fund pact" on /wishes gifts tab → spawns Pact
--      with claimer_pubkey on allowlist + cap = amount_lamports
--   3. Recipient signs claim message → /api/gift-sends/claim flips
--      status='claimed', sets claim_request_id
--   4. Signer cron picks up the row, sees escrow_card delegated +
--      pact_pubkey set → fires spend_via_pact
--
-- For the refund leg (status='expired'), pact_pubkey is the same row's
-- value — Pact's allowlist would need to include refund_pubkey too.
-- We don't enforce that here; the on-chain spend will reject if the
-- Pact's allowlist doesn't include the dest. The audit row makes the
-- failure visible.

alter table public.gift_sends
    add column if not exists pact_pubkey text;

create index if not exists gift_sends_pact_idx
    on public.gift_sends (pact_pubkey)
    where pact_pubkey is not null;

comment on column public.gift_sends.pact_pubkey is
    'C40 — Pact PDA the signer spends via to fulfill claims/refunds. NULL until spawned.';
