# TEST_PLAN.md

Derived from FEATURE_TRACEABILITY_MATRIX.md + INTEGRATION_GRAPH.md + FINDINGS.md.

## T0 — Inventory (this file)

## T1 — Static + parity (cheap, fast)
- pnpm -r typecheck
- pnpm --filter @settle/sdk test (vitest)
- pnpm --filter @settle/mcp-middleware test (vitest)
- cargo test in packages/rust-sdk
- pytest in packages/python-sdk
- pnpm tsx scripts/smoke-multikind-goldens.ts
- pnpm tsx scripts/smoke-ix-data-parity.ts
- pnpm tsx scripts/check-idl-drift.ts

Pass criterion: all green, byte-identical hashes across 3 langs.

## T2 — On-chain integration
- e2e-payment-flow.ts (sequential card → pact → spend)
- phase5-live-test.ts (single scheduled_send)
- phase5-live-all-intents.ts (6 of 7 intents end-to-end live)
- phase5-idempotency-drill.ts (replay-no-double-spend)

Pass criterion: all sigs confirmed on devnet, indexer mirror writes happen, vault deltas correct.

## T3 — Playwright UI suite (existing 20 + new)

Existing (already passing):
- wallet-connect.spec.ts (2)
- nav-smoke.spec.ts (12 Phase 5 surfaces)
- mobile-viewport.spec.ts (5)
- sign-tx-wiring.spec.ts (1)

New tests required:
- T3-A — `/cards/new` form interaction (fill → click → wallet popup invoked)
- T3-B — `/wishes` create scheduled send → row visible
- T3-C — `/allowances` create allowance flow
- T3-D — `/groups` create request → vote → quorum visible
- T3-E — `/spending` auto-refill rule create

## T4 — Visual regression
- Screenshot every Phase 5 surface at 1280×800, 768×1024, 390×844
- Connected (burner) + disconnected
- Save under apps/web/e2e/__screenshots__/ as baseline

## T5 — Failure mode injection
- T5-A — wallet disconnect mid-sign
- T5-B — insufficient SOL (page.route mock)
- T5-C — revoked card path
- T5-D — closed pact path
- T5-E — network failure (route.abort)
- T5-F — slow network (5s delay)
- T5-G — indexer lag (set last receipt 1h old)

## T6 — Race conditions
- T6-A — concurrent scheduled_send fires (5 contexts)
- T6-B — tick + signer interleaved
- T6-C — same wallet attempting create_card with same label

## T7 — Accessibility
- @axe-core/playwright on every Phase 5 surface

## T8 — Performance budget
- LCP < 2.5s on every Phase 5 surface
- JS bundle < 1.5MB

## T9 — Multi-language SDK consumer
- Already exercised by smoke-multikind-goldens.ts + smoke-ix-data-parity.ts (both Cycle 1 checks)

## T10 — MCP middleware E2E
- Existing 7 tests cover envelope + params placement

## T11 — Final E2E orchestration
- Single Playwright test walking entire happy path

## T12 — TEST_REPORT.md output
