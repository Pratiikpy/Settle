-- 0046 — Row-Level Security on the 24 previously-unprotected tables.
--
-- AU-10-001 / AU-09-005 fix.
--
-- Background: 24 of 42 public-schema tables had no RLS. With Supabase's
-- default grants, the anon role (whose JWT is in the browser bundle)
-- could `SELECT *` from sensitive tables — `allowances`, `gift_sends`,
-- `auto_refill_queue`, `phase5_executions`, etc. — exposing other
-- users' financial profiles.
--
-- Strategy: deny-by-default. Enable RLS on every unprotected table.
-- Service role bypasses RLS (Supabase default), so all server-side
-- API routes that use `getSupabaseServiceClient()` continue to work.
-- Anon access is added back ONLY where genuinely public read is
-- intended (capability_registry, federation_origins, group_*).
--
-- Owner-bound reads (allowances, scheduled_sends, etc.) require the
-- caller to authenticate via wallet-sig + a JWT that includes
-- `wallet_pubkey`. Routes that don't yet establish that JWT will
-- fall back to using the service-role client (post-AU-09-006 fix).

-- ─────────────────────────────────────────────────────────────────────
-- Owner-bound: only the connected pubkey can read its own rows.
-- ─────────────────────────────────────────────────────────────────────

alter table public.allowances enable row level security;
create policy allowances_parent_read on public.allowances
    for select using (parent_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));
create policy allowances_kid_read on public.allowances
    for select using (kid_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

alter table public.auto_refill_rules enable row level security;
create policy auto_refill_rules_owner_read on public.auto_refill_rules
    for select using (owner_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

alter table public.auto_refill_queue enable row level security;
create policy auto_refill_queue_owner_read on public.auto_refill_queue
    for select using (owner_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

alter table public.round_up_rules enable row level security;
create policy round_up_rules_owner_read on public.round_up_rules
    for select using (owner_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

alter table public.round_up_queue enable row level security;
create policy round_up_queue_owner_read on public.round_up_queue
    for select using (owner_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

alter table public.scheduled_sends enable row level security;
create policy scheduled_sends_owner_read on public.scheduled_sends
    for select using (owner_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

alter table public.save_for_buckets enable row level security;
create policy save_for_buckets_owner_read on public.save_for_buckets
    for select using (owner_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

alter table public.streaming_claim_queue enable row level security;
create policy streaming_claim_queue_owner_read on public.streaming_claim_queue
    for select using (owner_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

-- gift_sends — sender + claimer can read
alter table public.gift_sends enable row level security;
create policy gift_sends_sender_read on public.gift_sends
    for select using (sender_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));
create policy gift_sends_claimer_read on public.gift_sends
    for select using (claimer_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

-- ─────────────────────────────────────────────────────────────────────
-- Group-bound: members of a group can read group rows.
-- ─────────────────────────────────────────────────────────────────────

alter table public.group_accounts enable row level security;
create policy group_accounts_member_read on public.group_accounts
    for select using (
        group_id in (
            select group_id from public.group_account_members
            where member_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
        )
        or custodian_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
    );

alter table public.group_account_members enable row level security;
create policy group_members_self_read on public.group_account_members
    for select using (member_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));
-- Members can also see other members of their groups.
create policy group_members_co_read on public.group_account_members
    for select using (
        group_id in (
            select group_id from public.group_account_members
            where member_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
        )
    );

alter table public.group_spend_requests enable row level security;
create policy group_spend_requests_member_read on public.group_spend_requests
    for select using (
        group_id in (
            select group_id from public.group_account_members
            where member_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
        )
    );

alter table public.group_spend_approvals enable row level security;
create policy group_spend_approvals_member_read on public.group_spend_approvals
    for select using (
        request_id in (
            select request_id from public.group_spend_requests
            where group_id in (
                select group_id from public.group_account_members
                where member_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
            )
        )
    );

-- ─────────────────────────────────────────────────────────────────────
-- Public read (registry / leaderboard / discovery):
-- ─────────────────────────────────────────────────────────────────────

alter table public.capability_registry enable row level security;
create policy capability_registry_public_read on public.capability_registry
    for select using (true);

alter table public.federation_origins enable row level security;
create policy federation_origins_public_read on public.federation_origins
    for select using (true);

-- ─────────────────────────────────────────────────────────────────────
-- Federated receipts — receivers + senders can read; the receipt
-- itself names recipient_pubkey + sender_pubkey columns.
-- ─────────────────────────────────────────────────────────────────────

alter table public.federated_receipts enable row level security;
create policy federated_receipts_recipient_read on public.federated_receipts
    for select using (recipient_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));
create policy federated_receipts_sender_read on public.federated_receipts
    for select using (sender_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

-- ─────────────────────────────────────────────────────────────────────
-- Receipt tags — owner of the receipt can read tags via join.
-- ─────────────────────────────────────────────────────────────────────

alter table public.receipt_tags enable row level security;
create policy receipt_tags_owner_read on public.receipt_tags
    for select using (
        request_id in (
            select request_id from public.receipts
            where card_pubkey in (
                select card_pubkey from public.agent_cards
                where authority_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
            )
            or merchant_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
        )
    );

-- ─────────────────────────────────────────────────────────────────────
-- Trust scores — public read (it's a reputation surface).
-- ─────────────────────────────────────────────────────────────────────

alter table public.agent_trust_scores enable row level security;
create policy agent_trust_scores_public_read on public.agent_trust_scores
    for select using (true);

-- ─────────────────────────────────────────────────────────────────────
-- Domain verification tokens — only the merchant who owns the token.
-- ─────────────────────────────────────────────────────────────────────

alter table public.domain_verification_tokens enable row level security;
create policy domain_verification_tokens_merchant_read on public.domain_verification_tokens
    for select using (merchant_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', ''));

-- ─────────────────────────────────────────────────────────────────────
-- Service-role-only tables (no anon policies = no anon access):
-- - phase5_executions: cron audit trail; service role writes/reads
-- - idempotency_keys: nonce/replay protection; service role only
-- - nonce_cache: replay protection
-- - kernel_receipt_attestations: indexer-only mirror
-- - fraud_flags: admin-only
--
-- We enable RLS WITHOUT adding any policy → only service role bypass
-- can access. Anon role is denied by default.
-- ─────────────────────────────────────────────────────────────────────

alter table public.phase5_executions enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.nonce_cache enable row level security;
alter table public.kernel_receipt_attestations enable row level security;
alter table public.fraud_flags enable row level security;

comment on table public.phase5_executions is
    'AU-10-001: RLS enabled with service-role-only access (no anon policies).';
comment on table public.idempotency_keys is
    'AU-10-001: RLS enabled with service-role-only access.';
comment on table public.nonce_cache is
    'AU-10-001: RLS enabled with service-role-only access.';
