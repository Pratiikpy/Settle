# WAVE_6 — Frontend redesign plan

**Source of truth for the redesign.** Don't deviate without updating this file.

---

## What we're doing

Take the prototype at `C:\Users\prate\Downloads\setltlt protype\` (24 JSX screens, 5,615 lines, single HTML host, all mock data) and apply its **design system + IA + visual language** to our existing 55 live routes in `apps/web/`. Keep all real data, wallet, on-chain wiring intact. No mocks anywhere — every number on every page comes from the live API or gets cut.

## What we're NOT doing

- Deleting working routes
- Faking numbers (`$1.04M agent spend governed` only ships if the real devnet number is large enough; otherwise we change the framing, not the value)
- Forking the existing component library — we extend `packages/ui` + `apps/web/components`, not replace it
- Rewriting backend, indexer, program, or any data layer
- Building 6 separate "apps" — it's one app with a surface switcher that scopes the sidebar; existing routes stay where they are

---

## The wedge

**Port the prototype's design tokens + shared chrome (logo, sidebar, topbar, surface switcher, bento card primitive, type scale) into `apps/web` and `packages/ui`, then reskin every route on top.**

Without this foundation every page is a one-off. With it, every reskin is ~30-90 minutes of layout work plus real-data wiring.

---

## Three surfaces (build order)

### Surface 1 — Foundation (no UI yet, all reusable plumbing)

| Item | Where | Notes |
|---|---|---|
| Tokens | `apps/web/app/globals.css` | Port `:root` from prototype `Settle App.html`: `--bg #FDFDFD`, `--ink-*` zinc scale, `--rule`, `--accent`, `--r-card 24px`, etc. Coexist with current Tailwind. |
| Fonts | `apps/web/app/layout.tsx` via `next/font` | Inter (sans), Outfit (heading), JetBrains Mono. No Google CDN — `next/font` self-hosts. |
| Logo | `packages/ui/src/logo.tsx` | Port the prototype's inline SVG (rounded square + 2 white arcs + 2 emerald arcs + center dot). Single React component, supports `mark`/`wordmark`/`size` props. **Used everywhere logo appears**, replacing every current header logo + favicon source. |
| Bento Card | `packages/ui/src/bento.tsx` | The card primitive every prototype screen uses. Variants: default, span-2, row-2, dark-strip. Includes the gradient bg + 24px radius + hover lift. |
| Sidebar | `apps/web/components/sidebar.tsx` | Sticky, 232px, IA scoped to active surface. Logo top, nav sections, "You" footer card with trust score. |
| Topbar | `apps/web/components/topbar.tsx` | Sticky, holds Surface Switcher (left), spacer, Cluster Badge, Wallet Button (right). |
| Surface Switcher | `packages/ui/src/surface-switcher.tsx` | The 6-mode pill. Stored in URL (`?surface=consumer`) so it's deeplinkable + shareable. Default = inferred from connected wallet's primary role; falls back to `consumer`. |
| Cluster Badge | `packages/ui/src/cluster-badge.tsx` | Devnet (amber dot) / Mainnet (emerald dot). Reads `NEXT_PUBLIC_SOLANA_CLUSTER`. |
| Pill / Stat / Spark | `packages/ui/src/{pill,stat,spark}.tsx` | Used across nearly every prototype card. |

**Acceptance:** every existing page can `import { BentoCard, Pill, Stat } from "@settle/ui"` and `import { Sidebar, Topbar } from "../components/*"` and render in the new shell with zero changes to its data layer.

---

### Surface 2 — Public marketing reskin

The first impression. Has to look as good as the prototype.

| Page | Route | What | Real-data sources | Status |
|---|---|---|---|---|
| Landing | `/` | Replace current 175-line `page.tsx` with prototype `screen-landing.jsx` layout: SOLANA-NATIVE PAYFI RAIL pill → giant headline → email + CTAs → AgentCard live demo (right side, real `settle.agentCard.create({...})` snippet) → bottom strip stats → Product Surface bento → Made-for-Everyone 6-card grid → For Builders dark strip → Trust Layer 3-card → Final CTA → Footer. | **Stats strip** swap: the prototype's `$1.04M / 400ms / 18` → real values from new endpoint `/api/stats/landing` (total_allow_volume_usdc, p50_confirmation_ms, total_denied_count). If a number is too small to be impressive (e.g. <$10K) we cut the strip and ship without it; we don't fake. | NEW (replaces existing) |
| Verify (walletless) | `/verify` | Receipt verifier. Paste request_id or hash → see 4-hash recompute + ALLOW/DENY decision + counterparty. Existing `<settle-verify>` component already does this — wrap in prototype shell. | `/api/receipts/[id]` + client-side BLAKE3 | EXISTS, reskin |
| Stats | `/stats` | Live network heatbeat: total receipts, ALLOW rate, top capabilities, 24h volume, federation peer count. | New endpoint `/api/stats/network` aggregating receipts, capability_registry, federation_origins. | EXISTS, expand |
| Capability heatmap | `/leaderboard` | Already exists with realtime Supabase subscription. Reskin to bento grid. | Existing realtime channel. | EXISTS, reskin |
| Public feed | `/feed` | Recent ALLOW receipts where `public_feed=true`. Card per receipt with hash-chain proof. | Existing. | EXISTS, reskin |
| Public proof | `/at/[handle]/proof` | Reputation page; trust score, capability history, public receipts. Built last session. | Existing. | EXISTS, reskin |
| Receipt detail | `/receipts/[id]` | Single receipt view — hashes, on-chain links, animation, tags. | Existing. | EXISTS, reskin |
| Pricing/access | `/` (CTA) + email capture | "Request access" form posting to a new `/api/waitlist` route → Supabase `waitlist` table (new). | New endpoint + table. | NEW |
| Docs hub | `/docs` | Currently has a stub. Rebuild to prototype's developer-page bento + side-nav: Pay component, Verify component, Webhooks, MCP middleware, SDKs (TS/Py/Rust). | Existing markdown if any; otherwise new MDX. | EXPAND |
| Security | `/security` | Already exists. Verify content; add prototype shell. Lists 4-hash kernel, audit status, RLS posture. | Existing. | EXISTS, reskin |
| Public goods | `/public-goods` | Already exists. Reskin. | Existing. | EXISTS, reskin |
| Brand | `/brand` (NEW) | Logo download (SVG/PNG variants), color tokens, type scale, dos/don'ts. One scrollable page. | Static. | NEW |
| Changelog | `/changelog` (NEW) | Scrollable list of meaningful changes per devnet build. Source: hand-curated MDX so we control what's user-facing. | Static MDX. | NEW |
| About | `/about` (NEW) | Mission + team (when there's a team) + the receipt thesis. One page. Skip if you'd rather hold for funding. | Static. | NEW (optional pre-funding) |
| Privacy | `/privacy` (NEW) | Real privacy policy. Required for prod traffic + npm/PyPI publish trust. | Static. | NEW |
| Terms | `/terms` (NEW) | Real terms. Required. | Static. | NEW |
| 404 | `not-found.tsx` | Already exists. Reskin to prototype style. | Existing. | reskin |

---

### Surface 3 — Authenticated app reskin

Once a wallet connects. Surface switcher controls which sidebar IA applies. Pages stay at their current routes.

#### Surface: Consumer (default)

Sidebar: Home / Send / Receipts / Pacts · Money: Groups / Savings / Schedule · You: Profile / Notifications / Settings

| Prototype screen | Route in our app | Real-data | Status |
|---|---|---|---|
| `c-home` | `/dashboard` (or `/` for connected) | Hi @handle hero, dark balance strip ($USDC + $SOL · cluster), bento: Today (spent/received/agents-active) + Agents on duty (3 cards) + Recent receipts table + Active Pacts row + Coming up + Saving toward + 4-hash protocol callout | All from `/api/dashboard` (NEW aggregate endpoint pulling from balances + receipts + cards + auto-refill + savings). | EXISTS, full reskin |
| `c-send` | `/send` | Compose: recipient (handle/pubkey/QR/screenshot), amount, note, voice memo. Route inference, capability hash, preflight cost. | Existing wallet adapter + `/api/send/build`. | EXISTS, reskin |
| `c-receipts` | `/receipts` (list) + `/receipts/[id]` | Filterable list, FTS search, kind/decision/date filters, tag chips. | Existing search endpoint. | EXISTS, reskin |
| `c-pacts` | `/cards` (list) + `/cards/[id]` (detail) | Active/closed/revoked. OneShot/Streaming/DeliveryEscrow tiles. Slide-to-revoke with frost-shatter. | Existing. | EXISTS, reskin |
| `c-groups` | `/groups` | N-of-M quorum spending. List + detail. | Existing (RLS just fixed). | EXISTS, reskin |
| `c-savings` | `/wishes` | Savings goals progress. Existing route. | Existing. | EXISTS, reskin |
| `c-schedule` | `/allowances` | Recurring schedules: rent, allowance, donations. | Existing. | EXISTS, reskin |
| `c-profile` | `/at/[handle]` | Self-view of public profile. | Existing. | EXISTS, reskin |
| `c-notifs` | `/activity` | Feed of all events touching this wallet. Existing. | Existing. | EXISTS, reskin |
| `c-settings` | `/settings` | Theme, locale, handle, exports, relayer, security. | Existing. | EXISTS, reskin |

#### Surface: Agent

Sidebar: Overview / Agent cards / Pacts / Templates · Live: Decisions / Receipts / Caps & rules

| Prototype screen | Route | Status |
|---|---|---|
| `a-home` | `/agents` | Existing. Reskin to bento with: # active agents, total spend today, denial rate, latest decisions feed. |
| `a-cards` | `/cards?role=agent` | Filtered cards view. Reuse existing /cards. |
| `a-pacts` | `/cards?type=pact` | Same. |
| `a-templates` | `/agents/templates` (NEW route, MDX) | Curated AgentCard templates: Research, Creative, Travel, Ops. One-click hire (existing Blink). |
| `a-decisions` | `/audit` | Existing. Reskin. |
| `a-receipts` | `/receipts?role=agent` | Filter param on existing. |
| `a-policies` | `/cards/[id]?tab=policy` | Tab on existing card detail. |

#### Surface: Merchant

Sidebar: Overview / Public profile / Capabilities · Sell: QR & links / Disputes / Webhooks · Trust: Verify domain / Analytics

| Prototype screen | Route | Status |
|---|---|---|
| `m-home` | `/m/[handle]/manage` | Existing (route under `/m/[handle]/*`). Reskin. |
| `m-profile` | `/m/[handle]` | Existing. Reskin. |
| `m-capabilities` | `/m/[handle]/capabilities` | Existing. Reskin. |
| `m-qr` | `/qr/[merchant]/[slug]` + `/m/[handle]/qr` (new aggregator) | New aggregator page; existing single-QR detail. |
| `m-disputes` | `/m/[handle]/disputes` | Existing. Reskin. |
| `m-webhooks` | `/m/[handle]/webhook` | Existing. Reskin. |
| `m-verify` | `/m/[handle]/verify` | DNS verify flow. Existing. |
| `m-analytics` | `/m/[handle]/analytics` | Existing. Reskin. |

#### Surface: Developer

Sidebar: Docs / SDKs / MCP middleware · Embed: Pay component / Verify component / Webhooks · Tools: API explorer / Sandbox

| Prototype screen | Route | Status |
|---|---|---|
| `d-docs` | `/docs` | Reskin + expand. |
| `d-sdks` | `/docs/sdks` (NEW MDX) | Document `@settle/sdk` (TS), `settle-protocol-sdk` (Py), `settle-rs` (Rust). |
| `d-mcp` | `/docs/mcp` | Existing stub. Expand with `@settle/mcp-middleware` snippets. |
| `d-pay` | `/docs/pay-component` | Existing stub. Replace with full embed docs for `<settle-pay>` (now `@settle-web/web-components`). |
| `d-verify` | `/docs/verify-component` | Same for `<settle-verify>`. |
| `d-webhooks` | `/docs/webhooks` | Existing stub. Expand. |
| `d-api` | `/docs/api` (NEW) | OpenAPI-style explorer for `/api/*` routes. |
| `d-sandbox` | `/sandbox` | Existing. Reskin. |

#### Surface: Operator

Sidebar: Health / Cron / Federation / Preflight / Verify build

| Prototype screen | Route | Status |
|---|---|---|
| `o-health` | `/control-center` (or new `/operator`) | Cron tick health, indexer cursor, RPC health, Sentry status. |
| `o-cron` | `/admin` | Existing. Reskin. |
| `o-federation` | `/admin/federation` (NEW or existing) | Peer list + signing health. |
| `o-preflight` | `/admin/preflight` (NEW) | RPC + balances + program-account preflight. |
| `o-build` | `/verify-build` | Existing. Reskin. |

#### Surface: Public

Already covered in Surface 2 marketing tier. The mode pill on this surface routes to `/verify`, `/leaderboard`, `/capabilities`, federation page, `/stats`, `/feed`.

---

## Aggregate endpoints we need to add

These don't exist yet; the bento cells in the prototype demand them:

| Endpoint | Returns | Used by |
|---|---|---|
| `/api/stats/landing` | `{ total_allow_usdc, p50_confirm_ms, total_denied }` for landing strip | Landing page stats strip (gated: only render if values are presentable) |
| `/api/stats/network` | `{ receipts_24h, allow_rate_24h, top_capabilities, federation_peers, total_volume_usdc }` | `/stats` page |
| `/api/dashboard` | `{ today: {spent, received, receipts_count}, agents_on_duty: [...3], pacts_active: [...3], coming_up: [...], savings: [...] }` | Consumer home bento (one round trip instead of 6) |
| `/api/agents/overview` | `{ active_count, spend_today, denial_rate, recent_decisions: [...10] }` | Agent surface home |
| `/api/m/[handle]/overview` | `{ revenue_today, dispute_count, capability_count, top_buyers, webhook_health }` | Merchant surface home |
| `/api/operator/health` | `{ cron_last_tick_ms, indexer_lag_slots, rpc_p50_ms, sentry_24h_errors }` | Operator surface home |
| `/api/waitlist` (POST) | inserts email into `waitlist` table | Landing page email capture |

These are thin SQL aggregations + a new `waitlist` migration. ~1-2 hours each.

---

## On the logo

The prototype logo is an inline SVG (rounded zinc-950 square + 2 white arcs + 2 emerald arcs + white center dot). Two paths:

**A. Port as React `<Logo />` component** (recommended) — `packages/ui/src/logo.tsx`. Vector, scales to any size, no asset to manage, swappable theme variants. Used everywhere via `import { Logo } from "@settle/ui"`.

**B. Export as PNG/SVG image asset and use `<Image src="/logo.svg" />`** — simpler if a designer later wants to swap the file without touching code.

I'll do A by default. If you want B, say so before I start and I'll output `public/logo.svg` + `public/logo.png` and use those throughout. (Could also do both — `<Logo />` component that renders the SVG, plus `public/logo.svg` for og:image, og favicon etc.)

---

## Hard rules (zero compromise)

1. **No fake numbers anywhere.** If a stat exists in the prototype but we can't back it on devnet today, we either swap framing ("Verified on every payment" instead of "$1.04M governed") or hide the strip.
2. **Prototype's mock data files are reference only.** No `data.jsx` ever lands in `apps/web`.
3. **Every page must work without a wallet connected.** If a page needs a wallet, we render a "connect wallet" CTA in the prototype's shell, not crash.
4. **Existing E2E suite (64/64) must stay green** at every step. Visual regression baselines get updated on the design-system commit, then locked.
5. **Mobile is non-negotiable.** Prototype is desktop-centric. Each reskinned page goes through a 390px pass.
6. **No backward-compat shims** — when we replace a header, we delete the old one. No `header-old.tsx`.

---

## Order I'll work in

| Wave | Days est. (reasonable, not contractual) | Output |
|---|---|---|
| 6.0 Foundation | 1 day | tokens, fonts, Logo, BentoCard, Pill, Stat, Sidebar, Topbar, SurfaceSwitcher, ClusterBadge, WalletButton — all in place but unused |
| 6.1 Landing reskin + new pages | 1 day | `/` rebuilt, `/verify` reskinned, `/stats` real data, `/brand`, `/changelog`, `/privacy`, `/terms` shipped |
| 6.2 Consumer surface | 2 days | Sidebar wired for consumer; `/dashboard`, `/send`, `/receipts/[id]`, `/cards/[id]`, `/groups`, `/wishes`, `/allowances`, `/activity`, `/settings`, `/at/[handle]` all reskinned with real data |
| 6.3 Agent + Merchant surfaces | 2 days | Sidebar+IA per surface, all 8 agent screens + 8 merchant screens reskinned |
| 6.4 Developer + Operator + Public | 1 day | Docs hub expanded, sandbox reskinned, control-center reskinned, `/leaderboard` + `/feed` reskinned |
| 6.5 Mobile pass | 1 day | Every reskinned page at 390px viewport |
| 6.6 E2E baseline lock + new specs | 0.5 day | Update visual-regression baselines, add new specs for surface switcher behavior |
| 6.7 Final review | 0.5 day | Side-by-side prototype-vs-live screenshot for every page, confirm no fake data, ship |

Total realistic budget: **~9 days** of focused work. Could compress with parallelism on streams 6.2–6.4.

---

## What I want from you before starting

1. **Approve the wedge + 3-surface order above.** If you want different order (e.g. landing first because hackathon visibility), say so.
2. **Logo path: A (component) or B (image asset) or both?** Default A.
3. **Surface switcher: keep all 6 modes, or simplify?** I'd argue 6 is right for marketing depth. Real users will rarely hand-switch — they'll start on the surface their wallet's role implies. But it's a cool framing.
4. **About / Brand / Changelog: ship pre-funding or hold?** Pre-funding versions are mostly placeholder. I'd ship Brand + Changelog now, hold About for when there's a team to put on it.
5. **Anything in the current app you want killed?** (e.g. routes nobody uses, redundant pages.) I'll otherwise preserve all 55.

---

## What I'm not going to do unless you say so

- Add a chat/support widget (Intercom-style)
- Add cookie banner (we don't run analytics by default)
- Add language switcher beyond what `/settings` already supports
- Add dark/light toggle in the topbar (it's in `/settings` and works fine)
- Add a /pricing page (we don't have pricing yet)
- Add any "premium" or "pro" upsell anywhere
- Add a blog (skip until post-launch)

If any of those become important, we add them later as a Wave 7.

---

**This file is the contract for Wave 6.** Approve, push back, or edit. Once approved I start with Wave 6.0 Foundation.

---

# Sub-docs (read these too)

- **`WAVE_6_PAGE_SPECS.md`** — chrome spec + 6 deep page specs (landing, dashboard, send, receipt detail, card detail, settings) + generic reskin template for the other ~40 pages
- **`WAVE_6_COPY.md`** — every user-facing string with KEEP / REWRITE / CUT decisions
- **`WAVE_6_DATA.md`** — verified SQL for the 7 new aggregate endpoints + waitlist migration + index plan
- **`WAVE_6_MOTION.md`** — animation catalog with reduced-motion strategy + perf budget

These four sub-docs are the implementation contract. The master plan below is the high-level + the cross-cutting rules below.

---

# Cross-cutting rules

## Empty-state strategy

Every page has 3 modes:
1. **Empty** — no real data exists yet (zero receipts, no agents, no pacts). Show a 1-line empty message + a single CTA toward the relevant action. Never show fake numbers.
2. **Partial** — some data exists. Render what exists. Hide cells that have nothing rather than showing "0 / 0". Numerical zero only appears when the user did the action and got zero (e.g. "Today: $0 spent / 0 receipts").
3. **Populated** — full data. The bento grid in its full prototype-like glory.

The prototype's screenshots all show the **populated** state. Devnet today is closer to **partial**. We don't ship pages that look empty without the empty-state copy in place.

**Demo data:** we do NOT seed fake demo data into Supabase. If a sales/judge demo needs the populated view, we generate a curated `?demo=1` query mode that pulls from a known well-populated wallet (the deployer wallet `B4cArR1M…to2Cp`) read-only. This is a deliberate operator flow, not the default.

## Surface conflict logic

When a connected wallet clicks a Surface they don't qualify for:
- **Consumer**: always available (everyone has it)
- **Agent**: requires ≥1 AgentCard owned. If 0 cards → land on `/agents` (which already shows "Hire your first agent" CTA)
- **Merchant**: requires a registered merchant pubkey (i.e. owns a handle bound as merchant). If none → land on `/m/[handle]/manage?setup=1` showing a "Set up your merchant profile" wizard
- **Developer**: always available (it's docs + sandbox; no auth-gated state)
- **Operator**: requires `SETTLE_INTERNAL_API_KEY` cookie or env match. If not authorized → land on `/control-center` with a redacted view (cron + indexer health visible, mutation actions hidden)
- **Public**: always available (it's the walletless verifier + heatmap + feed)

Switching never crashes. Switching never auto-creates resources. Setup happens in an explicit wizard.

## Mobile budget (per page in WAVE_6_PAGE_SPECS.md)

- 390px (iPhone 14 Pro) is the minimum target — no horizontal scroll
- Bento grids collapse `span-2` → 1 col, `row-2` → flatten
- Sidebar replaced by bottom-tab (5 items) + drawer for the rest
- Topbar simplified: Logo + WalletButton only; surface switcher accessible via drawer
- Tap targets ≥ 44px (WCAG)
- Wallet adapter modal already mobile-friendly (existing)

## Accessibility budget

- **Contrast**: text on bg ≥ 4.5:1 (WCAG AA); large text ≥ 3:1. Tested with axe + manual color contrast on every page.
- **Keyboard**: every interactive reachable via Tab/Shift+Tab. Tab order matches visual order. Focus visible on every focusable element (no `outline: none` without replacement ring).
- **ARIA**: every non-semantic interactive (i.e. clickable div) gets `role` + `aria-label`. Every form input has a real `<label>` (visually hidden via class if needed, never display:none).
- **Screen reader**: hash-chain animation has off-screen text fallback. Sparklines have `role="img"` + descriptive `aria-label`. Dynamic content updates use `aria-live="polite"` where appropriate (e.g. send button state).
- **Reduced motion**: every animation respects `prefers-reduced-motion: reduce` (per WAVE_6_MOTION.md).
- **Color blindness**: never rely on color alone. ALLOW/DENY pills always include shape + text + dot color, not just color.
- **Test**: axe-core run on landing + dashboard + send + receipt detail. Goal = 0 critical/serious issues.

## Performance budget

| Page | LCP target (mobile, slow 4G) | JS bundle (gzipped) | Lighthouse mobile |
|---|---|---|---|
| `/` (landing) | ≤ 2.0s | ≤ 100KB | ≥ 90 perf, 100 a11y, 100 SEO |
| `/dashboard` | ≤ 2.5s | ≤ 200KB | ≥ 85 |
| `/send` | ≤ 2.0s | ≤ 180KB | ≥ 85 |
| `/receipts/[id]` | ≤ 2.5s | ≤ 180KB | ≥ 85 |
| Admin / operator pages | (not tested — internal only) | — | — |

Enforcement:
- `next/font` for self-hosted fonts (no external CSS request)
- `next/image` for any raster images (none expected — we're SVG/CSS only)
- Dynamic imports for heavy components (wallet modal, hash-chain animation, sparkline) so they don't bloat the initial bundle
- Lighthouse run via Playwright in CI on landing + dashboard

## Rollback plan

- Feature flag `NEXT_PUBLIC_REDESIGN=1` enables the new shell. Default during Wave 6.0–6.6 = false in main, true on a `redesign` git branch deployed to a separate Vercel preview.
- Each Wave 6.X commit lands behind the flag. Master branch keeps the existing UI fully functional.
- Wave 6.7 acceptance gate flips default to true on main + deletes the flag in the next commit.
- If post-flip a critical bug surfaces: revert the flag-flip commit (1-line revert), no other code changes needed. Old UI is restored. We'd then patch + re-flip.
- **Database migrations are not behind the flag.** `0050_waitlist` ships standalone, no rollback needed (additive only).

## Demo data policy (re-stated)

- **No fake numbers in production code.** Ever.
- The only "demo mode" is `?demo=1` query param on `/dashboard` that fetches the deployer wallet's data read-only. Anyone hitting that URL sees the same data; no special privilege.
- Marketing screenshots use `?demo=1` + the deployer wallet, OR a curated dev wallet we transact a few real receipts through.
- Stats strip on landing uses the **real network total** with a presentability gate. If too small to look impressive on launch day, the strip is hidden. Period.

## Logo policy

Going with **A** (component) by default per the master plan question — `packages/ui/src/logo.tsx` exporting `<Logo />` with `mark` / `wordmark` / `size` props. Same SVG also dumped to `apps/web/public/logo.svg` (for og:image, favicon source, brand-page download). Best of both: vector everywhere in code + a static asset for external refs.

If the user prefers a raster image asset (PNG), add it to `public/logo.png` after — but the source of truth stays the React component.
