-- C104 — Self-serve merchant webhook registration.
--
-- Until now, merchant webhook URLs lived in env vars
-- (MERCHANT_WEBHOOK_URL_<TRUNCATED_PUBKEY>) — operator-only, requires
-- a deploy to add a merchant. That's fine for V0 demo merchants but
-- doesn't scale; a real product needs merchants to self-register.
--
-- Adds three columns to verified_merchants:
--   webhook_url            — the HTTPS URL we POST receipts to.
--   webhook_signing_secret — per-merchant HMAC secret. The single
--                            global SETTLE_WEBHOOK_SIGNING_SECRET
--                            stays as a fallback for env-var configs;
--                            new per-merchant secrets take precedence.
--   webhook_last_delivered_at — for the merchant dashboard's "is it
--                               working?" probe.
--
-- The webhook_signing_secret is generated server-side on PUT (32 random
-- bytes hex-encoded) and shown to the merchant ONCE. After that, only
-- a hash of it is queryable; the plain secret never leaves the merchant's
-- copy. Same model as Stripe webhook signing secrets.
--
-- Why a per-merchant secret instead of one global: a global secret
-- means EVERY merchant can verify EVERY other merchant's webhook
-- payload, which leaks a one-way info channel ("this many receipts
-- went to this pubkey today"). Per-merchant secrets isolate.

alter table public.verified_merchants
    add column if not exists webhook_url text,
    add column if not exists webhook_signing_secret text,
    add column if not exists webhook_last_delivered_at timestamptz,
    add column if not exists webhook_last_attempt_at timestamptz,
    add column if not exists webhook_last_error text;

-- Validate URL shape — only enforced at INSERT/UPDATE time at the API
-- layer; a CHECK constraint here would reject NULL (which is the "no
-- webhook configured" signal).

create index if not exists vm_webhook_url_idx
    on public.verified_merchants (merchant_pubkey)
    where webhook_url is not null;

comment on column public.verified_merchants.webhook_url is
    'C104 — self-serve webhook URL. NULL = no webhook (env-var fallback applies if any).';
comment on column public.verified_merchants.webhook_signing_secret is
    'C104 — per-merchant HMAC secret. Generated on PUT; shown once. Per-merchant isolation vs the global SETTLE_WEBHOOK_SIGNING_SECRET.';
