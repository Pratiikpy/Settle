# Polish Audit — Settle

Single source of truth for ongoing repo polish. Updated each pass.

## Current focus
Pass 11 — pick next high-impact target. Candidates:
- Category C: bundle size analysis
- Category I: branding consistency (logo / palette unification)
- Category L: dedupe `solscanUrl` / `getSolscanUrl` (deferred)
- Category D: scan POST routes for missing input validation (zod)

## Deferred
- **Rate-limit middleware on /api/\* routes** — only 1 of 133 routes
  imports any rate-limiter (`lib/jupiter.ts`). Adding rate limiting
  needs a coherent strategy (per-IP, per-handle, per-route bucket).
  Plan: dedicated security pass — add `lib/rate-limit.ts` Upstash
  bucket helper, then progressively wrap public/auth-gated routes.
- **ESLint v9 flat-config migration** — `next lint` still works via
  `.eslintrc.json` (deprecated path), but Next 16 will require
  `eslint.config.js`. Defer until Next bump pass.
- **`next@15.0.2` → `next@15.5.15+`** — 29 vulns chained through next.
  Plan: isolated branch + full E2E + visual-regression before merge.

## Resolved
- ✓ OG image generation for /r/[id] (pass 10).

## Pass cadence (loop policy — 2026-05-04)
- 3 polish passes → 1 test pass.
- Polish passes do light-verify (lint + tsc + build + targeted spec).
- Test pass runs full Playwright (workers=4, all 572 specs).
- Risky changes always trigger a test pass right after.
- Polish passes since last full-E2E: 2 (passes 9 sitemap, 10 OG image).
- Items pending full-E2E verification: pass 9 sitemap entries, pass 10 OG image route.

## Deferred — needs review (risky to do without isolated verification)

- **Bump `next@15.0.2` → `next@15.5.15+`** — `pnpm audit` reports 29 vulns
  (3 low / 18 moderate / 6 high / 2 critical), most chained through next.
  The bump is ~5 minor versions; could change build/runtime behavior.
  Plan: run on isolated branch, full E2E (572) + visual-regression
  before merging.
- **Consolidate `solscanUrl()` (lib/format.ts) into `getSolscanUrl()`
  (lib/solana.ts)** — both build the same URL; ~9 files import the older
  one. Single-pass refactor risk: parameter signature differs (cluster
  arg vs env-driven). Plan: as a focused refactor pass with full E2E.
- **Update `bigint-buffer`, `rollup`, `serialize-javascript`, `esbuild`
  transitive vulns** — pnpm overrides needed; may break Anchor toolchain.

## Comprehensive polish categories (NEVER forget any of these when picking targets)

Each pass MUST consider every category before declaring "no more targets":

### A. UI / UX functionality
- Every button, link, form does what its label says
- No dead controls
- Mobile + tablet + desktop parity

### B. Data correctness
- Frontend reflects on-chain truth (no stale cache after action)
- Cross-user data propagation works (A acts → B sees it)
- No fake or placeholder numbers; hide rather than fake when low signal

### C. Performance
- LCP / CLS / FID measured (Lighthouse)
- Bundle size (analyze + tree-shake)
- API caching headers correct
- DB indexes audited
- Image optimization (next/image)
- Font loading strategy

### D. Error handling
- Every async path has try/catch with user-visible recovery
- No silent failures (silent-failure-hunter pattern)
- Network failure UI states
- 4xx/5xx friendly copy
- Wallet-disconnected UI states

### E. Responsiveness
- 390px / 768px / 1024px / 1440px hand-tested
- No horizontal scroll
- Touch targets ≥ 44px
- Viewport meta correct everywhere

### F. Copywriting / clarity
- Plain English throughout (no Pact / Capability / AgentCard in user-facing labels)
- Consistent voice
- Microcopy on errors, empty states, success
- No jargon in tooltips or help

### G. Security / safety basics
- `pnpm audit` clean
- gitleaks / secret-scan clean
- Dependency vuln scan (snyk / osv)
- CORS audit
- Rate-limit audit on API routes
- Auth boundary audit (every /api route enforces what it should)
- Input validation at API boundaries (zod)
- Webhook signature verification
- No PII in logs

### H. Final product feel
- Magic moment fires within 5s of landing
- Onboarding ends with celebration
- Trust badges visible
- Real Solscan links everywhere on-chain
- Smooth transitions, no flicker
- Skeleton loaders, not blank → content jumps

### I. Consistent design
- Single palette / type scale / spacing system
- Logo / branding unified
- Buttons / inputs / cards look identical across surfaces
- Dark mode consistency

### J. Smooth animation
- No janky transitions
- No motion that interferes with reading
- Respect `prefers-reduced-motion`
- 60fps on key flows

### K. No black screens / placeholders
- No "TODO" copy in production
- No `<Lorem ipsum>`
- No hardcoded fixtures shown to real users
- No half-finished routes in prod nav

### L. Code health
- Dead code removed (knip / ts-prune)
- Unused dependencies removed (depcheck)
- Duplicate utilities consolidated
- No commented-out code blocks
- No leftover `console.log`
- No `any` types where avoidable
- TypeScript strict mode
- ESLint zero-warning bar

### M. Observability
- Error tracking (Sentry) wired
- Structured logging
- Health endpoints
- Metrics dashboards

### N. Accessibility
- axe scan clean
- Keyboard nav works
- Focus rings visible
- ARIA where needed
- Color contrast ≥ 4.5:1

### O. Repo hygiene
- .gitignore tight
- Pre-commit hooks
- Conventional commit messages
- README freshness
- CHANGELOG present
- Branch protection / PR template

## Last verified state (2026-05-03)

## Last verified state (2026-05-03)
- E2E: **572/572 green** in 7.2m (Playwright workers=4, devnet)
- MCP: 8/8 protocol+behavior assertions
- SDK cross-language: 16/16 (TS+Py byte-equal, Rust 44 cargo tests)
- Build: clean (`pnpm exec next build` succeeds)

## Changes made this run

### Pass 1 — repo hygiene (.gitignore tightening)
- Added `test-results/`, `playwright-report/`, `.last-run.json` to root `.gitignore`
- `git rm --cached` removed the two tracked Playwright artifacts that snuck in
- **Verified:** `git ls-files | grep -iE "test-results|playwright-report"` returns empty
- **Risk:** none (pure ignore-list addition; no behavior change)

### Pass 2 — empty state copy (plain-English follow-up)
- `/cards` empty state: "No active Pacts yet" → "No active spending rules yet"
- Filter labels: "No closed Pacts" → "No closed spending rules"
- **Verified:** next build clean, tsc --noEmit clean, 25/25 targeted Playwright (rename audit + onboarding + nav-smoke) green
- **Risk:** none (UI copy only; internal types still use Pact)

### Pass 3 — plain-English rename: nested pages
- `/leaderboard`: `<th>Capability hash</th>` → `Service hash`
- `/leaderboard/[hash]`: "All capabilities" → "All services", "Capability leaderboard" → "Service leaderboard"
- `/receipts/[id]/print`: receipt-print label "Pact" → "Spending rule"
- **Verified:** next build clean, tsc --noEmit clean, 46/46 targeted Playwright (rename + nav-smoke + misc-routes) green
- **Risk:** none (UI copy only)

### Pass 10 — final product feel (category H): dynamic OG image for /r/[id]
Files changed:
- `app/r/[id]/opengraph-image.tsx` — NEW. Edge runtime ImageResponse generator. Renders 1200×630 PNG with: `SETTLE · ON SOLANA` wordmark, decision badge (`VERIFIED ✓` green / `BLOCKED ✗` red), `$amount USDC` (180px black), `#receiptId` (mono), `Verifiable money on Solana. settle.xyz` footer. Falls back to a generic "Cryptographic receipt" card if id is malformed or fetch fails.

Why this matters:
- The receipt poster page already had `og:title` / `og:description` / `twitter:card`, but no `og:image`. Twitter/X falls back to a tiny summary card which doesn't sell the product.
- Now any shared `/r/[id]` URL renders as a beautiful poster preview on Twitter, Slack, iMessage, Discord. Every receipt becomes a marketing asset.

Verified manually:
- `pnpm exec next build` clean — `/r/[id]/opengraph-image` listed in route manifest.
- `curl /r/<real id>/opengraph-image` returns `200 OK` with `Content-Type: image/png`, 28634 bytes.
- Receipt page now exposes `<meta property="og:image" content="…/opengraph-image?…">` (auto-wired by Next.js).
- Targeted Playwright `section-23g-poster-watch.spec.ts`: 10/10 green.

Known minor: Satori warns about dynamic font for `✓`/`✗` glyphs (falls back gracefully, image renders correctly).

Risk: low. New route, no edits to existing pages. Edge runtime requirement is standard for `next/og`.

Pending full-E2E (next test pass): poster page should still pass §23g specs (already targeted-verified above; full E2E will confirm no other surface breaks).

### Pass 9 — SEO + discoverability: sitemap.ts adds new public surfaces
Files changed:
- `app/sitemap.ts`: added 7 routes to staticRoutes — `/watch`, `/start`, `/start/consumer`, `/start/merchant`, `/start/agent`, `/leaderboard`, `/verify`. These were missing despite being public marketing surfaces; search engines couldn't discover them via the sitemap.

Audited (no change this pass):
- ESLint v9 CLI: requires flat config. But `next lint` works via `.eslintrc.json` and reports zero warnings on app/ + components/.
- /r/[id] OG metadata: `og:title` / `og:description` / `twitter:card` all render correctly. But no `og:image` is set — logged as deferred (needs dynamic OG image route).
- API rate-limiting: 1/133 routes covered. Logged as deferred (architectural pass needed).
- TODO/FIXME in user-visible UI: only 1 `TODO Wave 6.5` in a comment (not user-facing).

Light verify:
- `pnpm exec next build` clean.
- `pnpm exec tsc --noEmit` clean.
- `pnpm exec next lint` zero warnings/errors.
- `curl /sitemap.xml | grep` confirmed all 7 new routes appear.

Risk: very low (data-only addition to a metadata route).

Pending full-E2E (next test pass): sitemap visual unaffected; nothing critical to verify.

### Pass 8 — TEST PASS: full E2E reconciliation of passes 5-7
- Ran full Playwright suite (workers=4, all 572 specs).
- Items previously pending: pass 6 reduced-motion CSS, pass 7 :focus-visible CSS.
- **Result: 572/572 green in 6.9m.** No regressions introduced by passes 6 or 7.
- Marked both pending items as fully verified.

### Pass 7 — accessibility (category N): keyboard focus rings
Files changed:
- `app/globals.css`: added 3 `:focus-visible` rule blocks.
  1. `html.light input/textarea/select.bg-transparent:focus-visible` — was missing focus indicator entirely; now renders a 2px solid w6-ink outline with 1px offset on keyboard nav.
  2. `.w6-input:focus-visible` — added sharper outline supplementing the existing soft box-shadow that was hard to see for keyboard users.
  3. Global rule for `.w6-btn`, `<button>`, `<a>`, `[role="button"]`, `[tabindex="0"]`: 2px solid currentColor outline with 2px offset, border-radius inherited. Only fires on `:focus-visible` so mouse clicks stay clean.

Why this matters:
- WCAG 2.4.7 (Focus Visible) requirement.
- Keyboard-only users (and screen-reader users on Mac VoiceOver) had no way to see where they were in many flows.

Light verify:
- `pnpm exec next build` — clean.
- `pnpm exec tsc --noEmit` — clean.
- Targeted Playwright (50 specs covering nav-smoke + w6-cascade + visual-regression) — 50/50 green. Visual regression confirms `:focus-visible` does NOT affect mouse-driven snapshots (rings only paint on keyboard focus).

Risk: very low. `:focus-visible` is a CSS-level change scoped to keyboard interactions. Fallback: even if outdated browsers don't support it, the input box-shadow + focus border-color from existing rules still apply.

Pending full-E2E (next test pass): visual regression baselines should remain stable.

### Pass 6 — multi-category: /help rename + reduced-motion accessibility
Files changed:
- `app/help/page.tsx`: Q&A "What is a Pact card?" → "What is a spending rule?" with body rewritten ("A spending rule is a child of your main agent budget…"). Q&A "Can the agent steal my money?" body: `Pact's cap` → `rule's cap`, `revoke a card` → `revoke a budget`.
- `components/magic-moment-terminal.tsx`: respects `prefers-reduced-motion: reduce` — when set, instantly shows all lines and skips the 1100ms interval rotation. CSS rule also disables blink animation. Uses `window.matchMedia` SSR-safe guard.

Audited but skipped (precision matters for engineers):
- `/admin/cron`, `/control-center`: technical descriptions referencing Anchor instructions — kept jargon for accuracy.
- README.md: engineering doc — Pact/Capability are real type names — kept.

Audited but found nothing to fix:
- Empty try/catch blocks (silent failures): none in app/.
- Commented-out code blocks: none — all `//` lines are real comments.
- 404/500/global-error pages: already polished with W6 palette + CTAs.
- PWA icons + manifest + apple-icon: present.

**Verified:** next build clean, tsc --noEmit clean, 26/26 targeted Playwright (magic-moment, rename audit, nav-smoke) green.

**Pending full-E2E (next test pass):** reduced-motion behavior in magic moment — visual regression should still pass.

### Pass 5 — plain-English rename: agent flows + cards + groups
Files changed:
- `app/agents/new/page.tsx`: toast `"Pact spawned. Watch the agent work."` → `"Spending rule active. Watch the agent work."`; description `Pact:` → `Rule:`; gesture states `"Opening Pact on Solana…"` → `"Opening spending rule on Solana…"`, `"Pact open ✓"` → `"Spending rule open ✓"`, `"Spawn Pact card"` → `"Open spending rule"`; PactCard preview `label="Pact · Research"` → `"Rule · Research"`.
- `app/agents/templates/[slug]/hire-button.tsx`: toast `"Pact spawned."` → `"Spending rule active."`; gesture `"Opening Pact…"` → `"Opening spending rule…"`, `"Pact open ✓"` → `"Spending rule open ✓"`, `"Hire — sign Pact"` → `"Hire — sign rule"`.
- `app/cards/new/page.tsx`: subtitle "creating a NEW AgentCard…" → "creating a new agent budget…"; submit `"Create AgentCard"` → `"Create agent budget"`.
- `app/cards/[id]/page.tsx`: revoke toast `"Pact closed. Refund queued."` → `"Spending rule closed. Refund queued."`; `"Card revoked atomically."` → `"Agent budget revoked atomically."`; `<PactCard label="Pact" …>` → `label="Spending rule"`.
- `app/groups/page.tsx`: button states `"Spawning Pact…"` → `"Opening spending rule…"`, `"Create request + spawn Pact"` → `"Create request + spending rule"`.
- `e2e/section-23a-real-onchain.spec.ts`: regex now accepts both old and new CTA labels (`/Create (AgentCard|agent budget)/i`).

**Verified:** next build clean, tsc --noEmit clean, **full Playwright 572/572 green in 7.2m** (this counts as the test pass for pass 5).

**Risk mitigated:** spec stale on rename → fixed in same pass.

### Pass 4 — empty-state audit + security inventory
- Audited /ledger, /feed, /agents, /allowances, /groups, /spending —
  all already have functional empty states with CTAs. No change needed.
- Ran `pnpm audit` — 29 vulns surfaced; 6 high + 2 critical. Logged
  upgrade plan as deferred (next bump is single biggest gain).
- Found duplicate `solscanUrl` (format.ts) vs `getSolscanUrl` (solana.ts);
  logged consolidation as deferred refactor pass.
- **Verified:** existing empty states checked manually + via Playwright.
- **Risk:** none (audit only, no code change this pass).
- **No commit needed beyond polish.md update for this pass.**

## Audited but not changed (low-impact / risky)
- **`console.warn` in API routes** — all are intentional non-fatal-error logging with `[tag]` prefixes. Removing would lose ops signal. **Keep.**
- **`console.log` in `app/docs/*` and `components/receipt-timeline.tsx`** — inside `<code>` blocks as developer documentation examples. Not real calls. **Keep.**
- **`any` types (3 occurrences):**
  - `app/api/bookkeeper/categorize/route.ts:146` — Supabase query builder, hard to type.
  - `app/api/fraud/scan/route.ts:148` — false positive (the word "any" inside a comment).
  - `app/providers.tsx:30` — wallet adapter array; adapters from different packages have conflicting type defs.
  - All deliberate trade-offs. **Keep.**

## Remaining polish targets (sorted by ROI)

### High impact
1. Empty states on key authed pages (`/dashboard`, `/cards`, `/wishes`, `/allowances`, `/groups`, `/spending`, `/agents`, `/ledger`, `/feed`)
2. Loading skeletons + success/error toasts (audit + standardise)
3. 404 / 500 page design (currently default Next pages)
4. OG image render for `/r/[id]` (metadata set but no actual image generated)
5. Onboarding "first receipt" celebration moment in /start/* flows
6. Plain-English deeper rename pass (Pact / Capability still appear in nested pages)

### Medium impact
7. Trust badge component on **consumer** profiles (only merchant pages have it now)
8. Branding system unification (logo / palette / typography drift across surfaces)
9. /docs site consolidation
10. Mobile UX hand-test (viewport tests pass; real-thumb test pending)
11. A11y audit (keyboard nav, focus rings, axe scan)
12. Receipt download / print export option

### Code health
13. Add `knip` and `ts-prune` to dev deps for unused-export auditing
14. Bundle size analysis + tree-shake heavy deps
15. Env var validation at build (zod schema)
16. `pnpm audit` security fixes

## Next target
Pass 2 — empty states. Audit `/dashboard`, `/cards`, `/ledger`, `/feed`, `/agents` for what a brand-new user with $0 balance and no history sees. Add useful empty states where currently blank or non-obvious.
