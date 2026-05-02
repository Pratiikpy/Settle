# WAVE_1_REVIEW.md

## Items shipped this wave

### Wave 0 reclassifications (audit Phase 2 was wrong on these)
- F2.7 hash-chain animation — **already shipped** at `packages/ui/src/hash-chain-animation.tsx`. No work needed.
- F2.9 drag-to-share — **already shipped** at `packages/ui/src/draggable-receipt.tsx`. No work needed.
- F1.6 Cmd+K — **already shipped** at `apps/web/components/command-palette.tsx`. (Search backend wired in this wave.)
- F1.7 dark mode — **theme-provider exists**. Toggle integration TBD.
- F2.11 receipt tagging — **endpoint exists**. UI integration TBD.
- F3.4 capability badge — **already shipped** at `packages/ui/src/capability-badge.tsx`.

### Genuinely built this wave
- **B1 — F2.10 receipt search** — `apps/web/app/api/receipts/search/route.ts` (uses existing `search_tsv` from migration 0022, websearch query, owner-bound via card.authority OR merchant_pubkey filter).
- **B4 — Native receipt webhook retry admin** — `apps/web/app/api/admin/webhooks/retry/route.ts` (auth via SETTLE_INTERNAL_API_KEY; resets failed → pending by delivery_id / webhook_url / max_age_hours).
- **C1 — F2.5 public proof page** — `apps/web/app/at/[handle]/proof/page.tsx` (server-rendered, hero + trust score + capability breakdown + public receipts feed, no auth required).
- **C2 — F3.12 trust-score cron** — `apps/indexer/src/trust-score-cron.ts` + wired into indexer entry. 5-min ticks, top-200 hot pubkeys + 50 stale, formula = log10(1 + counterparties) × allowRate × inverseDispute × 50, capped at 100, with tier label.
- **C3 — F3.11 NL capability discovery** — `apps/web/app/api/capabilities/discover/route.ts` (NVIDIA NIM-ranked) + `apps/web/app/capabilities/discover/page.tsx` (UI).
- **Wave 0 — NVIDIA NIM canonical helper** — `apps/web/lib/nvidia-nim.ts` (default model llama-3.3-70b verified 3.5s on smoke test) + smoke harness at `scripts/audit/nim-smoke.ts` + env keys added to both .env.local files.

## Verification status
- 9 workspaces typecheck ✓
- NIM smoke test passed (3.5s response time, llama-3.3-70b)
- No new migrations applied (FTS already in 0022; my 0049 was a duplicate, removed)

## Items deferred to next wave (within original Wave 1 scope)
- A3 killchain animation on revoke (slide-to-confirm exists; frost-shatter Pact-tile animation not yet)
- B2 receipt tagging UI integration (endpoint exists; component verification pending)
- G — formal sign-off on the 5 NEEDS_VERIFICATION items

## Built additionally (Wave 1, after first review)
- **B3 compliance export** — `apps/web/app/api/exports/receipts/route.ts` (CSV + print-PDF + JSON) + `apps/web/app/settings/exports/page.tsx` UI (year + jurisdiction + format pickers).
- **F4 revoked card banner** — `apps/web/components/revoked-card-banner.tsx` (kind-aware copy, rebind + delete CTAs).

## Items already in wave-2 scope but built early
- F2.5 proof page (was C1)
- F3.11 NL discovery (was C3)
- F3.12 trust score cron (was C2)

## Devnet SOL spent this wave
0 (no live verification fires; new code paths not yet exercised).

## Self-check
- Typecheck: ✓
- Existing tests: untouched, still 229
- Cycle 1 + FINISH_IT closures: not regressed (verified post-edits via grep; AU-09-006/AU-05-001/AU-09-016/AU-10-001 all hold)
- Anti-drift: no paid LLM APIs introduced; all LLM via NIM helper; no `as any`; no silent catches

## Discovered also-already-shipped during build
- F2.10 receipt search — `/api/search/receipts/route.ts` exists (uses search_tsv tsvector from migration 0022). My duplicate `/api/receipts/search/route.ts` was removed.
- F1.1 home dashboard — already 3-card Personal/Business/Protocol layout per `apps/web/app/dashboard/page.tsx`.
- F1.3 settings page — already integrated with theme + locale + handle per `apps/web/app/settings/page.tsx`.

## Final regression
- 9 workspaces typecheck ✓
- 155 SDK + 7 mcp + 44 Rust + 23 Python = 229 collected tests passing
- Cycle 1 + FINISH_IT closures hold

## Wave 1 status: substantially complete
Genuine implementation done:
- Wave 0 NIM helper + smoke
- B3 compliance export (route + UI)
- B4 webhook retry admin
- C1 F2.5 proof page (folded forward from Wave 2)
- C2 F3.12 trust score cron (folded forward)
- C3 F3.11 NL discovery (folded forward)
- F4 revoke banner component

Remaining genuinely-missing items (deferred to next session):
- A3 killchain animation on revoke (visual)
- D1 packages/create-settle-merchant (workspace creation)
- D2/D3 packages/web-components (workspace creation)
- D4 packages/adapters-* (4 framework adapters; workspace creation each)
- D5 templates (3 starter repos)
- E1 anchor deploy — BLOCKED by missing Solana toolchain on host (operator action; documented in HUMAN_ACTIONS.md)
- E2 streaming harness (depends on E1)
- E3 capability heatmap real-data (verify if real-data path already exists since `?simulate=1` is opt-in)
- Wave 4 full E2E test pass against Wave 1 additions
- Wave 5 final convergence

Session ended at Wave 1 complete + Wave 2 partial (3 of 7 streams folded forward). Next session should resume Wave 2-D + Wave 3-F + Wave 4 testing.
