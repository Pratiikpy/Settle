# Polish Audit — Settle

Single source of truth for ongoing repo polish. Updated each pass.

## Current focus
Pass 18 — next polish target. Categories under-touched:
- Category I: palette consistency (deferred — risky for visual snapshots)
- Category C: code-split heaviest pages (/activity 323KB)
- Category B: cross-user real-time freshness audit
- Category G: more security headers (CSP — deferred for now)

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
- ✓ Dedupe `solscanUrl` (pass 11) — turned out to be 0 callers, pure dead code.

## Pass cadence (loop policy — 2026-05-04)
- 3 polish passes → 1 test pass.
- Polish passes do light-verify (lint + tsc + build + targeted spec).
- Test pass runs full Playwright (workers=4, all 572 specs).
- Risky changes always trigger a test pass right after.
- Polish passes since last full-E2E: 1 (pass 17 security headers).
- Items pending full-E2E verification: HSTS + COOP headers (low risk — additive only).

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

### Pass 17 — security (category G): HSTS + COOP headers
Files changed:
- `apps/web/next.config.mjs` — added 2 headers to the global `headers()` config:
  1. `Strict-Transport-Security: max-age=31536000; includeSubDomains` — 1-year HTTPS enforcement, no `preload` (avoids preload-list commitment), `includeSubDomains` is safe since Vercel serves all subdomains over HTTPS by default. No effect on localhost per HSTS spec.
  2. `Cross-Origin-Opener-Policy: same-origin-allow-popups` — isolates browsing context group while still allowing `window.open` for Phantom/Solflare wallet popups and Solscan tx links (used by magic-moment-terminal, watch demo, receipt poster).
- `e2e/section-52-security-headers.spec.ts` — extended assertions:
  - `/` page must include HSTS with `max-age=\d{6,}` and `includeSubDomains`.
  - `/` page must include COOP `same-origin-allow-popups`.
  - `/dashboard` must also carry HSTS.

Audited but skipped (risky / out of scope this pass):
- CSP (Content-Security-Policy): high signal but very risky — wallet adapters need WebSocket connections to many Helius/Solana endpoints, Phantom popups, Sentry, Supabase. CSP without testing breaks the app. Defer to focused security pass.

Why this matters:
- HSTS prevents downgrade attacks: even if a user types `http://settle.so`, the browser refuses and goes HTTPS.
- COOP shores up cross-origin isolation; without it, a malicious popup could potentially access this window's globals on some browsers.
- Existing 4 headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) were already in place.

Light verify:
- `pnpm exec next build` clean.
- `pnpm exec tsc --noEmit` clean.
- `pnpm exec next lint` zero warnings.
- `curl -I /` returned both new headers correctly.
- `pnpm exec playwright test section-52-security-headers`: 2/2 green.

Risk: very low (additive HTTP headers; no behavior change to app code).

Pending full-E2E (next test pass): no expected impact. Wallet popups still work because COOP is `same-origin-allow-popups`, not the stricter `same-origin`.

### Pass 16 — TEST PASS: full E2E reconciliation of passes 13-15
- Items previously pending: orphan-dep removal (p13), README docs change (p14), `app/loading.tsx` reduced-motion CSS (p14), `/api/balance` warn logs (p15).
- Ran `pnpm exec playwright test --reporter=line --workers=4` — full suite of 572 specs.
- **Result: 572/572 green in 7.0m.** No regressions from any of the three preceding polish passes.
- All previously pending items now fully verified.

### Pass 15 — error handling (category D + M): unsilenced silent failures in /api/balance
Files changed:
- `apps/web/app/api/balance/route.ts`: two `catch {}` blocks (SOL fetch failure + USDC fetch failure) had been swallowing errors. Now both call `console.warn` with `[balance]` tag prefix matching the convention used elsewhere (`[x402-proxy]`, `[attachments]`, `[airdrop]`). Output includes truncated pubkey + error message — enough for ops to triage RPC issues without leaking full keys.

Why this matters:
- /api/balance is one of the highest-traffic endpoints (every dashboard render). Silent RPC failures previously left ops with no signal that Helius/devnet was misbehaving.
- Behavior unchanged: still soft-fails to empty/zero balances on error so the UI shows "—" placeholders. Only added logging.
- `silent-failure-hunter` pattern: this is the exact class of issue that pattern targets.

Audited but not changed:
- Pubkey validation in /api/balance is correct (regex + PublicKey constructor).
- Cache headers (10s s-maxage) appropriate.
- /api/landing/feed has no silent catches.
- Hardcoded 'example.com' in `/m/[handle]/*` pages are input placeholders/hint text — legit.

Light verify:
- `pnpm exec next build` clean.
- `pnpm exec tsc --noEmit` clean.
- `pnpm exec next lint` zero warnings.
- `curl /api/balance?pubkey=<ALICE>` → real values: 7.42 USDC + 0.08 SOL.
- `curl /api/balance?pubkey=not-a-pubkey` → 400.
- Playwright `section-23a-real-ui-tx`: 12/12 green (real on-chain tx flow + balance reads).

Risk: very low (additive logging, no behavior change).

Pending full-E2E (test pass next): no rendering impact expected.

### Pass 14 — multi-category: README freshness + loading skeleton a11y
Files changed:
- `README.md`: added a "Public surfaces" section right under the elevator pitch listing the marketing routes shipped this session: `/`, `/watch`, `/start`, `/r/<id>`, `/m/<handle>`, `/leaderboard`. Anyone scanning the repo now sees the real public surface area.
- `apps/web/app/loading.tsx`: global `<style>` block extended with `@media (prefers-reduced-motion: reduce) { [aria-hidden="true"] { animation: none !important; } }`. The spinner stops animating for users who prefer reduced motion (matching the same a11y policy applied in pass 6 to magic-moment-terminal). Static spinner glyph still visible — just doesn't rotate.

Audited but not changed (deferred — risky):
- Hardcoded `#fff` color literals across app/ pages — many uses are intentional contrast on dark CTA buttons. Replacing with `var(--w6-bg-1)` could regress visual snapshots. Defer to focused branding pass with full visual-regression.
- API caching headers on `/api/balance` (10s s-maxage) and `/api/landing/feed` (30s s-maxage) — both already correctly tuned for freshness.
- Bundle sizes: heaviest /activity 323KB, /allowances 297KB, /agents/new 278KB. None alarming. Code-split candidate for a future perf pass.

Light verify:
- `pnpm exec next build` clean.
- `pnpm exec tsc --noEmit` clean.
- `pnpm exec next lint` zero warnings.
- Targeted Playwright (nav-smoke 14 specs) green.

Risk: very low (1 docs change + 1 CSS media-query addition).

Pending full-E2E (next test pass): no rendering impact expected.

### Pass 13 — code health (category L): remove 2 orphan dependencies
Files changed:
- `apps/web/package.json`: removed two top-level deps with **zero references** anywhere in the source tree (verified via repo-wide grep on .ts/.tsx/.json):
  1. `lucide-react@^0.456.0` — icon library, no `lucide-react` import in any source file. (Note: a transitive `lucide-react@0.383.0` still exists in node_modules pulled by @walletconnect → @reown/appkit; that's not removable here.)
  2. `@metaplex-foundation/digital-asset-standard-api@^1.0.4` — no source imports; mpl-bubblegum (still kept) is what we actually use.
- `pnpm install` ran cleanly to update lockfile.

Audited but kept (deeper scan justified retaining):
- `@noble/ciphers` — used by `packages/sdk/src/sealed-box.ts`. Both apps/web and packages/sdk declare it; redundancy is intentional for workspace hoisting predictability. Keep both.
- `@bonfida/spl-name-service` — used in `app/api/resolve/route.ts`.
- `@solana/kit` — used in `lib/lighthouse.ts` and `lib/solana.ts`.
- `react-dom` — implicitly required by Next/React; no explicit import needed.

Why this matters:
- Smaller dependency surface → faster `pnpm install`, smaller node_modules, less attack surface.
- These two specifically pulled additional transitive trees that bloated the lockfile.

Light verify:
- `pnpm install` clean (only pre-existing peer warnings, none introduced).
- `pnpm exec next build` clean.
- `pnpm exec tsc --noEmit` clean.
- `pnpm exec next lint` zero warnings.
- Targeted Playwright (nav-smoke + e2e-loop + poster-watch): 48/48 green incl. real on-chain ALICE→BOB QR-pay 12.04 → 12.042 USDC.

Risk: very low (zero source imports verified before removal).

Pending full-E2E (next test pass): nothing render-affecting.

### Pass 12 — TEST PASS: full E2E reconciliation of passes 9-11
- Items previously pending: sitemap entries (p9), OG image route (p10), format.ts dead-code delete (p11).
- Ran `pnpm exec playwright test --reporter=line --workers=4` — full suite.
- **Result: 572/572 green in 6.9m.** No regressions from passes 9-11.
- All previously pending items now fully verified.

### Pass 11 — code health (category L): delete 3 dead exports from lib/format.ts
Files changed:
- `apps/web/lib/format.ts`: removed three exports with zero callers anywhere in the repo:
  1. `solscanUrl(sig, cluster?)` — duplicate of `lib/solana.ts#getSolscanUrl`. Repo-wide grep returned 0 importers.
  2. `truncateAddress(addr, chars=4)` — never imported.
  3. `formatLatencyMs(ms)` — never imported.

Audit method:
- `Grep` (repo-wide, all .ts/.tsx) for each function name → only match was the definition in `lib/format.ts` itself.
- 0 callers in app/, components/, lib/, packages/, scripts/, e2e/, programs/.

Why this matters:
- Reduces dead-code surface area. `format.ts` is now a 3-export module (`lamportsToUsdc`, `timeAgo`) — both with real callers (14 and 8 respectively).
- Closes the previously-deferred "dedup solscanUrl" item — turned out the duplicate had zero callers, so dedup = pure delete.

Light verify:
- `pnpm exec next build` clean.
- `pnpm exec tsc --noEmit` clean.
- `pnpm exec next lint` zero warnings.
- Targeted Playwright (nav-smoke + section-23a-end-to-end-loop): 38/38 green, including the real on-chain ALICE→BOB QR-pay proof (11.993 → 11.995 USDC).

Risk: very low (delete-only, all callers verified absent).

Pending full-E2E (next test pass): no expected impact on rendering or behavior.

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
