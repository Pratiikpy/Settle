# Settle Protocol — Cycle 1 Final Audit Report

**Run date:** 2026-05-02
**Phases completed:** 0, 1, 2, 3, 4, 5, 7, 10 (partial), 11, 12, 13, 14
**Phases skipped this cycle:** 6 (integration graph — large, deferred to TEST pass), 8 (Playwright reachability — deferred), 9 (libraries — sub-agent in flight at cycle close), 15 (this report)
**Total findings:** 56
**Devnet SOL spent:** ~0 (no live verification fires this cycle; existing logs sufficed)

---

## 1. Executive summary

- **No BLOCKER-class findings.** The codebase is in better shape than its docs claim.
- **5 HIGH-severity findings** centered on: (a) RLS gaps on 24 of 42 tables, (b) auto-refill double-dispatch path, (c) indexer cursor durability + double-spend risk on event replay, (d) Anchor program stuck-state in `claim_streaming`, (e) cross-language SDK gap (Python+Rust missing 2 ix).
- **Doc drift is systemic.** Three different "instruction count" numbers (13/14/15) across docs; `MAINNET_MIGRATION.md` references stale placeholder program ID; SDK ix builders not actually in `@settle/sdk`; test-count overcounted by 35.
- **Production runtime is largely truthful.** Phase 5 cron live-fire logs verified; idempotency drill log verified; burner adapter properly env-gated; cron secret enforced; no secrets in commit history; Sentry wired (partially).
- **The product genuinely runs on devnet.** 6/7 Phase 5 intents proven live (logs + sigs verified). The seventh (`streaming_claim`) has a known kernel-commit fix in place; on-chain landing deferred.

**Mainnet readiness: NO, conditional on closing 5 HIGH findings.**

---

## 2. What's actually working (evidenced)

| Area | Evidence |
|------|----------|
| **Anchor program deployed to devnet** | `lib.rs declare_id!("HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD")`; commit `790be4f` |
| **15 Anchor instructions** | `lib.rs` confirms 15; per-instruction module files exist; sealevel-attacks checklist passes (per SECURITY.md) |
| **Phase 5 cron loop fires live** | `logs/phase5-all-intents-2026-05-01T19-29-54-903Z.json` — 6 of 7 intents confirmed on devnet with real sigs |
| **Idempotency dedup works** | `logs/phase5-idempotency-2026-05-01T20-27-10-901Z.json` — round 2 picked 0, no duplicate row, vault unchanged |
| **45 migrations applied** | `infra/supabase/migrations/0001…0045.sql` linearly numbered, no gaps |
| **3-language SDK byte parity for 13 ix** | `smoke-ix-data-parity.ts` outputs identical bytes consumed by Rust + Python golden tests; 19 Python pytest pass; cargo test compiles |
| **35 kernel-commit hashes byte-identical across TS/Python/Rust** | `smoke-multikind-goldens.ts` runs clean; Python test_kernel_parity asserts; Rust kernel.rs goldens |
| **Layer B Playwright suite (20 tests, 3.4 min)** | per `PROJECT_STATUS.md` (2026-05-02); not re-run this audit |
| **Sentry wiring** | `apps/web/sentry.{client,server,edge}.config.ts`; phase5-signer captures at lines 1010 + 1187 |
| **/admin/health page** | `apps/web/app/admin/health/page.tsx` with last-20 + failures + indexer-lag + total-execs |
| **Cron auth enforced** | both cron routes check `Bearer ${CRON_SECRET}` (lines 100/439) |
| **Burner adapter env-gated** | `apps/web/app/providers.tsx` only adds Burner when `NEXT_PUBLIC_E2E_BURNER=1` |
| **No secrets in git history** | `git log -p --all` grep clean |
| **No empty catch blocks** | grep across `apps/web/app + apps/web/components + apps/web/lib + apps/indexer/src + packages/sdk/src` |
| **Indexer all 13 events subscribed + writing** | per Phase 7 sub-agent, byte sizes hand-summed against `events.rs`; the post-`17ddb08` regression class is not present elsewhere |

---

## 3. What's broken (HIGH-severity, evidence-linked)

### AU-10-001 HIGH — 24 of 42 Supabase tables missing RLS
**Impact:** anon JWT (in browser bundle) likely permits SELECT on `allowances`, `gift_sends`, `auto_refill_queue`, `phase5_executions`, `federation_origins`, `idempotency_keys`, etc. A browser script could enumerate all users' financial profiles.
**Fix:** enable RLS + add per-table authority-bound policies. ~24 small migrations, mostly 1 ALTER + 1 CREATE POLICY each.

### AU-05-001 HIGH — Auto-refill double-dispatch path
**Impact:** signer reads `auto_refill_rules` (Path 1) AND `auto_refill_queue` (Path 2) for the same logical refill. Different intent_ids → dedup misses cross-path. Potential double-spend AND payment to wrong wallet (Path 1 → card_pubkey; Path 2 → dest_pubkey).
**Fix:** delete Path 1 (lines 540-571 of phase5-signer/route.ts); audit auto_refill v1 → v2 migration consumers; add cross-table dedup test.

### AU-07-001 HIGH — Indexer no durable cursor / replay-on-restart
**Impact:** indexer restart silently drops events between disconnect and reconnect. Receipts not mirrored → /receipts page renders incomplete history → trust gap.
**Fix:** durable cursor table; on restart, replay from `last_processed_slot`.

### AU-07-002 HIGH — Round-up double-spend risk on event replay
**Impact:** `round_up_queue` insert lacks idempotency key. WS reconnect can replay a `PactSpendEvent` → second queue row → double round-up fire.
**Fix:** add UNIQUE on `(triggering_request_id)` in `round_up_queue`.

### AU-03-006 HIGH — `claim_streaming` permanently stuck if entitlement > per_call_max
**Impact:** if accrued slots × rate > per_call_max, every claim reverts. No partial-claim path. Agent must close pact + forfeit entitlement.
**Fix:** allow agent to claim up to `min(entitlement, per_call_max)` per ix; entitlement remains for next claim.

### AU-03-008 HIGH — Python + Rust SDKs missing 2 ix builders
**Impact:** `record_denial` and `record_receipt` are TS-only. PROJECT_STATUS claim of "all 13 ix data builders" is technically true (count matches) but Anchor program has 15. External non-TS consumers cannot build complete tx flows.
**Fix:** port both ix to `packages/python-sdk/settle_sdk/__init__.py` + `packages/rust-sdk/src/ix_data.rs`; add goldens; extend smoke harness.

### AU-01-006 HIGH — MAINNET_MIGRATION.md references stale placeholder program ID
**Impact:** anyone using MAINNET_MIGRATION as a checklist sees the wrong baseline. Devnet ID `HU4piq8…` is real and deployed.
**Fix:** update row 14 with current devnet ID + correct rotation steps.

### AU-01-003 HIGH — SDK ix builders not in @settle/sdk
**Impact:** external SDK consumers can't build txs without copying internal `apps/web/lib/anchor-client.ts`. Architectural drift, not just doc-level.
**Fix:** move ix builders to `packages/sdk/src/anchor-ix-data.ts`; export from `index.ts`.

### AU-12-001 HIGH — Devnet honesty: 5+ "shipped" features need devnet/mainnet tag verification
**Impact:** Jupiter swap (devnet has no liquidity), MPL Core badges, Light Protocol mirror, Bonfida SNS — some only function on mainnet. PROJECT_STATUS over-claims.
**Fix:** per feature, tag `🟦 SIMULATED` / `🌐 MAINNET_ONLY` / `✅ SHIPPED` in PROJECT_STATUS based on actual devnet behavior.

---

## 4. What's lying (DOC_DRIFT)

- **Anchor instruction count:** PROJECT_STATUS=13, README+STRATEGY=14, code=15
- **Anchor event count:** PROJECT_STATUS=14, code=13
- **Test count:** claim=258, actual collected=223 (35 inline asserts not pytest-registered)
- **README "v0.3 — 22 features":** PRODUCT_SPEC says 25; STRATEGY says ~150
- **`@settle/sdk` claims to export ix builders:** doesn't (they live in apps/web/lib/anchor-client.ts)
- **SDK_VERSION constant says 0.2.0; package.json says 0.1.0**
- **MAINNET_MIGRATION program ID claimed placeholder; actually deployed**
- **`apps/web/lib/anchor-client.ts` retains PLACEHOLDER_PROGRAM_ID constant** (DEAD_CODE)

---

## 5. What's missing (MISSING + UX_NOT_REACHABLE)

(From Phase 2 sub-agent + Phase 13 sweep)

- **F2.5** `/at/<handle>/proof` page — does not exist
- **F4.1** `npx create-settle-merchant` — only local script, not published
- **F5.8** agent-framework adapters (OpenAI / Anthropic / LangChain / CrewAI) — none exist
- **F5.12** templates — partially missing
- **31 UI routes** present in code but unmentioned in PROJECT_STATUS — Phase 8 reachability spec deferred to TEST pass

---

## 6. What's risky (security findings)

| ID | Severity | Summary |
|----|----------|---------|
| AU-10-001 | HIGH | RLS gaps (see §3) |
| AU-11-001 | MEDIUM | Hardcoded all-1s pubkey placeholder pact_pubkey insert (race) |
| AU-11-004 | MEDIUM | 10+ API routes don't perform env-config check |
| AU-05-002 | MEDIUM | 5 of 7 phase5-signer failure paths missing Sentry capture |
| AU-05-003 | MEDIUM | Catch-all unimplemented-dispatch silently fails to Sentry |
| AU-07-003 | MEDIUM | Federation poller webhook lookup ignores `verified_merchants.webhook_url` |
| AU-11-002 | LOW | Hardcoded test pubkey in capability-heatmap demo data |
| AU-07-005 | LOW | `kernel_receipt_attestations` PK collides on multi-event txs (dormant) |
| AU-07-006 | LOW | `CardCreatedEvent.allowlist_count` parsed but discarded |

---

## 7. What's polish-only (LOW + DOC_DRIFT)

- AU-13-001: 3 production TODOs, 4 docs/sample-code console.logs, codebase clean
- AU-01-004: SDK_VERSION mismatch
- AU-01-007: PLACEHOLDER_PROGRAM_ID dead constant
- AU-00-003: 31 unclaimed UI routes (need Phase 8 classification)
- AU-02-* DOC_DRIFT findings (sub-agent traceability; doc tags vs reality on F1-F25)

---

## 8. Prioritized fix plan (FIX_BRIEF order)

### Fix Group 1 — BLOCKER for mainnet (do before any mainnet step)
1. AU-10-001 (RLS gaps on 24 tables) — ~1 day; per-table migration
2. AU-05-001 (auto-refill double-dispatch) — ~2 hr; delete Path 1
3. AU-07-001 (indexer cursor) — ~3 hr; durable cursor table + replay
4. AU-07-002 (round-up double-spend) — ~1 hr; UNIQUE on triggering_request_id
5. AU-03-006 (claim_streaming stuck-state) — ~1 hr in Anchor program; needs program redeploy
6. AU-03-008 (Python+Rust missing 2 ix) — ~3 hr; port ix builders + goldens

### Fix Group 2 — HIGH-quality-of-life
7. AU-12-001 (devnet honesty per feature) — ~1 day; PROJECT_STATUS rewrite
8. AU-01-003 (SDK ix builders extraction) — ~4 hr; move to packages/sdk
9. AU-01-006 (MAINNET_MIGRATION program ID) — ~15 min; doc edit

### Fix Group 3 — MEDIUM (operational)
10. AU-05-002 + AU-05-003 (Sentry coverage on all failure paths) — ~1 hr
11. AU-07-003 (federation poller webhook URL asymmetry) — ~1 hr
12. AU-07-004 (IDL drift script extends to all 13 events) — ~1 hr
13. AU-11-001 (group_spend pact_pubkey race) — ~30 min; transactional insert
14. AU-11-004 (10+ routes env-config check) — ~2 hr; pattern sweep

### Fix Group 4 — LOW
15-19. Documentation cleanup, dead-code removal, test alignment.

### Fix Group 5 — DOC_DRIFT
20+. Unify counts (instructions / events / features / tests) across PROJECT_STATUS / README / STRATEGY / SECURITY.

---

## 9. Mainnet readiness gate

Cannot ship to mainnet until ALL of these close:
- [ ] AU-10-001 RLS on every user-data table
- [ ] AU-05-001 auto-refill single-dispatch path
- [ ] AU-07-001 indexer durable cursor
- [ ] AU-07-002 round-up idempotency
- [ ] AU-03-006 claim_streaming partial-claim
- [ ] AU-03-008 SDK parity for all 15 ix
- [ ] Anchor program third-party audit (cantina/sherlock)
- [ ] `MAINNET_MIGRATION.md` checklist re-validated against current state

---

## 10. Audit confidence per phase

| Phase | Confidence | What would raise it |
|-------|------------|---------------------|
| 0 Inventory | High | — |
| 1 Doc conformance | High | — |
| 2 Spec-to-code (sub-agent) | Medium | re-run once F2.0/F23 NEEDS_VERIFICATION items resolved |
| 3 Anchor program (sub-agent) | High | external Anchor program audit |
| 4 SDK parity | High | re-run smoke after AU-03-008 fix |
| 5 Phase 5 dispatch | High | replay live harness for current commit |
| 6 Integration graph | DEFERRED | full sub-agent run |
| 7 Indexer | High | live restart-resume test for cursor |
| 8 UX reachability | DEFERRED | Playwright link-graph spec |
| 9 Library correctness | DEFERRED | sub-agent still in flight |
| 10 Data/RLS | Medium | actually query each table with anon JWT |
| 11 Security | Medium | full route-by-route auth audit |
| 12 Devnet honesty | Medium | per-feature devnet/mainnet test matrix |
| 13 Dead code | High | knip + ts-prune + madge runs |
| 14 Test coverage | Medium | run all suites in CI for measured pass count |

---

## 11. Total devnet SOL spent

This audit pass: **0 SOL** (no new verification fires; existing logs from 2026-05-01 sufficed).

Reserved budget (carried to TEST pass): **0.5 SOL**.

---

## 12. Cycle 1 status

**Convergence: NOT REACHED.** 56 findings open, 0 closed.

Master-brief expects audit → test → fix → loop. This is end of audit pass 1. Per master brief next steps:
1. Run TEST pass (TEST_BRIEF.md) — exercises every claim live; expect new T- findings
2. Run FIX pass (FIX_BRIEF.md) — closes findings in priority order; mainnet-blockers first
3. Run audit pass 2 — verify no regressions
4. Iterate until findings = 0

**Recommendation:** address Fix Group 1 (mainnet BLOCKER set) before running TEST pass. The HIGH findings may surface differently after fixes (e.g. RLS test with anon JWT could be both a fix verification and a new test).

**Cycle 1 audit pass: COMPLETE.**

---

## ✏️ POST-PHASE-9 ADDENDUM (after sub-agent 15 findings)

Phase 9 sub-agent delivered **15 findings**, including 4 NEW HIGH that change the verdict materially.

### Updated severity totals
- **0 BLOCKER**
- **13 HIGH** (was 9)
- **16 MEDIUM** (was 9)
- **8 LOW** (was 6)
- **2 NEEDS_VERIFICATION**
- **30+ DOC_DRIFT**
- **Total: 71 findings**

### NEW HIGH findings from Phase 9

#### AU-09-008 HIGH — Sentry NEVER initializes
**Most critical Phase 9 finding.** Sentry config files exist (`sentry.{client,server,edge}.config.ts`) but Next 15 requires `instrumentation.ts` (server) + `instrumentation-client.ts` (client) + `app/global-error.tsx` (error boundary) to actually load the SDK. **None of these files exist in `apps/web/`.**

**Impact:** every `Sentry.captureException()` in `phase5-signer/route.ts` (lines 1010, 1187) is a SILENT NO-OP. The whole observability story I confirmed earlier in this audit ("Sentry wired ✓") was checking the wrong layer. **PROJECT_STATUS lies about Sentry.** This INVALIDATES my Phase 11 confirmation AU-11-003 partially (Sentry-DSN-guard works but only because nothing initializes anyway).

**Fix:** create `apps/web/instrumentation.ts` calling `Sentry.init` from `sentry.server.config.ts`. Same for client + global-error per Sentry Next 15 SDK 8 docs.

**Why I missed it:** I checked `Sentry.captureException` exists in the route handler. The doc-fetch requirement was specifically designed to catch this class of bug — Phase 9 sub-agent fetched the Sentry Next 15 SDK 8 docs and identified that `instrumentation.ts` is now mandatory.

#### AU-09-006 HIGH — Service role silently degrades to anon key
**FAKE_SUCCESS pattern.** 25+ server routes use:
```ts
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```
If `SUPABASE_SERVICE_ROLE_KEY` is missing in a production deploy, routes silently fall back to anon. With partial RLS (AU-10-001 / AU-09-005), anon writes return HTTP 200 but no row inserts.

**Impact:** the relayer signer would log "execution_logged: 1" but `phase5_executions` actually has 0 rows. Operator sees green response, system is dead.

**Fix:** every route that needs service role MUST `throw` or return 503 if `SUPABASE_SERVICE_ROLE_KEY` is missing. No silent fallback.

#### AU-09-005 HIGH — RLS gaps (cross-validates AU-10-001)
Independently re-discovered by Phase 9 sub-agent reading Supabase RLS docs. Same root cause as AU-10-001. Confirmed.

#### AU-09-016 HIGH — MCP middleware reads `_meta` from wrong location per spec
`packages/mcp-middleware/src/index.ts:51-58` reads Settle credential from `request.params._meta`. MCP spec rev 2025-06-18 places `_meta` on the **request envelope**, not on `params`. Spec-compliant MCP clients (Claude Desktop, Cursor) will fail credential validation.

**Impact:** F5.7 ("agent SDK works with any MCP client") — spec-compliant clients fail. Workable only with non-spec-compliant Settle-aware clients.

**Fix:** read `_meta` from request envelope per MCP 2025-06-18 spec.

### NEW MEDIUM findings from Phase 9 (top 3)

- **AU-09-011/012/013** — Solana Actions wiring incomplete: no domain-root `actions.json`, CORS missing `Authorization`/`Content-Encoding`/`Accept-Encoding`, no `X-Action-Version`/`X-Blockchain-Ids` headers. Phantom Blink would misroute on devnet → mainnet swap silently.
- **AU-09-007** — wallet-adapter version conflicts; some Phantom + Privy peer warnings indicate adapter version drift

### NEEDS_VERIFICATION (Phase 9)
- AU-09-014: Helius Sender API endpoint moved (sub-agent got 404 on new docs URL)
- AU-09-015: Jupiter docs path returned 404; not currently using deprecated API but couldn't verify against current URL

### Updated mainnet readiness gate

Original 8 items + 4 new HIGH:
- [ ] AU-10-001 / AU-09-005 — RLS on every user-data table
- [ ] AU-05-001 — auto-refill single-dispatch
- [ ] AU-07-001 — indexer durable cursor
- [ ] AU-07-002 — round-up idempotency
- [ ] AU-03-006 — claim_streaming partial-claim
- [ ] AU-03-008 — SDK parity for all 15 ix
- [ ] **AU-09-008 — Sentry instrumentation.ts (BLOCKS production observability)**
- [ ] **AU-09-006 — service role silent-degrade fix**
- [ ] **AU-09-016 — MCP middleware `_meta` location fix**
- [ ] **AU-09-011/012/013 — Solana Actions / Blink wiring**
- [ ] AU-01-006 — MAINNET_MIGRATION program ID update
- [ ] Anchor program third-party audit

### Final Cycle 1 verdict

**Mainnet readiness: NO.** 13 HIGH findings. Most critical:
1. **Sentry doesn't actually fire** (AU-09-008) — silent observability blind spot
2. **Service role silently falls back to anon** (AU-09-006) — fake-success pattern
3. **RLS gaps** (AU-10-001 / AU-09-005) — anon JWT can read sensitive tables
4. **Auto-refill double-dispatch** (AU-05-001) — double-spend risk
5. **claim_streaming stuck-state** (AU-03-006) — Anchor program bug, requires redeploy

All 5 are fixable in ≤ 1 day each. Mainnet path: fix all 13 HIGH → run TEST pass → audit pass 2 → if convergent, ship.

**Cycle 1 audit pass: COMPLETE (with Phase 9 addendum).**

**Phases NOT covered this cycle:** 6 (integration graph), 8 (Playwright reachability spec). Defer to TEST pass per master brief.
