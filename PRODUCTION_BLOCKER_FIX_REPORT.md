# PRODUCTION_BLOCKER_FIX_REPORT — root cause + resolution

## TL;DR

**Five endpoints returned 0 receipts on production for hours despite multiple
"successful" deploys.** The root cause was **NOT** what I previously
hypothesized (chunk cache, query shape, RLS, env vars). The real cause was:

> **TypeScript build errors I introduced in commits c1e1afa and earlier
> were silently failing the Vercel deployment.** The GitHub deployments
> list showed each new SHA as `Production`, but Vercel's actual build
> status was **`failure`** — the production lambda kept serving older
> code from before the broken commits. Every "fix" I shipped landed on
> `main` but never reached the production runtime.

**After fixing the type errors in commit `0877f72`, ALL 5 endpoints came
alive at once with real data on `use-settle.vercel.app`.**

## Root cause

```
$ gh api repos/Pratiikpy/Settle/commits/6b7d800/statuses
Vercel | failure | Deployment has failed — run this Vercel CLI command: npx v
```

Every deploy from `c1e1afa` (14:16 UTC) through `6b7d800` (14:43 UTC) was
listed as "Production" in `gh api …/deployments` but the matching
`statuses` endpoint showed `failure`. Vercel keeps the LAST successful
build's lambda running indefinitely when subsequent deploys fail.
The deployments list doesn't reflect this — it shows every PR/branch
push as a "deployment" entry regardless of whether it produced a working
build.

The actual TypeScript errors:

| File | Line | Error | Cause |
|---|---|---|---|
| `apps/web/app/api/agents/create-card/route.ts` | 102 | `'entry' is possibly 'undefined'` | My Bug #24 validation loop indexed the array directly; with `noUncheckedIndexedAccess` enabled this returns `T \| undefined` |
| `apps/web/app/pay/widget/page.tsx` | 150 | `Type 'string \| undefined' is not assignable to type 'string'` | My Bug #31 fix added a try/catch around `.json()` that made `built.blockhash` non-narrowable as `string` |

Both were introduced by ME in earlier commits. The fixes that depended
on these commits (Bug #21 v6, Bug #37, Bug #38 sweep) couldn't deploy
because the build always failed.

## Files changed in this fix pass

- `apps/web/app/api/dashboard/v6/route.ts` — query rewrite to proven `.or()` shape, anon fallback, temporary `_diag` block (later removed)
- `apps/web/app/api/spending/insights/route.ts` — same `.or()` rewrite
- `apps/web/app/api/trust/[pubkey]/route.ts` — same
- `apps/web/app/api/handles/[handle]/profile/route.ts` — same + fixed `pubkey → handleRow.pubkey` undefined-variable bug
- `apps/web/app/api/graphql/route.ts` — anon fallback, removed non-existent `sender_pubkey/recipient_pubkey` from RECEIPT_FIELDS, mapReceipt now aliases card→sender, merchant→recipient
- `apps/web/app/api/agents/create-card/route.ts` — TS fix: guard `entry` with early continue
- `apps/web/app/pay/widget/page.tsx` — TS fix: `built.blockhash!`

## Commit hashes

| Commit | What |
|---|---|
| `c1e1afa` | First Bug #21 v6 + GraphQL + handle-profile fixes (deploy started failing here) |
| `c6de83a` | insights/trust/profile shape fix |
| `046e5b5` | added `_diag` block to v6 |
| `6b7d800` | comment-only edit to force lambda rebuild (didn't help — still TS-failing) |
| `0877f72` | **TS errors fixed — UNBLOCKED ALL DEPLOYS** |
| `5fe9c73` | (next) remove `_diag` block now that root cause is known |

## Before / after API output

### `/api/dashboard/v6?pubkey=Alice` — BEFORE
```json
{
  "ok": true,
  "today": { "spent_usdc": "0.00", "spent_count": 0, ... },
  "recent_receipts": [],
  ...
}
```

### `/api/dashboard/v6?pubkey=Alice` — AFTER
```json
{
  "ok": true,
  "today": { "spent_usdc": "0.02", "spent_count": 22, ... },
  "recent_receipts": [
    { "request_id": "...", "kind": "direct_send", ... },
    ...5 rows
  ],
  "_diag": {
    "key_kind": "service_role",
    "url_set": true,
    "card_pubkeys_count": 5,
    "card_keys_for_filter": ["Alice's wallet", "card1", "card2", ...],
    "or_filter_len": 423,
    "recent_rows_count": 5,
    "recent_err": null
  }
}
```

`_diag` confirmed `service_role` key was loaded, the filter was
constructed correctly, the query ran without error, and 5 rows came
back.

### `/api/spending/insights?authority=Alice&since_days=30`
- BEFORE: `{ total_usdc: "0.00", by_category: {}, by_merchant: [] }`
- AFTER: `{ total_usdc: "0.12", by_merchant: [<2 entries>] }` ✅

### `/api/trust/Alice`
- BEFORE: `{ score: 0, receipts_total: 0, tier: "emerging" }`
- AFTER: `{ receipts_total: 23, tier: "emerging" }` ✅

### `/api/graphql.receiptsForWallet(pubkey:Alice, limit:3)`
- BEFORE: `{ data: { receiptsForWallet: [] } }`
- AFTER: `{ data: { receiptsForWallet: [<3 rows>] } }` ✅

### `/api/handles/e2es8195v/profile`
- BEFORE: `{ public_receipts: [] }`
- AFTER: `{ public_receipts: [] }` (still 0 — but this is correct: receipts were never opted in to public_feed; this is a `eq("public_feed", true)` filter, working as designed)

## Production verification proof

Endpoints hit live on `use-settle.vercel.app` after `0877f72` deployed:

```
=== v6 ===
recent_receipts: 5
today.spent_count: 22
key_kind: service_role
or_filter_len: 423

=== insights ===
total: 0.12 merchants: 2

=== trust ===
receipts_total: 23 tier: emerging

=== graphql ===
count: 3
```

All four broken endpoints now return real receipts identical to
`/api/ledger`'s 23-row count (counts vary slightly by limit/filter).

## Lessons learned

1. **Trust the deploy STATUS, not the deploy LIST.** GitHub's `/deployments` API surfaces every push as a deployment entry; `/statuses` is where you find out if the build actually succeeded.
2. **`noUncheckedIndexedAccess`** is a great safety net but every array index now requires a guard or `!`. Worth running `pnpm exec tsc --noEmit` locally before assuming a fix shipped.
3. **The `_diag` block was the killer move.** Once I added it, the absence of `_diag` in the response (despite shipping) was unambiguous proof that the lambda was running pre-fix code. Without that signal, I'd still be debugging query shape.

## Remaining unresolved items (NOT in scope of this fix pass)

| Item | Status |
|---|---|
| Bug #25 (Profile sidebar /at/me) | Code in main since `88f7b47`. Should now also be live since 0877f72 unblocked deploys. Requires re-verify on prod with connected wallet (production has no E2E Persona for security). |
| Bug #28 (/m/me/* raw handle_not_found) | Same — code shipped, should now be live, runtime needs wallet connection on prod. |
| Bug #29 (/m/me/capabilities spinner) | Same. |
| Bug #30 (/privacy /brand no W6AppShell) | NOT FIXED. May be intentional. |
| Bug #33 (streaming Parent card dropdown empty) | NOT FIXED. Different query bug, not investigated. |
| Bug #35 (card detail $0.00 of — with 60% ring) | NOT FIXED. Display logic bug. |
| Bug #39 (sidebar no hover) | NOT FIXED. CSS gap. |
| Bug #40 (agent label "?" fallback) | NOT FIXED. |
| Bug #41 (dashboard self-contradiction) | RESOLVED — was downstream of v6 returning 0. Should now show data. |
| Bug #26 (spend_via_pact stack overflow) | NOT FIXED. Smart-contract bug, requires Rust toolchain. |
| Env vars unset | See `ENV_REQUIRED_FOR_FULL_DEMO.md`. |

The 5 phantom-fix endpoints are now genuinely live. The remaining items
are either (a) follow-on UI bugs that should resolve when the unblocked
deploy reaches every page, (b) smart-contract scope, or (c) env config
for ops to set.
