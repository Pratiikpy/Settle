-- 0049_fix_group_rls_recursion.sql
--
-- AU-10-001 follow-up — Wave 5+ post-RLS-verify fix.
--
-- Problem: 0046_rls_unprotected_tables added these policies on
--          group_account_members and group_accounts:
--
--   create policy group_members_co_read on public.group_account_members
--     for select using (
--       group_id in (
--         select group_id from public.group_account_members
--         where member_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
--       )
--     );
--
--   create policy group_accounts_member_read on public.group_accounts
--     for select using (
--       group_id in (
--         select group_id from public.group_account_members ...
--       )
--       or custodian_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
--     );
--
-- Both subqueries reference public.group_account_members, which triggers
-- RLS evaluation on the same table — infinite recursion. Postgres
-- detects it and returns 500 "infinite recursion detected in policy".
--
-- Verified by `scripts/audit/rls-pg-policies.ts` 2026-05-02 — all four
-- group_* tables returned ERROR for both anon and authenticated reads.
--
-- Fix: extract the membership lookup into a SECURITY DEFINER function
-- so the inner query bypasses RLS, breaking the recursion. The function
-- is intentionally read-only (`stable`) and `set search_path = public`
-- to defend against search-path injection. We grant EXECUTE only to the
-- runtime roles (authenticated, anon, service_role).

create or replace function public.user_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select group_id from public.group_account_members
  where member_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '');
$$;

revoke all on function public.user_group_ids() from public;
grant execute on function public.user_group_ids() to authenticated, anon, service_role;

-- Replace the recursive policies with versions that call the helper.

drop policy if exists group_members_co_read on public.group_account_members;
create policy group_members_co_read on public.group_account_members
    for select using (group_id in (select public.user_group_ids()));

drop policy if exists group_accounts_member_read on public.group_accounts;
create policy group_accounts_member_read on public.group_accounts
    for select using (
        group_id in (select public.user_group_ids())
        or custodian_pubkey = coalesce(auth.jwt()->>'wallet_pubkey', '')
    );

-- The same recursion pattern exists in group_spend_requests +
-- group_spend_approvals — also reads through group_account_members.
-- Fix those too while we're here.

drop policy if exists group_spend_requests_member_read on public.group_spend_requests;
create policy group_spend_requests_member_read on public.group_spend_requests
    for select using (group_id in (select public.user_group_ids()));

drop policy if exists group_spend_approvals_member_read on public.group_spend_approvals;
create policy group_spend_approvals_member_read on public.group_spend_approvals
    for select using (
        request_id in (
            select request_id from public.group_spend_requests
            where group_id in (select public.user_group_ids())
        )
    );
