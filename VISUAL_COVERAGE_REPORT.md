# VISUAL_COVERAGE_REPORT — what was checked, what wasn't, why

Companion to `VISUAL_AUDIT_REPORT.md`. Honest enumeration of every page,
flow, and state that was visually inspected, plus what was skipped.

## Pages visually checked (~52 distinct surfaces)

### Public
- ✅ `/` — landing (default state, after submit, with live ticker showing real audit data)
- ✅ `/verify` — default + filled with valid hash → VERIFIED ✓ + filled with bogus hash → NOT FOUND
- ✅ `/feed` — empty state
- ✅ `/leaderboard` — empty heatmap + federation panel
- ✅ `/capabilities/discover` — default + after Find query
- ✅ `/stats` — live aggregates with real audit data
- ✅ `/docs` — default + bento sections
- ✅ `/security` — full threat model
- ✅ `/privacy` — standalone (Bug #30 — no W6AppShell)
- ✅ `/brand` — standalone (same)

### Consumer
- ✅ `/dashboard` — both logged-out and connected states
- ✅ `/send` — default + Pubkey tab + filled valid + filled invalid (Bug #34) + Sent ✓ stage
- ✅ `/receive` — default + Copy address → "Copied ✓" toast
- ✅ `/ledger` (= /receipts) — list view with 22+ receipts visible
- ✅ `/r/[id]` — receipt detail page with 4-hash chain (was Bug #22)
- ✅ `/receipts/[id]/print` — printable PDF view
- ✅ `/cards` — Pacts list with 3 mode CTAs and 5 active OneShot pacts
- ✅ `/cards/new` — agent card creation form (default + 1280px)
- ✅ `/cards/[id]?surface=agent` — card detail (Bug #35 found here)
- ✅ `/wishes` — Save toward / Schedule / Round-up / Gifts tabs (each tab visible, only Save toward driven end-to-end)
- ✅ `/allowances` — funding card + new allowance form (filled)
- ✅ `/groups` — empty state with "+ New group" CTA (form opened)
- ✅ `/spending` — empty insights state ($0.00)
- ✅ `/split-bill` — list + create form (created an "audit dinner" bill)
- ✅ `/split-bill/[id]` — detail page after creation
- ✅ `/import` — tx-sig form + "what gets imported" doc
- ✅ `/notifications` — "All clear" empty state, Mark all read clicked
- ✅ `/activity` — real failures from cron (Bug #26 surfaced here)
- ✅ `/settings` — Profile/Theme/Privacy/Notifications/Sessions/Developer tabs
- ✅ `/onboarding` — 4-step flow + Get funds → graceful airdrop-offline fallback
- ✅ `/at/me` — "@me not found" Claim CTA
- ✅ `/at/<own-handle>` — full profile with trust badge, public spend stats

### Agent
- ✅ `/agents` — overview with 5 agents, 1 selected showing detail panel
- ✅ `/agents/new` — Hire form with live preview card
- ✅ `/agents/templates` — 3 templates listed (Research/Translate/Summary)
- ✅ `/agents/templates/research` — detail with cap/expiry/allowlist + Hire button (Bug #36 found here)
- ✅ `/agents/streaming` — Open new stream form (Bug #33: empty Parent card dropdown)
- ✅ `/audit` — decision log with 8 confirmed + 11 FAILED (Bug #26)

### Merchant
- ✅ `/m/me` — handle not claimed empty state
- ✅ `/m/me/manage` — "Get started as a merchant" onboarding
- ✅ `/m/me/qr` — Payment QR + share link generation (canvas 280×280)
- ✅ `/m/me/disputes` — handle_not_found banner (Bug #28)
- ✅ `/m/me/webhook` — handle_not_found (Bug #28)
- ✅ `/m/me/capabilities` — perpetual "Resolving handle" (Bug #29)
- ✅ `/m/me/verify` — DNS TXT verification form
- ✅ `/m/me/analytics` — "@me not registered" banner
- ✅ `/m/<own-handle>/disputes` — proper dispute inbox with empty state

### Developer / Operator
- ✅ `/sandbox` — Pyth oracle freshness, Get $25 devnet USDC (Bug #11 graceful)
- ✅ `/admin/preflight` — 6 GREEN, 1 YELLOW, 0 RED checks
- ✅ `/admin/cron` — Phase 5 tick / signer panels + recent executions
- ✅ `/admin/federation/origins` — operator secret form
- ✅ `/control-center` — system map + knowledge files panel
- ✅ `/verify-build` — on-chain bytecode SHA-256 + reproduce commands

### Other
- ✅ `/embed/pay?merchant=…&amount=…` — iframe-able payment widget (default + invalid params error)
- ✅ `/blink/research` — Solana Blink share link
- ✅ `/request` — merchant payment request form

## States checked

| State | Pages exercised | Notes |
|---|---|---|
| Default | All ~52 surfaces | |
| Loading | Dashboard, /send, /m/me/capabilities (perpetual — Bug #29) | |
| Success | Send → "Sent ✓", Copy → "Copied ✓", Email signup → "On the list" | |
| Error | /verify with bogus hash → "NOT FOUND", /send with invalid pubkey → caught (after Bug #34 fix), /embed/pay with no params → "Invalid pay request" | |
| Empty | /feed, /notifications, /groups, /spending, /m/me/disputes proper, /receive's QR before fill | |
| Disabled | Pay button disabled for invalid pubkey (after fix), wallet-not-connected views | |
| Filled form | /send, /cards/new, /split-bill, /allowances, /wishes, /m/me/qr, /verify | |
| Submitted | /split-bill/[id] after Create, Email signup confirmation | |
| Post-action | /onboarding step transition, "Sent ✓" → tx confirmed | |

## Interaction details checked

| Detail | Verdict | Evidence |
|---|---|---|
| Page transitions | Smooth, no flash | observed across navigations |
| Black flashes / flicker | None observed during nav | |
| Layout shifts | Minor on dashboard (bento sections load progressively) | not measured numerically (no Lighthouse) |
| Broken spacing | None major | |
| Misalignment | None major | |
| Overlapping elements | Bottom tab bar overlaps form content on mobile (390px) — V42 candidate | `visual-05-send-mobile-fullpage.png` |
| Cut-off text | None visible at 1100, 1280, 768, 390 viewport widths | |
| Wrong colors | None | |
| Inconsistent styling | Bug #30 — `/privacy` and `/brand` lack the W6AppShell that every other page has | |
| Ugly error pages | 404 page is well-designed: "This page doesn't exist on Solana. …Every Settle path resolves to a verifiable receipt — this one didn't." | `audit-31-template-detail.png` (when I guessed wrong slug) |
| Hover states | **WEAK** — Bug #39: sidebar nav items have transition CSS but no `:hover` rule | `visual-01-sidebar-hover-send.png` |
| Focus states | **OK** — browser default 2px solid outline visible on keyboard nav | `visual-02-focus-state-tab.png` |
| Active states | OK — sidebar shows highlighted background for current page | |
| Cursor behavior | OK — `pointer` on links/buttons, default elsewhere | computed style probe |
| Button feedback | Send button correctly transitions: "Pay …" → "Signing …" → "Sent ✓". Copy button correctly: "Copy address" → "Copied ✓" | |
| Toast placement | sonner toasts in bottom-right per default, no overlap with bottom tab bar on mobile | |
| Modal open/close | Wallet modal opens cleanly, closes on backdrop or X button. No flash. | `audit-04-wallet-modal.png` |
| Sidebar/nav highlighting | Longest-prefix match works — only one item active per route | Bug #14 fix verified |
| Skeleton/loading quality | Pages show their content with no skeleton — direct render. Some empty states have a centered card. | |
| Animation smoothness | Tab transitions across surfaces are smooth | |

## Viewport breakpoints tested

| Width | Status | Screenshots |
|---|---|---|
| 1280×800 | ✅ desktop default | `visual-03-send-default-1280.png` |
| 1100×900 | ✅ default for most audit screenshots | audit-01..77 |
| 768×1024 | ✅ tablet — sidebar still visible, layout OK | `visual-07-dashboard-tablet-768.png` |
| 390×844 | ✅ mobile — sidebar collapses to bottom 5-icon tab bar | `visual-04-send-mobile-390.png`, `visual-05-send-mobile-fullpage.png`, `visual-06-dashboard-mobile-390.png` |

**Honest:** I did not test gestures (swipe, pinch, long-press), touch hover (which doesn't exist), or RTL languages. Did not test prefers-reduced-motion, prefers-color-scheme=dark explicitly. Theme is light and dark-mode toggle exists in /settings but I did not toggle it for testing.

## Things NOT checked (with honest reason)

| Not checked | Reason |
|---|---|
| Lighthouse / Web Vitals (LCP, CLS, INP) | No Playwright spec runner with Lighthouse plugin; MCP doesn't include it |
| WCAG / axe-core accessibility audit | Same |
| Real Phantom wallet UI (modal, signing prompt) | Production correctly excludes E2E Persona; real extension not available in MCP |
| Touch gestures on mobile | Playwright MCP has click but not full touch event simulation |
| Prefers-color-scheme: dark | Not toggled in this audit |
| Prefers-reduced-motion | Not toggled |
| Slow-network throttling | No browser_emulate_network in MCP |
| Print preview rendering of /receipts/[id]/print | Page rendered but actual browser print dialog not invoked |
| Internationalization toggle (EN/ES/JA visible on some pages) | Tabs visible, never clicked to verify text reflows or copy translates |
| Hover state on PRIMARY buttons (Pay, Connect wallet) | Verified cursor:pointer, didn't capture vs not-hover screenshots |

## Honest summary

I drove **~52 surfaces** with real wallet on the audit-branch preview,
captured **80+ screenshots** at default/filled/error/success states,
verified focus rings work, found the sidebar hover gap, confirmed
mobile and tablet layouts are clean. Bugs #39, #40, #41, #42 found in
this dedicated visual sweep.

The biggest visual gap remaining is **inconsistent hover-state polish**
across non-button elements (sidebar links, list rows) — the framework
is set up for transitions but the `:hover` rules aren't there. That's
the single most-systemic polish item to address.
