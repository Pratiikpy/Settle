-- F5 / P3 — voice-note + text attachments on receipts. Sealed-box encrypted client-side
-- before upload. Decrypt-rights stay with the original recipient pubkey (NOT transferred
-- when the cNFT collectible transfers — that's V0.4 territory).
--
-- Trust model: ciphertext sits in Supabase Storage. The sealed-box recipient key is the
-- per-deployment SETTLE_SEALED_BOX_PUBKEY (same as how purpose text already works). Server
-- holds the privkey and decrypts on /play, gated by wallet-sig auth that verifies the
-- caller IS the original sealed_box_for_pubkey or the card.authority.

create extension if not exists "pgcrypto";

create table if not exists public.receipt_attachments (
    id                     uuid primary key default gen_random_uuid(),
    request_id             uuid not null references public.receipts(request_id) on delete cascade,
    kind                   text not null check (kind in ('voice_note', 'text_note', 'image')),
    storage_path           text not null,                 -- Supabase Storage object path (bucket: receipt-attachments)
    sealed_box_for_pubkey  text not null,                 -- pubkey the row's rights belong to (does NOT shift on cNFT transfer)
    duration_ms            integer,
    mime_type              text,
    bytes                  integer,                       -- ciphertext byte length, for cap enforcement + UI sizing
    created_by_pubkey      text not null,                 -- who uploaded (sender side)
    created_at             timestamptz not null default now()
);

create index if not exists ra_request_idx
    on public.receipt_attachments (request_id, created_at desc);
create index if not exists ra_recipient_idx
    on public.receipt_attachments (sealed_box_for_pubkey, created_at desc);

alter table public.receipt_attachments enable row level security;

-- Read-access stays with the original receipt recipient. cNFT transfer does NOT widen this.
-- Either the sealed_box_for_pubkey OR the card.authority for an agent receipt may read.
create policy ra_recipient_read on public.receipt_attachments for select using (
    sealed_box_for_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
    or request_id in (
        select r.request_id from public.receipts r
        join public.agent_cards c on r.card_pubkey = c.card_pubkey
        where c.authority_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
    )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage bucket. Private (no public-read), RLS lives on the metadata table above.
-- Server uses SUPABASE_SERVICE_ROLE_KEY to upload + sign download URLs; clients
-- only ever talk to /api/receipts/[id]/attachments routes, never Storage directly.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'receipt-attachments',
    'receipt-attachments',
    false,
    524288,                                   -- 512 KB cap (sealed-box wrapper + 10s opus is ~50-100KB)
    array['application/octet-stream']         -- ciphertext only — server enforces no plaintext audio uploads
)
on conflict (id) do nothing;

-- Storage policies: only service-role inserts/selects. Routes act as the sole gateway.
create policy ra_storage_service_only_insert
    on storage.objects for insert
    with check (bucket_id = 'receipt-attachments' and auth.role() = 'service_role');

create policy ra_storage_service_only_select
    on storage.objects for select
    using (bucket_id = 'receipt-attachments' and auth.role() = 'service_role');

create policy ra_storage_service_only_delete
    on storage.objects for delete
    using (bucket_id = 'receipt-attachments' and auth.role() = 'service_role');
