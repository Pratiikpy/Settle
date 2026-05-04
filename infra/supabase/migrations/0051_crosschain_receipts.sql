-- 0051_crosschain_receipts.sql
--
-- Settle x Ika sidetrack: extend `receipts` to carry cross-chain metadata
-- (target chain, recipient, asset, amount in chain-native minor units, target
-- tx hash, explorer URL) and add a `crosschain_cards` table that mirrors the
-- on-chain `CrosschainCard` PDA state for fast UI reads.
--
-- All additions are NULL-safe: existing receipt rows (USDC, x402_spend, etc.)
-- are unaffected. Renderers branch on `receipt_kind`.
--
-- See SIDETRACK-IKA-PLAN.md sections 2.4 and 2.5.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Extend the existing `receipts` table.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS target_chain     text NULL,           -- CAIP-2: e.g. "eip155:11155111"
  ADD COLUMN IF NOT EXISTS target_recipient text NULL,           -- CAIP-10 account string
  ADD COLUMN IF NOT EXISTS target_asset     text NULL,           -- CAIP-10 or "native"
  ADD COLUMN IF NOT EXISTS amount_minor     numeric(40, 0) NULL, -- chain-native minor units
  ADD COLUMN IF NOT EXISTS amount_decimals  smallint NULL,       -- 18 for ETH, 8 for BTC, etc.
  ADD COLUMN IF NOT EXISTS dwallet_pubkey   text NULL,           -- secp/ed pubkey hex
  ADD COLUMN IF NOT EXISTS signature_scheme smallint NULL,       -- DWalletSignatureScheme u16
  ADD COLUMN IF NOT EXISTS target_tx_hash   text NULL,           -- 0x... for EVM, hex for BTC
  ADD COLUMN IF NOT EXISTS explorer_url     text NULL;           -- pre-built deep link

CREATE INDEX IF NOT EXISTS receipts_target_chain_idx
  ON receipts (target_chain)
  WHERE target_chain IS NOT NULL;

CREATE INDEX IF NOT EXISTS receipts_dwallet_pubkey_idx
  ON receipts (dwallet_pubkey)
  WHERE dwallet_pubkey IS NOT NULL;

COMMENT ON COLUMN receipts.target_chain     IS 'CAIP-2 chain id; NULL for non-crosschain receipts';
COMMENT ON COLUMN receipts.target_recipient IS 'CAIP-10 destination account; NULL for non-crosschain';
COMMENT ON COLUMN receipts.target_tx_hash   IS 'Set by record_signed_outcome; NULL for DENY or before broadcast';
COMMENT ON COLUMN receipts.amount_minor     IS 'Chain-native minor units (wei, sat, lamport). Distinct from amount_lamports which is USDC-specific.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Mirror table for the on-chain CrosschainCard state.
--    Powers the dashboard panel and `/cards/crosschain/[pubkey]` page.
--    The on-chain account is authoritative; this table is a read-through
--    cache populated by the indexer worker.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crosschain_cards (
  card_pubkey         text PRIMARY KEY,
  authority_pubkey    text NOT NULL,
  agent_pubkey        text NOT NULL,
  label               text NULL,                     -- human-readable label (off-chain only)
  label_hash          text NOT NULL,                 -- matches on-chain seed component
  dwallet_pubkey      text NOT NULL,
  gas_deposit_pubkey  text NOT NULL,
  target_chain        text NOT NULL,                 -- CAIP-2 of the card's primary chain
  daily_cap_minor     numeric(40, 0) NOT NULL,
  per_call_max_minor  numeric(40, 0) NOT NULL,
  used_today_minor    numeric(40, 0) NOT NULL DEFAULT 0,
  last_reset_slot     bigint NOT NULL,
  expiry_slot         bigint NULL,
  revoked             boolean NOT NULL DEFAULT false,
  policy_version      integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crosschain_cards_authority_idx
  ON crosschain_cards (authority_pubkey);

CREATE INDEX IF NOT EXISTS crosschain_cards_dwallet_idx
  ON crosschain_cards (dwallet_pubkey);

COMMENT ON TABLE crosschain_cards IS
  'Read-through cache of on-chain CrosschainCard state. Authoritative source is the on-chain PDA.';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Allowlist rows (one per entry) for the cards above.
--    Querying allowlist as rows is friendlier for UI than parsing a JSON blob.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crosschain_card_allowlist (
  id                bigserial PRIMARY KEY,
  card_pubkey       text NOT NULL REFERENCES crosschain_cards(card_pubkey) ON DELETE CASCADE,
  entry_index       smallint NOT NULL,
  chain_namespace   text NOT NULL,
  chain_reference   text NOT NULL,
  recipient_kind    smallint NOT NULL,
  recipient         text NOT NULL,
  asset_kind        smallint NOT NULL,
  asset             text NOT NULL,
  capability_hash   text NULL,
  UNIQUE (card_pubkey, entry_index)
);

CREATE INDEX IF NOT EXISTS crosschain_card_allowlist_card_idx
  ON crosschain_card_allowlist (card_pubkey);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RLS: cards visible to anyone who knows the card_pubkey (public-feed-style),
--    but mutations are not via PostgREST. Indexer uses service role.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE crosschain_cards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crosschain_card_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY crosschain_cards_select_public
  ON crosschain_cards
  FOR SELECT
  USING (true);

CREATE POLICY crosschain_card_allowlist_select_public
  ON crosschain_card_allowlist
  FOR SELECT
  USING (true);
