-- 0018: ZK-compressed receipt mirror
--
-- Each ALLOW receipt earns an off-the-hot-path companion: a compressed-token
-- mint of 1 unit (decimals=0) of the SETTLE_RECEIPT compressed mint sent to
-- the buyer's wallet authority. The compress-cron worker fills these columns
-- after-the-fact (the user-facing payment never blocks on Light Protocol RPC).
--
-- - compressed_sig    : tx signature of the mintTo (Solscan-linkable)
-- - compressed_addr   : the SETTLE_RECEIPT compressed mint pubkey at the time
--                       (denormalized so old rows survive a future mint rotation)
--
-- Idempotency: compress-cron WHERE compressed_sig IS NULL — once filled, never
-- retried. Backfill: a row simply stays NULL until the cron picks it up; if
-- the cron is stopped indefinitely, the receipt remains valid (the on-chain
-- 4-hash commit chain is the canonical proof; the compressed token is a
-- secondary, cheaper-to-store mirror).

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS compressed_sig  text,
  ADD COLUMN IF NOT EXISTS compressed_addr text;

-- Partial index for the cron's hot loop (only rows still pending compression).
CREATE INDEX IF NOT EXISTS receipts_compressed_pending_idx
  ON public.receipts (created_at)
  WHERE compressed_sig IS NULL AND decision = 'ALLOW';
