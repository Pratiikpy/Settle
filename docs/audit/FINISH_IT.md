# Settle Protocol — FINISH IT (autonomous, no compromise)

You are the senior engineer responsible for converging Settle Protocol's audit→test→fix loop to **zero open findings and zero failing tests.** Cycle 1 is partially done: 13 HIGH findings closed, 3 migrations applied live, parity smokes green. **TEST pass and audit pass 2 are not yet done.**

You will finish them. All of them. Without asking. Without stopping. Without taking shortcuts. Without inventing reasons to defer. The ONLY stops permitted are listed at the bottom.

---

## STARTING STATE (verify before continuing)

Read these files end-to-end first — they ARE your context, not optional:

- `docs/audit/MASTER_BRIEF.md` — the orchestration loop
- `docs/audit/AUDIT_BRIEF.md` — Phase 0–15 spec
- `docs/audit/TEST_BRIEF.md` — Phase T0–T12 spec
- `docs/audit/FIX_BRIEF.md` — Step 1–7 fix protocol
- `docs/audit/SHIP_READY.md` — Cycle 1 status snapshot
- `docs/audit/FINDINGS.md` — 82 findings cumulative
- `docs/audit/FIX_REPORT.md` — what's already fixed
- `PROJECT_STATUS.md` — claimed state (always treat as a hypothesis to verify)

Confirm via running commands:
- `pnpm -r typecheck` — must be all green
- `pnpm tsx scripts/smoke-multikind-goldens.ts` + `pnpm tsx scripts/smoke-ix-data-parity.ts`
- `pnpm tsx scripts/check-idl-drift.ts`
- All 3 SDK test runners (vitest / cargo / pytest)

If any of those fails, fix the regression FIRST before doing anything else. The Cycle 1 fixes must hold.

---

## THE WORK YOU ARE FINISHING

### TEST pass (TEST_BRIEF.md Phases T0–T12) — almost none of this ran in Cycle 1

You will run all of it. Specifically:

- **T1 static + parity** — re-run all (typecheck, full vitest, smokes, anchor test if feasible). Capture pass/fail/duration per suite.
- **T2 on-chain** — re-run `e2e-payment-flow.ts`, `phase5-live-test.ts`, `phase5-live-all-intents.ts`, `phase5-idempotency-drill.ts`. Write a new harness for ANY claim in `FEATURE_TRACEABILITY_MATRIX.md` that lacks one.
- **T3 Playwright** — start dev server with `NEXT_PUBLIC_E2E_BURNER=1`. Run the existing 20 tests. Then **add new tests** for every Phase 5 surface flow not already covered (cards spawn, wishes schedule, allowances, groups voting, sign-tx through every form). Use the `connectBurner` helper.
- **T4 visual regression** — Playwright screenshots at desktop 1280×800, tablet 768×1024, mobile 390×844 for every Phase 5 surface. Both connected (burner) and disconnected. Store under `apps/web/e2e/__screenshots__/`.
- **T5 failure mode** — deliberately inject failures and assert UI fails gracefully: wallet disconnect mid-sign, insufficient SOL, insufficient USDC, revoked card, closed pact, cap exceeded, network failure (`page.route().abort()`), slow network (5s delay), indexer lag. No fake success, no silent failure.
- **T6 race conditions** — multiple browser contexts firing the same scheduled_send simultaneously; tick + signer interleaved via `Promise.all`; two browsers same wallet attempting `create_card` with same label. Assert dedup holds.
- **T7 accessibility** — `@axe-core/playwright` on every Phase 5 surface. Zero violations target.
- **T8 performance budget** — Playwright `page.metrics()` on every surface. LCP < 2.5s, bundle JS < 1.5MB total.
- **T9 multi-language SDK consumer** — TS + Python + Rust each compute a kernel commit for an identical input; assert byte-identical hashes.
- **T10 MCP middleware E2E** — invoke a tool definition end-to-end with both envelope-only and params-only `_meta` placement.
- **T11 final E2E orchestration** — single Playwright test walking connect → create card → open pact → schedule → cron tick → cron signer → receipt visible → verify via SDK → disconnect → reconnect → state preserved.
- **T12 test report** — `docs/audit/TEST_REPORT.md` per-test ID with PASS/FAIL/SKIPPED/HUMAN_ACTION_REQUIRED.

### Audit pass 2 (AUDIT_BRIEF.md re-run, focus on regressions)

After TEST pass, re-grep + re-walk the patterns you fixed in Cycle 1 to confirm they stay closed:

- `grep -rn 'SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY'` — must return zero matches in write routes
- `grep -rn 'auto_refill_rules.*last_refill_at' apps/web/app/api/cron/phase5-signer/route.ts` — must show only the comment, not active logic
- Verify `apps/web/instrumentation.ts` exists and `Sentry.captureException` calls in phase5-signer fire (test by deliberately causing a fire-time exception, observe Sentry init log on stdout)
- Re-query Supabase with anon JWT against the 24 RLS-protected tables; expect 401 / empty
- Re-run `phase5-idempotency-drill.ts` to confirm dedup still holds
- Restart the indexer mid-event-stream to confirm cursor-based replay catches up
- Re-run all 3 SDK test runners — record_denial + record_receipt parity must still hold

For each Cycle 1 closure, run the verification command from its FIX_REPORT entry. Any regression = HIGH-severity new finding.

### Remaining MEDIUM and LOW findings

Close the MEDIUM findings: AU-05-002 (Sentry on validation gates), AU-05-003 (Sentry on unimplemented ix), AU-07-003 (federation poller webhook URL), AU-07-004 (IDL drift covers all 13), AU-11-001 (group_spend race), AU-11-004 (read-only routes silent fallback). All trivial-to-medium fixes.

Close the LOW findings: doc cleanup, route classification, SDK_VERSION (already done — verify), PLACEHOLDER_PROGRAM_ID dead constant removal.

### Operator-only items (HUMAN_ACTIONS.md)

The fix for AU-03-006 needs `anchor deploy --provider.cluster devnet`. You can't run it yourself (requires program upgrade authority keypair + the user's choice). **Document this in HUMAN_ACTIONS.md and continue with everything else.** Don't let it block the rest of the loop.

---

## NON-NEGOTIABLES

1. **Pure autonomy.** Do not ask. Do not pause between phases. Do not pause between cycles. Do not request decisions. Continue until convergence or a documented STOP CONDITION below.
2. **No compromise.** No "deferred to next pass" unless the work is genuinely AI-impossible (operator action, firm engagement, mainnet tx). Re-read the 8-step DON'T-GIVE-UP CHECKLIST in TEST_BRIEF.md before flagging anything HUMAN_ACTION_REQUIRED.
3. **No easy way.** Every fix follows FIX_BRIEF Step 1–7 — understand, doc-fetch, plan, implement, verify, document, regression-net. No `as any`, no silent catches, no half-finished work.
4. **Leave nothing.** Every finding closed. Every test written and run. Every flow exercised. Every claim in PROJECT_STATUS verified or corrected.
5. **Never stop with 1 thing left.** If 81 of 82 findings are closed and 1 remains AI-doable, you keep going. The brief threshold for stopping is GENUINE convergence — see definition below.
6. **Self-verify after every fix.** A fix isn't closed until its verification command passes AND the full regression net runs clean.
7. **Cross-language parity is sacred.** Any change to ix data, kernel commit, or canonical JSON must update TS + Python + Rust + their goldens together. Never commit a fix that breaks parity.

---

## CONVERGENCE DEFINITION

You stop ONLY when ALL of these simultaneously hold:

- `docs/audit/FINDINGS.md` has zero entries with status != CLOSED, except items genuinely flagged HUMAN_ACTION_REQUIRED with the 8-step checklist exhausted
- `docs/audit/TEST_REPORT.md` shows zero FAIL or HARD_FAIL entries
- `pnpm -r typecheck` green across all 9 workspaces
- All 3 SDK test runners pass
- All keypair harnesses pass on devnet
- All Playwright tests pass
- A full audit pass 2 produces zero NEW findings (or only DOC_DRIFT-class)
- One full audit→test→fix cycle ran with zero new findings introduced

When convergence holds, write `docs/audit/SHIP_READY.md` (overwriting the existing) with:
- Final findings count (must be 0 + N HUMAN_ACTION_REQUIRED)
- Final test pass count
- Total cycles run
- Total devnet SOL spent (target: < 3 SOL across all cycles)
- Total wall time
- Mainnet readiness verdict (the one and only Yes)
- Confidence level (must be High)

---

## STOP CONDITIONS (ONLY THESE)

You may pause and surface a question to the user only if:

1. A required action is genuinely destructive (DROP TABLE, force-push to main, mainnet tx) — describe what you'd do and ask
2. A confirmed BLOCKER has live financial exposure right now (active mainnet funds at risk)
3. Devnet SOL exhausted past 3 SOL across all cycles
4. A verification needs a credential that is NOT in `.env.local` AND that you've exhausted all alternative paths to obtain
5. The user explicitly told you to stop in a prior message in this session

Everything else: continue. Phase complete → next phase. Lots of findings → document and continue. Slow command → run it (use `run_in_background` + `ScheduleWakeup` if > 10 min). Complex fix → read more, plan harder, then implement. Tempting refactor opportunity → resist; only the cited issue.

---

## START NOW

1. Verify starting state (read briefs + run typecheck + smokes).
2. Begin TEST pass at T0. Build TEST_PLAN.md from `FEATURE_TRACEABILITY_MATRIX.md`.
3. Run T1 → T11 in order, writing tests as needed.
4. Write `TEST_REPORT.md` after T12.
5. Begin audit pass 2. Re-walk every Cycle 1 closure + every NEW finding from TEST pass.
6. Open a new fix pass for any FAIL / new finding. FIX_BRIEF Step 1–7 per finding.
7. After fix pass, run convergence check.
8. If not converged, begin Cycle 2 (audit → test → fix → check).
9. Continue cycling until convergence.
10. On convergence, overwrite `docs/audit/SHIP_READY.md` with the final report and stop.

**Do not ask whether to start. Do not ask whether to continue between phases. Do not ask whether to continue between cycles. Begin.**
