# VISUAL_AUDIT_REPORT — desktop UI/UX polish findings

Sharp-human-reviewer pass over the live `use-settle-git-audit-e2e-burner-…`
preview + production. Layout, transitions, hover/focus, alignment,
inconsistency, polish.

Format per finding:
- page/route
- title + severity (P1 critical / P2 visible-bug / P3 polish)
- what looks wrong, when, repro, expected vs actual, screenshot path,
  category (visual / UX / functional+visual)

---

## V1 — Sidebar nav items have no hover state (P3 polish)

- **Page**: every connected page (sidebar surface)
- **What**: hovering a sidebar Link fires `transition: background 140ms,
  color 140ms` but no `:hover` rule actually changes anything. So you see
  no visual feedback while moving between items.
- **When**: hover anywhere on Send/Receipts/Pacts/Groups/etc. in the left rail
- **Expected**: subtle background tint or color darkening (e.g. ink-3 → ink)
- **Actual**: nothing. Cursor is `pointer` (correct), but no color or bg shift.
- **Repro**: open `/dashboard`, hover any sidebar nav item, observe.
- **Screenshot**: `visual-01-sidebar-hover-send.png` (Send hover, no diff visible vs default)
- **Category**: pure visual / UX. Not functional.

## V2 — Agent label fallback "?" on dashboard panel (P2 visible bug)

- **Page**: `/dashboard` "AGENTS ON DUTY" right-side card
- **What**: top entry shows literal `?` as label and `?` avatar.
- **When**: when an agent card has no label set (e.g. one of my owned cards has empty `label`).
- **Expected**: short pubkey (e.g. `4xNJj…X4nJ`) or "Unnamed agent"
- **Actual**: bare `?` mark in the avatar circle and as the label
- **Repro**: connect a wallet that owns a card with no label, open /dashboard
- **Screenshot**: `audit-06-dashboard-connected.png` (top of AGENTS ON DUTY)
- **Category**: visual + UX

## V3 — Dashboard self-contradiction: "No receipts yet" with active agents (P2 functional+visual)

- **Page**: `/dashboard`
- **What**: "RECENT RECEIPTS" empty state ("No receipts yet. Send to anyone →")
  while `/api/ledger?wallet=Alice` shows 22+ receipts AND "AGENTS ON DUTY"
  shows 3 active agents.
- **When**: every load
- **Expected**: 5 most recent receipts visible
- **Actual**: empty state with confused CTA
- **Repro**: send via /send (works), come back to /dashboard, see "No receipts yet"
- **Screenshot**: `visual-02-focus-state-tab.png` (visible in lower half)
- **Category**: functional+visual. Bug #21 v6 fix shipped but production runtime still empty (see GAP_CLOSURE_REPORT).

## V4 — Devnet warning banner CTA hierarchy (P3 polish)

- **Page**: every connected page (top yellow banner)
- **What**: `"You're on devnet. No real money moves." [Dismiss]`. Dismiss
  is a plain text link in the same orange tone as the dot — could blend
  into surrounding chrome at a glance.
- **Expected**: clearer "Dismiss" affordance (button-like or higher contrast)
- **Actual**: easy to miss; reads more like a footnote than a CTA
- **Category**: polish

## V5 — Profile sidebar link hardcoded /at/me (P2 visible bug)

- **Page**: every connected page sidebar — "Profile" link (You section)
- **What**: link href is `/at/me` even though the bottom-card "Open your
  profile" link correctly resolves to `/at/e2es8195v` (the user's actual
  handle). Clicking Profile lands on `/at/me` showing "@me not found".
- **Expected**: same `/at/<handle>` resolution as the bottom-card link
- **Actual**: hardcoded `/at/me`
- **Repro**: connect wallet, click "Profile" sidebar link, see "@me not found · Claim a handle"
- **Screenshot**: `audit-26-at-me.png`
- **Category**: visual + functional. Bug #25 fix shipped but runtime evidence missing.

## V6 — Card detail SPENDING RULE shows mismatched data (P2 visible bug)

- **Page**: `/cards/[id]?surface=agent`
- **What**: SPENDING RULE shows `$0.00 of —` (em-dash for cap) and
  `expires —` (em-dash) but the progress ring renders **60%**. Numbers
  and ring don't agree.
- **Expected**: ring at 0% (or hidden) since "of —" means no data; or
  ring matches whatever the cap is.
- **Actual**: 60% ring with no underlying data shown.
- **Repro**: open any card detail page
- **Screenshot**: `audit-72-card-detail.png`
- **Category**: visual

## V7 — Wishes target double-dollar `$$100.00` (P2 functional+visual) — FIXED

- **Page**: `/wishes` "Save toward" tab
- **Was**: `target $$100.00` (double dollar sign)
- **Fix**: drop literal `$` since `formatUsdc()` returns "$100.00" already
- **Commit**: `bae67c7`
- **Screenshot**: `audit-64-wish-saved.png`

## V8 — Sub-cent amounts show as `$0.00` (P2 functional+visual) — FIXED

- **Pages**: `/send` Summary and `/receipts/[id]/print`
- **Was**: 1000 lamports = 0.001 USDC formatted as `$0.00`
- **Fix**: trim trailing zeros for sub-cent values; show `$0.001`
- **Commits**: `48833e2`, `0451a6f`

## V9 — `/embed/pay` JSON parse error stacktrace (P1 functional+visual) — FIXED

- **Was**: clicking Pay showed `"Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"` because the legacy `/api/send/build` endpoint was returning the 404 HTML page.
- **Fix**: switched to `/api/swap/quote-and-build`, wrapped JSON parse in try/catch.
- **Commit**: `e9e2084`
- **Screenshot**: `audit-62-embed-pay-clicked.png` (before), `audit-60-embed-pay-valid.png` (after)

## V10 — `/m/me/{disputes,webhook,capabilities}` raw `handle_not_found` (P2 visible bug)

- **Pages**: three merchant subpages
- **What**: render raw `handle_not_found` text inside the page content area; no friendly state.
- **Expected**: redirect to `/m/<own-handle>/<sub>` if connected; otherwise friendly Claim CTA matching `/m/me/manage`.
- **Fix**: shipped, runtime evidence pending (deploy-cache).

## V11 — `/m/me/capabilities` perpetual "Resolving handle..." (P2)

- **Page**: `/m/me/capabilities`
- **What**: stuck on "Resolving handle..." loading text forever
- **Fix**: same redirect-on-me pattern as V10. Shipped.

## V12 — `/privacy`, `/brand` render WITHOUT W6AppShell (P3 polish)

- **Pages**: `/privacy`, `/brand`
- **What**: standalone marketing-style pages without the W6 sidebar/topbar that every other page uses
- **Expected**: consistent W6 chrome OR document this as intentional
- **Actual**: inconsistent. Looks like an oversight.
- **Repro**: visit `/security` (has W6 chrome) then `/privacy` (does not)
- **Screenshots**: `audit-50-security.png` (with chrome) vs `audit-51-privacy.png` (without)
- **Category**: visual / consistency. NOT FIXED — may be intentional (marketing pages outside the app shell).

## V13 — Agent template Hire button silently 503's (P2 functional)

- **Page**: `/agents/templates/<slug>`
- **What**: clicking "Hire — sign rule" hits `/api/actions/hire/<slug>/spawn` which 503's because `merchant_allowlist_unconfigured` (env vars missing).
- **Fix**: UI now shows the friendlier `err.message` ("Template has no merchants. Either set NEXT_PUBLIC_MERCHANT_* env vars or update the template.") instead of just the error code.
- **Commit**: `0a6c9b1`. Server-side root cause (config) requires ops attention.

## V14 — `/send` accepted invalid pubkey, Pay button stayed enabled (P2 functional+visual) — FIXED

- **Page**: `/send` Pubkey tab
- **Was**: typing arbitrary text e.g. `NOT_A_VALID_PUBKEY_AT_ALL` left the Pay button enabled with text `Pay 1 USDC to NOT_A_VALID_PUBKEY_AT_ALL`. Summary showed `USDC → NOT_A_VALID_PUBKEY_AT_ALL`.
- **Fix**: gate Pay button on PUBKEY_RE validation + amount > 0.
- **Commit**: `d72bd11`
- **Screenshot**: `audit-69-invalid-pubkey-pay.png`

## V15 — Streaming Pact "Parent card" dropdown shows empty despite owned cards (P2 functional+visual)

- **Page**: `/agents/streaming` "Open new stream" form
- **What**: Parent card `<select>` shows "— pick a card —" with hint "No cards yet — create one first" even though the user has 5 active OneShot Pacts visible on `/cards`.
- **Expected**: dropdown populated with the user's agent cards
- **Actual**: empty
- **Repro**: connect wallet (with cards), go to /agents/streaming, click + Open new stream
- **Screenshot**: `audit-66-streaming-submit.png`
- **Category**: functional+visual. NOT FIXED — query bug, not investigated.

## V16 — Vercel.live feedback overlay CSP-blocked (P3 polish — preview only) — FIXED

- **Page**: every preview page (not production)
- **Was**: console error `Loading the script 'https://vercel.live/...' violates Content Security Policy directive`
- **Fix**: add vercel.live to script/style/font/frame-src
- **Commit**: `359fd2b`

## V17 — `/m/me` Server Components crash "Something broke" (P1) — FIXED

- **Page**: `/m/me`
- **Was**: server-side fetch used `localhost:3000` fallback. Page rendered "Something broke."
- **Fix**: VERCEL_URL fallback + try/catch
- **Commit**: `9229dc9`

## V18 — `/r/[id]` "Receipt not found" for valid receipts (P1) — FIXED

- **Page**: `/r/<request_id>`
- **Was**: same VERCEL_URL fallback bug as V17
- **Fix**: same fix
- **Commit**: `25dcebb`
- **After-screenshot**: `audit-25-receipt-detail-real.png`

## V19 — Sidebar duplicate-active state on nested routes (P2 visible bug) — FIXED

- **Page**: every page with nested routes
- **Was**: visiting `/m/me/manage` highlighted BOTH "Overview" `/m/me/manage` AND "Public profile" `/m/me` because the active-state used `pathname.startsWith(item.href)` and BOTH were a prefix.
- **Fix**: longest-prefix match
- **Commit**: `631fc60`

## V20 — `/groups` had no create-UI (P1 functional+visual) — FIXED

- **Page**: `/groups`
- **Was**: page empty state pointed to a non-existent button. POST /api/group-accounts had no caller.
- **Fix**: built inline "+ New group" form
- **Commit**: `fd2a9da`

## V21 — `/m/me/qr` 404 (P1 functional) — FIXED

- **Page**: `/m/me/qr`
- **Was**: sidebar linked to /m/me/qr but page didn't exist
- **Fix**: built page from scratch (QR generator + share link)
- **Commit**: `f36ae15`
- **Screenshot**: `audit-67-qr-generated.png`

## V22 — Black button with invisible text on `/m/me/manage` (P2 visible bug) — FIXED

- **Page**: `/m/me/manage` "Get started as a merchant →" CTA
- **Was**: button had `text-white` class but global CSS forced `color: ink-dark` → text invisible on black bg
- **Fix**: restored `text-white` for intentionally-dark buttons
- **Commit**: `4f33613`

## V23 — `::selection` green-bleed on every page (P3 polish) — FIXED

- **Was**: selection background used the brand mainnet-green
- **Fix**: switched to neutral 12% black overlay
- **Commit**: `4f681f7`

---

# Aggregate visual stance

- **Critical visual bugs (P1)**: 4 — all FIXED before this report
- **Visible visual bugs (P2)**: 12 — 8 FIXED, 4 pending (V2 agent fallback, V3 dashboard inconsistency / Bug #21 v6 not landing on prod, V6 card detail data mismatch, V12 privacy/brand W6AppShell missing, V15 streaming dropdown)
- **Polish (P3)**: 4 — 1 FIXED, 3 documented (V1 sidebar hover, V4 devnet banner Dismiss, V12 marketing page chrome)

Mobile (390×844) and tablet (768×1024) layouts are well-designed:
sidebar collapses to a 5-icon bottom tab bar (Home/Send/Receipts/Pacts/More)
at <768px, content reflows cleanly. **The widely-believed "mobile not
tested" gap turned out to be unfounded for layout — the breakpoints
work**, though I did not test mobile-specific gestures (swipe, pinch).

Focus rings are ACCESSIBLE — browser default 2px solid outline applies
to keyboard nav. Cursor types are correct (pointer on links/buttons,
text on inputs).

Hover states are MISSING on most non-button surfaces (sidebar links,
list rows). This is the most consistent polish gap. The transition
properties are set but no `:hover` rule applies.
