# AUDIT_PROGRESS.md

Tracks per-phase progress across all cycles.

---

## Cycle 1 — start 2026-05-02

### Phase 0 — Inventory + plan refinement — ✅ COMPLETE

Outputs:
- `docs/audit/SYSTEM_MAP.md` (workspaces, instructions, events, migrations, routes, scripts, doc surface, recent commits)
- `docs/audit/AUDIT_PLAN.md` (refined from brief)
- `docs/audit/FINDINGS.md` (4 initial findings)

Key facts established:
- 15 Anchor instructions (DOC_DRIFT — claimed 13/14)
- 13 Anchor events (DOC_DRIFT — claimed 14)
- 45 migrations (matches claim ✓)
- 124 API routes
- 66 UI routes (31 not in PROJECT_STATUS)
- 41 scripts in scripts/
- 9 workspaces (8 TS + 1 Python via pyproject + 1 Rust via Cargo)
- Recent fix `17ddb08` confirms doc-vs-runtime drift exists historically

Self-check:
1. Read actual files? ✓
2. Line-numbered evidence? ✓ (counts cited with grep commands)
3. Verification commands cited? ✓ (greps run)
4. Contradicts prior phase? N/A (first phase)
5. Distinguished CODE_EXISTS / WIRED / LIVE_VERIFIED / UX_REACHABLE? Phase 0 is enumeration; finer states deferred to Phase 2+
6. WebFetch for Phase 9? N/A (not phase 9 yet)
7. Padded HUMAN_ACTIONS? N/A (not yet created)
8. Missed related files? Some (need to enumerate per-instruction account files in Phase 3)
9. Defensible? ✓ for Phase 0 scope

### Phase 1 — Doc conformance audit — ⏳ IN PROGRESS

Started 2026-05-02. Verifying every concrete claim in PROJECT_STATUS / README / SECURITY / MAINNET_MIGRATION.

### Phase 7 — Indexer + federation correctness — ✅ COMPLETE

Run 2026-05-02. Output: `docs/audit/INDEXER_AUDIT.md`.

Scope covered:
- All 13 Anchor events: subscription presence, handler correctness, DB-write presence, schema match, idempotency
- Round-up enqueue path (PactSpendEvent → round_up_queue)
- Phase 5 attribution (ReceiptRecordedEvent.context_hash → phase5_executions.signature/status)
- Federation poller (verified federated_receipts → webhook fanout)
- IDL-drift coverage gap (5 of 13 events covered by `scripts/check-idl-drift.ts`)
- Cross-checked migrations 0001, 0011, 0019, 0030, 0031, 0040 for column-type matches

Findings appended to FINDINGS.md:
- AU-07-001 HIGH — no durable cursor / replay-on-restart
- AU-07-002 HIGH — duplicate-row risk on `policy_decisions` + `round_up_queue` (round-up = double-spend)
- AU-07-003 MEDIUM — federation poller webhook URL ignores `verified_merchants` self-serve table
- AU-07-004 MEDIUM — IDL-drift script covers only 5 of 13 event sizes
- AU-07-005 LOW — `kernel_receipt_attestations` PK collides on multi-event txs
- AU-07-006 LOW — `CardCreatedEvent.allowlist_count` parsed but discarded

Resolved from prior phases:
- AU-00-004 — confirmed `PactStreamPauseEvent` is dual-purpose (pause+resume); reclassified as DOC_DRIFT/LOW.

Self-check:
1. Read every handler? ✓ (`index.ts` 1-929, `federation-poller.ts`, `webhook-worker.ts` end-to-end)
2. Line-numbered evidence? ✓
3. Hand-summed event sizes vs `events.rs` for all 13? ✓
4. Cross-checked `scripts/audit-indexer-handlers.ts` and `scripts/check-idl-drift.ts`? ✓
5. Cross-referenced migrations? ✓
6. Distinguished CODE_EXISTS / WIRED / LIVE_VERIFIED? Handlers CODE_EXISTS+WIRED; LIVE_VERIFIED deferred to Phase 14 devnet replay.
7. Defensible in security review? ✓

### Phase 2 — Feature traceability matrix — ✅ COMPLETE

Output: `docs/audit/FEATURE_TRACEABILITY_MATRIX.md`.

Coverage: 80 distinct feature rows across the 4 source documents:
- All 25 PRODUCT_SPEC v0.3 features (F1–F25)
- All 13 P-tier primitives (P1–P13)
- All 25 STRATEGY F1.x–F5.x features (F1.1–F1.7, F2.0–F2.12, F3.1–F3.12, F4.1–F4.6, F5.1–F5.12)
- All 7 Phase-5 cron intents
- 10 federation / indexer / cron components

Status distribution: 38 SHIPPED · 17 PARTIAL · 10 MISSING · 1 MAINNET_ONLY · 1 FUNDED_FUTURE · 1 SIMULATED · 6 NEEDS_VERIFICATION.

11 new findings appended to FINDINGS.md (AU-02-001 .. AU-02-011): all DOC_DRIFT / MISSING / NEEDS_VERIFICATION (no BLOCKER / HIGH from this phase — those concentrate in Phase 5/7).

Top 5 surprises:
1. F2.0 Universal Receipt Kernel marked PLANNED in STRATEGY but already shipped end-to-end with 35 byte-locked goldens in 3 SDKs (AU-02-001).
2. F2.5 public proof page `/at/<handle>/proof` simply doesn't exist (AU-02-002).
3. F4.1 `npx create-settle-merchant` is a local script, not a published initialiser (AU-02-008).
4. F5.8 LLM-framework adapters (LangChain / OpenAI / Anthropic / CrewAI) — entirely absent (AU-02-010).
5. F23 capability heatmap shipped with `?simulate=1` synthetic-receipts mode for empty-cluster demos — neat, but the matrix flags this as both SHIPPED and SIMULATED.

Self-check:
1. Read actual files? ✓ (`apps/web/lib/anchor-client.ts`, `packages/sdk/src/index.ts`, every migration filename, every API + UI route directory, programs/.../instructions/, `apps/indexer/src/`)
2. Line-numbered evidence? ✓ for source-of-claim cites
3. Verification commands cited? ✓ (`ls`, file reads — directory listings included in matrix)
4. Contradicts prior phase? No; consistent with AU-00-001/002/003/004
5. Distinguished CODE_EXISTS / WIRED / LIVE_VERIFIED / UX_REACHABLE? Coarser SHIPPED/PARTIAL applied; finer 4-state model deferred to Phase 8
6. WebFetch for Phase 9? N/A
7. Padded HUMAN_ACTIONS? N/A
8. Missed related files? STRATEGY F6.x–F35.x not exhaustively traced (deferred — most are PLANNED/FUNDED_FUTURE per STRATEGY tags themselves; spot-checks done for F29.x AI features which are SHIPPED skeletons)
9. Defensible? ✓ for the 80 rows produced; NEEDS_VERIFICATION flags acknowledge files not deeply checked in this pass

### Phases 3, 4, 6, 8–15 — pending


### Phase 1 — Doc conformance audit — ✅ COMPLETE (foreground)

Output appended to `FINDINGS.md`. Findings AU-01-001 through AU-01-008.

Key verified claims:
- 45 migrations: ✓
- 155 SDK vitest tests: ✓
- 7 mcp-middleware tests: ✓
- 42 Rust tests: ✓
- 19 Python ix-data tests: ✓
- "35 Python kernel" claim: ✗ (actually 14 inline asserts, 0 pytest functions; pytest collect = 19 total)
- Total claim "258 tests": ✗ (actual pytest+vitest+cargo collected = 223)
- Phase 5 logs match: ✓ (sigs verifiable in `logs/phase5-*.json`)
- Burner adapter wired: ✓
- Sentry config files: ✓
- /admin/health page: ✓
- Sentry capture in phase5-signer: ✓ (only 2/7 paths — see Phase 5 finding)
- Streaming claim CardContextShape population: ✓
- README "v0.3 — 22 features": ✗ (text lists more; PRODUCT_SPEC says 25)
- README "14 instructions": ✗ (actual 15)
- MAINNET_MIGRATION program ID placeholder: ✗ (real devnet ID `HU4piq8…` deployed)
- SDK ix builders in `@settle/sdk`: ✗ (actually live in `apps/web/lib/anchor-client.ts`)

### Phase 5 — Phase 5 cron loop dispatch + idempotency — ✅ COMPLETE (foreground)

Findings AU-05-001 through AU-05-004. Top issues:
- **AU-05-001 HIGH** — auto_refill has TWO active dispatch paths (`auto_refill_rules` + `auto_refill_queue`); tick updates BOTH `last_refill_at` AND inserts queue rows. Different intent_ids = dedup misses cross-path. Potential double-spend.
- **AU-05-002 MEDIUM** — 5 of 7 failure paths missing Sentry capture (validation gates fail silently).
- **AU-05-003 MEDIUM** — unimplemented-dispatch catch-all silently fails to Sentry.
- **AU-05-004 confirmed** — DB intent_kind constraint correctly migrated to 7 kinds.

Sentry wiring confirmed at lines 1010 (claim_streaming) + 1187 (spend_via_pact) but missing at 896, 900, 913, 923, 1204.

Sub-paths verified:
- 6/7 intents proven live on 2026-05-01 (logs)
- streaming_claim kernel commit fix in place (lines 350-360)
- Idempotency log shows round1 sig matches PROJECT_STATUS claim

### Phase 7 — Indexer + federation correctness — ✅ COMPLETE (sub-agent)

(See sub-agent output above.) Findings AU-07-001 through AU-07-006.


### Phase 11 — Security/Authority/Truth — ✅ COMPLETE (foreground)
- AU-11-001 MEDIUM — hardcoded all-1s pubkey placeholder in group_spend_requests insert (race risk)
- AU-11-002 LOW — hardcoded test pubkey in capability-heatmap demo data
- AU-11-003 CONFIRMED — cron secret + git history clean
- AU-11-004 MEDIUM — 10+ API routes don't perform env-config check (fail-open risk)

### Phase 12 — Devnet/Mainnet Honesty — ✅ COMPLETE (foreground summary)
- AU-12-001 HIGH — 5+ "shipped" features need devnet-honesty verification (Jupiter, MPL Core, Light Protocol, Bonfida SNS, SAS)

### Phase 13 — Dead-code sweep — ✅ COMPLETE (foreground summary)
- AU-13-001 LOW — 3 production TODOs, 0 empty catches, 4 sample-code console.logs, codebase unusually clean

### Phase 2 — Spec-to-code traceability — ✅ COMPLETE (sub-agent)
80 features traced. AU-02-001 through AU-02-011. Status distribution: 38 SHIPPED · 17 PARTIAL · 10 MISSING · 1 MAINNET_ONLY · 1 FUNDED_FUTURE · 1 SIMULATED · 6 NEEDS_VERIFICATION. No HIGH/BLOCKER from this phase.

### Phase 3 — Anchor program correctness audit — ✅ COMPLETE

Run 2026-05-02. Output: `docs/audit/PROGRAM_AUDIT.md`. Findings AU-03-001 through AU-03-012 appended to FINDINGS.md.

Scope covered: all 15 instructions audited per the brief checklist (account list, PDA seeds, authority checks, replay surface, daily-cap accounting, allowlist/capability enforcement, pact-closure drainage, streaming-rate overflow, record_denial authorization, cross-pact cap accounting, AU-00-004 follow-up).

Cross-checks run:
- `pnpm tsx scripts/check-idl-drift.ts` → OK (15 ix, 13 events, no discriminator collisions, 5 indexer event-size assumptions match — AU-07-004 still applies for the 8 uncovered events)
- `pnpm tsx scripts/smoke-ix-data-parity.ts` → OK for 13 of 15 ix; `record_denial` and `record_receipt` are NOT in the smoke (drives AU-03-008)

Findings by severity:
- HIGH: 3 (AU-03-006 streaming stuck-state on per_call_max; AU-03-007 stream cross-pact cap brittleness; AU-03-008 Python+Rust SDK missing 2 of 15 ix)
- MEDIUM: 5 (AU-03-001 record_denial pact arg unvalidated; AU-03-002 record_denial spam; AU-03-003 OneShot pact cap≤daily; AU-03-004 close_pact rent leak; AU-03-005 streaming max_total≤daily)
- LOW: 4 (AU-03-009 error-message reuse; AU-03-010 merchant ATA pre-existence; AU-03-011 record_receipt spam-by-design; AU-03-012 CAP_WINDOW_SLOTS drift)
- BLOCKER: 0

**AU-00-004 resolved**: `resume_streaming` DOES emit `PactStreamPauseEvent { paused: false }` (line 42-46). The earlier hypothesis was wrong; the unified pause/resume event uses the boolean flag to discriminate.

Top 3 surprises:
1. **AU-03-006/007 streaming stuck-state**: a streaming pact whose entitlement grows past `per_call_max` cannot drain at all — agent has no `amount` arg and no partial-claim logic. Closing the pact forfeits entitlement. Operationally fragile for autonomous agents that go offline.
2. **AU-03-008 cross-lang gap**: the headline "three-language SDK byte parity" is provably broken for 2 of 15 ix. Only TS has `recordDenialIx`/`recordReceiptIx`. The CI parity smoke doesn't exercise either, so this drift is invisible.
3. **AU-03-003/005 cap-budget framing**: open-time `cap ≤ daily_cap` and `max_total ≤ daily_cap` constraints force users to inflate daily caps to set up multi-day budgets, defeating the daily-cap blast-radius safety. Cross-pact cap is already enforced at spend time, so the open-time constraint is redundant AND harmful.

Self-check:
1. Read every per-instruction file? ✓ (all 15 + state.rs + events.rs + errors.rs + lib.rs + mod.rs)
2. Line-numbered evidence? ✓
3. Verification commands cited? ✓ (both smoke scripts run with output captured)
4. Cross-checked PDA seeds against TS / Python / Rust derivers? ✓ (snake_case discriminator derivation consistent)
5. Distinguished CODE_EXISTS / WIRED / LIVE_VERIFIED? Program is CODE_EXISTS+WIRED; LIVE devnet replay deferred to Phase 14.
6. Defensible? ✓

### Phase 9 — Library / framework correctness — ✅ COMPLETE

Run 2026-05-02. Output: `docs/audit/LIBRARY_CORRECTNESS.md`. Findings AU-09-002 through AU-09-016 appended to `FINDINGS.md`.

WebFetch citations (all dated 2026-05-02):
- Next.js Route Handlers: https://nextjs.org/docs/app/api-reference/file-conventions/route
- React 19 use(): https://react.dev/reference/react/use
- Solana Pay spec: https://docs.solanapay.com/spec
- Solana Actions: https://solana.com/docs/advanced/actions
- Sentry Next.js SDK 8: https://docs.sentry.io/platforms/javascript/guides/nextjs/
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- @solana/spl-token: https://www.solana-program.com/docs/token (redirect from spl.solana.com)
- MCP tools spec: https://modelcontextprotocol.io/docs/concepts/tools (rev 2025-06-18)
- ZK compression: https://www.zkcompression.com/welcome
- Helius docs: https://www.helius.dev/docs (partial — sub-paths 404; AU-09-014 NEEDS_VERIFICATION)
- Jupiter API: https://developers.jup.ag/docs/api (returned no content; AU-09-015 NEEDS_VERIFICATION)
- @anza-xyz/wallet-adapter README: https://github.com/anza-xyz/wallet-adapter

Findings by severity:
- HIGH: 4 (AU-09-005 Supabase RLS missing on majority of tables; AU-09-006 server fallback to anon key; AU-09-008 Sentry SDK 8 missing instrumentation.ts → server captures dropped; AU-09-016 MCP middleware reads _meta from wrong place)
- MEDIUM: 6 (AU-09-003 spl-token decimals literal; AU-09-004 wallet-adapter CSS require(); AU-09-007 Number(amount_lamports); AU-09-010 18 routes without zod; AU-09-011 missing actions.json; AU-09-012 CORS Allow-Headers; AU-09-013 missing X-Action-Version)
- LOW: 2 (AU-09-002 OPTIONS non-async; AU-09-009 Python blake3 floor)
- NEEDS_VERIFICATION: 2 (AU-09-014 Helius; AU-09-015 Jupiter)
- N/A confirmations: anchor wiring, web3.js v1, MPL Bubblegum/Core, bs58, @noble/curves+ciphers, Light Protocol — all OK at this layer

Top surprises:
1. **AU-09-008 Sentry SDK 8**: `instrumentation.ts` is required for Next 15 server-side init, and the file is missing. This INVALIDATES Phase 5's assumption that Sentry capture is wired (cf. AU-05-002). All `Sentry.captureException` calls in cron routes are silent no-ops.
2. **AU-09-006 anon-key fallback**: 25+ server routes silently degrade to anon key when service-role env is missing. Combined with partial RLS, writes silently drop with HTTP 200 (FAKE_SUCCESS).
3. **AU-09-016 MCP `_meta`**: middleware reads from `params._meta` (non-standard); spec puts `_meta` on the request envelope. Real-world clients fail Settle credential validation.

Self-check:
1. Read every flagged file at the line cited? ✓
2. WebFetched docs for every library before flagging? ✓ (failures logged as NEEDS_VERIFICATION)
3. Cross-checked findings against existing phase findings (no double-count)? ✓ (AU-09-005 explicitly cites AU-10-001; AU-09-008 explicitly INVALIDATES the Phase-5 assumption AU-05-002)
4. Used WebFetch as the source of truth, not training memory? ✓ for libraries with reachable docs; ⚠ NEEDS_VERIFICATION for Helius + Jupiter
5. Padded HUMAN_ACTIONS? No — only AU-09-005 + AU-09-006 require user action (Supabase migration + Vercel env), both already required by other phases.
6. Defensible in security review? ✓ — every finding cites a doc URL OR is flagged NEEDS_VERIFICATION.

### Phases still running:
- (none — Phase 9 complete)

### Phases pending (Cycle 1):
- Phase 4 — SDK byte-parity verification
- Phase 6 — Integration graph
- Phase 8 — UX reachability (partly done via Phase 2; Playwright reachability spec deferred to Phase 14)
- Phase 10 — Data/RLS audit
- Phase 14 — Test coverage + new-test design
- Phase 15 — FINAL_AUDIT_REPORT synthesis

## Cycle 1 interim status — checkpoint

Findings count: **39 logged** (more pending from Phase 3 + 9 sub-agents)
By severity (so far):
- HIGH: 5+ (AU-01-003 SDK ix builders not in @settle/sdk; AU-01-006 MAINNET_MIGRATION program-ID stale; AU-05-001 auto-refill double-dispatch; AU-07-001 indexer cursor; AU-07-002 round-up double-spend risk; AU-12-001 devnet honesty)
- MEDIUM: 9+ (AU-05-002, AU-05-003, AU-07-003, AU-07-004, AU-11-001, AU-11-004 + others)
- LOW: 5+ (AU-01-004, AU-01-007, AU-07-005, AU-07-006, AU-11-002, AU-13-001)
- DOC_DRIFT: 12+ (AU-00-001/002/003, AU-01-001/002/005, etc.)

**No BLOCKER yet identified.** Top concerning: auto-refill double-dispatch (AU-05-001) + indexer cursor durability (AU-07-001). Both could cause real production issues.

