-- F4 (refund-by-emoji) — log buyer reasons off-chain. Honest support trail.
-- Insert is best-effort from /api/receipts/[id]/refund; if the table is absent, the
-- refund still completes via close_pact, only the reason isn't persisted.

create table if not exists public.refund_requests (
    id                uuid primary key default gen_random_uuid(),
    request_id        uuid not null references public.receipts(request_id) on delete cascade,
    pact_pubkey       text not null,
    authority_pubkey  text not null,
    reason            text not null,
    created_at        timestamptz not null default now()
);

create index if not exists refund_requests_request_idx
    on public.refund_requests (request_id, created_at desc);
create index if not exists refund_requests_authority_idx
    on public.refund_requests (authority_pubkey, created_at desc);

alter table public.refund_requests enable row level security;

create policy refund_requests_owner_read on public.refund_requests
    for select using (authority_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));
