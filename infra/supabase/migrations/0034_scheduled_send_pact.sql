-- F7.3 / C34.3 — Pact binding for scheduled sends.
--
-- A scheduled_send fires on cadence by calling spend_via_pact, which
-- requires both a card (= source funding) and a pact (= scoped cap +
-- allowlist). Up to now we stored only card_pubkey; the pact_pubkey
-- was implicit / missing. Adding it explicitly here lets the signer
-- cron build spend_via_pact without guessing.
--
-- Lifecycle:
--   1. User creates a scheduled_send → pact_pubkey is NULL.
--   2. User clicks "Spawn Pact" on /wishes → /api/scheduled-sends/spawn-pact
--      builds an open_pact tx, user signs, indexer mirrors the pact
--      account, /wishes patches scheduled_send.pact_pubkey to the new PDA.
--   3. Signer cron, on next fire, sees pact_pubkey set + uses it.
--
-- We DON'T reference pacts(pact_pubkey) as a foreign key because the
-- pacts table is indexer-mirrored from on-chain state; if the indexer
-- is briefly behind, a foreign-key violation on insert would block the
-- user. Eventual consistency is fine; the signer cron validates the
-- pact account exists on-chain at fire time anyway.

alter table public.scheduled_sends
    add column if not exists pact_pubkey text;

create index if not exists scheduled_sends_pact_idx
    on public.scheduled_sends (pact_pubkey)
    where pact_pubkey is not null;

comment on column public.scheduled_sends.pact_pubkey is
    'F7.3 — Pact PDA the signer spends via. NULL until user spawns one. spend_via_pact requires it.';
