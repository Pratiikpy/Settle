# Polish Audit — Settle

Single source of truth for ongoing repo polish. Updated each pass.

## Current focus
Pass 4 — start UI empty-state + loading-state audit on authed surfaces.

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
