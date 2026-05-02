-- F5.9 — Idempotency keys.
--
-- Industry-standard "Idempotency-Key" header pattern (Stripe, GitHub):
--   - Caller picks an opaque string (UUID, hash of request, etc.)
--   - Server stores key → response on first execution
--   - Replays of the same key return the cached response without re-executing
--   - TTL: 24h. Older keys are purged so we don't leak unbounded storage.
--
-- Why this exists separately from receipt idempotency: a receipt's
-- request_id IS its on-chain identity, but the BUILD step (e.g.
-- /api/send/build) doesn't yet have a confirmed on-chain ID. If the
-- network drops the response, the client retries — without an
-- idempotency key, we'd build a NEW unsigned tx with a fresh request_id,
-- and now there are two different receipts pending. The key dedupes at
-- the build step so the same request always returns the same unsigned tx.
--
-- Composite uniqueness on (key, method, path) so the same key can be
-- legitimately reused across different endpoints (e.g. both /send/build
-- and /receipts/<id>/refund) without colliding.

create table if not exists public.idempotency_keys (
    key             text not null,
    method          text not null,
    path            text not null,
    response_status integer not null,
    response_body   jsonb not null,
    created_at      timestamptz not null default now(),
    expires_at      timestamptz not null default (now() + interval '24 hours'),
    primary key (key, method, path)
);

-- Cheap purge of expired rows. Run as a daily cron or on-write.
create index if not exists idempotency_expires_idx
    on public.idempotency_keys (expires_at);

comment on table public.idempotency_keys is
    'F5.9 — replay cache for Idempotency-Key header. 24h TTL.';
