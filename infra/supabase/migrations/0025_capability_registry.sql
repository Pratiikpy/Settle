-- F9.2 + F3.4 — Capability registry.
--
-- Maps an opaque 32-byte capability_hash to:
--   - A human alias ("Translate EN→FR")
--   - A short description
--   - The spec components used to compute the hash (so anyone can re-derive
--     and confirm the mapping is honest, not made up)
--
-- The hash is computed from canonical JSON of:
--   { domain, method, path, amount_lamports, version }
-- via BLAKE3. See packages/sdk/src/capability-hash.ts for the canonical
-- algorithm. The registry's `verified` column is true when the API
-- endpoint successfully recomputes the same hash from the stored spec
-- components.
--
-- Why "verified" matters: anyone can claim "0xdeadbeef == Translate EN→FR".
-- The registry surfaces unverified entries differently in the UI so users
-- aren't tricked. To get verified=true, the contributor must submit the
-- spec that produces that hash — which means they actually know what the
-- hash represents.
--
-- Multiple aliases per hash are allowed (e.g. "Translate" + "翻訳"); the
-- composite primary key (capability_hash, alias) prevents duplicates.

create table if not exists public.capability_registry (
    capability_hash       text not null,
    alias                 text not null,
    description           text,
    -- Spec components used to derive the hash. NULL = "alias only,
    -- contributor didn't supply the spec for re-verification."
    spec_domain           text,
    spec_method           text,
    spec_path             text,
    spec_amount_lamports  text,
    spec_version          integer,
    -- True when the server recomputed the hash from spec_* and got a match.
    verified              boolean not null default false,
    -- Wallet that submitted this entry. Useful for trust + de-duplication.
    contributed_by_pubkey text not null,
    created_at            timestamptz not null default now(),
    primary key (capability_hash, alias),
    constraint capability_hash_format check (capability_hash ~ '^[0-9a-f]{64}$'),
    constraint alias_format check (alias ~ '^[A-Za-z0-9 _\-/→]{2,64}$'),
    constraint method_check check (
        spec_method is null or spec_method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
    )
);

-- Lookup by hash (for the receipt-page badge → alias resolver).
create index if not exists capability_registry_hash_idx
    on public.capability_registry (capability_hash);
-- Filter by domain for the browse view ("show all openai.com capabilities").
create index if not exists capability_registry_domain_idx
    on public.capability_registry (spec_domain)
    where spec_domain is not null;
-- Verified-only queries (the "trusted" view).
create index if not exists capability_registry_verified_idx
    on public.capability_registry (verified)
    where verified = true;

comment on table public.capability_registry is
    'F9.2/F3.4 — public registry mapping capability_hash to human aliases + spec.';
