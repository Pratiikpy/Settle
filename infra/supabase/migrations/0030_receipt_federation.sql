-- F9.3 — Receipt federation skeleton.
--
-- A Settle receipt = (4-hash kernel commit) + (on-chain anchor). Other
-- protocols (x402, Solana Pay, agent-payment standards we haven't seen
-- yet) emit conceptually equivalent records. We want users to see a
-- unified ledger across them — "all my agent money, regardless of
-- protocol" — without trusting the federating party.
--
-- The design:
--   1. A federation envelope = { remote_origin, remote_request_id,
--        attestation_sig, payload_jcs_sha256 }.
--   2. Each `remote_origin` has a registered Ed25519 attestation key
--        (federation_origins table). Anyone can register a public
--        origin, but consumers only trust whitelisted ones.
--   3. The attestation_sig signs `payload_jcs_sha256 || remote_origin
--        || remote_request_id`. Verifying it proves the foreign origin
--        endorses this payload.
--   4. Imported receipts land in `federated_receipts` (NOT `receipts`)
--        so we can never confuse a Settle-native receipt with a
--        federated one — the kernel commit guarantees only apply to
--        Settle-native rows.

create table if not exists public.federation_origins (
    origin_id        text primary key, -- e.g. "x402.example.com"
    label            text not null,
    -- Base58 Ed25519 pubkey used to attest payloads.
    attestation_pubkey text not null,
    -- Whether this origin's payloads should appear in user-facing feeds.
    -- Defaults to false — admin must flip to true after vetting.
    trusted          boolean not null default false,
    homepage_url     text,
    notes            text,
    created_at       timestamptz not null default now()
);

comment on table public.federation_origins is
    'F9.3 — registry of foreign protocols whose receipts we mirror.';

create table if not exists public.federated_receipts (
    federated_id      uuid primary key default gen_random_uuid(),
    origin_id         text not null references public.federation_origins(origin_id),
    -- The remote system's stable id for this receipt. We index on
    -- (origin_id, remote_request_id) so re-imports are idempotent.
    remote_request_id text not null,
    -- Wallet pubkeys involved, lifted from the payload at import time.
    sender_pubkey     text,
    recipient_pubkey  text,
    amount_lamports   bigint,
    asset             text, -- "USDC" / "USDT" / "SOL" / etc.
    -- Free-form JSON copy of the foreign payload, BEFORE we re-canonicalize.
    raw_payload       jsonb not null,
    -- BLAKE3-or-SHA256 of canonical payload — what attestation_sig signs.
    payload_hash      text not null,
    -- Base58 Ed25519 attestation by the origin over (origin_id || remote_request_id || payload_hash).
    attestation_sig_b58 text not null,
    -- Verification status: 'verified' | 'invalid' | 'untrusted'
    status            text not null default 'untrusted',
    imported_at       timestamptz not null default now(),
    constraint federation_unique unique (origin_id, remote_request_id),
    constraint federation_status_valid check (status in ('verified','invalid','untrusted'))
);

create index if not exists federation_recipient_idx
    on public.federated_receipts (recipient_pubkey, imported_at desc)
    where status = 'verified';
create index if not exists federation_sender_idx
    on public.federated_receipts (sender_pubkey, imported_at desc)
    where status = 'verified';
create index if not exists federation_origin_idx
    on public.federated_receipts (origin_id, imported_at desc);

comment on table public.federated_receipts is
    'F9.3 — receipts mirrored from foreign origins. Separate from receipts table — kernel commit guarantees do not apply.';

-- Seed a couple of well-known origin candidates as `untrusted` so they
-- show up in admin UI immediately. Operator promotes them to trusted.
insert into public.federation_origins (origin_id, label, attestation_pubkey, homepage_url, trusted, notes)
values
    ('x402.demo', 'x402 demo origin', '11111111111111111111111111111111', 'https://x402.example', false,
     'Placeholder origin — replace attestation_pubkey before trusting.'),
    ('solana-pay.bridge', 'Solana Pay bridge', '11111111111111111111111111111111', 'https://solanapay.com', false,
     'For mirroring Solana Pay reference txs we have explicit consent on.')
on conflict (origin_id) do nothing;
