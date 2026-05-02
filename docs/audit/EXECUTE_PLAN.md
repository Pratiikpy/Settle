# Settle Protocol — EXECUTE THE PLAN (autonomous, no middle reports, no compromise)

You are the senior engineer. You are alone. You will execute the entire `docs/audit/PLAN_DEVNET_BACKLOG.md` from Wave 0 through Wave 5 in one continuous autonomous run. You will not pause. You will not ask. You will not produce intermediate user-facing reports. You will only stop at one of the documented STOP CONDITIONS at the very bottom. When you finish, you will produce **one** final report by overwriting `docs/audit/SHIP_READY.md`. That is the only output the user will read.

This is the contract. Read it once. Begin immediately.

---

## STARTING STATE — read these first, in this order

1. `docs/audit/PLAN_DEVNET_BACKLOG.md` — **the canonical plan you are executing.** Every approval is locked. Every stream has files-to-add, risk, verification step. 26 implementation items + Wave 4 test phases + Wave 5 convergence. NO scope cuts, NO drops except F6 i18n which is explicitly deferred.
2. `docs/audit/MASTER_BRIEF.md` — orchestration loop semantics.
3. `docs/audit/AUDIT_BRIEF.md` — audit phase definitions you will reuse.
4. `docs/audit/TEST_BRIEF.md` — test phase definitions you will reuse, especially the 8-step DON'T-GIVE-UP CHECKLIST.
5. `docs/audit/FIX_BRIEF.md` — Step 1–7 protocol for every fix you make.
6. `docs/audit/FINISH_IT.md` — autonomy rules carried forward.
7. `docs/audit/FINDINGS.md` — every finding ID and its current status.
8. `docs/audit/SHIP_READY.md` — current convergence snapshot. You will overwrite this at the very end.
9. `PROJECT_STATUS.md` — claimed state. Treat as a hypothesis. Update at the end.

If any of those files is missing or has changed structure, fail loud immediately. Do not invent. Do not guess.

After reading the briefs, run a baseline regression to confirm Cycle 1 + FINISH_IT closures still hold:

- `pnpm -r typecheck` (must be green across all 9 workspaces)
- `pnpm tsx scripts/smoke-multikind-goldens.ts` + `pnpm tsx scripts/smoke-ix-data-parity.ts` + `pnpm tsx scripts/check-idl-drift.ts`
- All 3 SDK test runners (`pnpm --filter @settle/sdk test`, `pnpm --filter @settle/mcp-middleware test`, cargo, pytest)

If anything fails, fix the regression FIRST before starting Wave 0. Cycle 1 + FINISH_IT must hold.

---

## WHAT YOU ARE EXECUTING

The full contents of `docs/audit/PLAN_DEVNET_BACKLOG.md` — **Wave 0 → Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5**, in order, without pausing. The plan file is your contract. If you find yourself making a decision that the plan doesn't already lock, you are drifting — re-read the plan.

26 implementation items (6 streams):

- Stream A — 3 visible quick wins (hash-chain anim, drag-share, killchain anim)
- Stream B — 4 receipt features (FTS search, tagging UI, compliance export, native webhook retry)
- Stream C — 5 + 2 folded (proof page, trust score, NL discovery, narration via NIM, dispute drafts via NIM, capability alias rendering, home dashboard rewrite)
- Stream D — 5 dev surfaces (npx CLI, web components, framework adapters × 4, templates × 3)
- Stream E — 3 (anchor deploy attempt, streaming harness, heatmap real-data)
- Stream F — 5 polish items (Cmd+K, dark mode, settings page, revoke banner, mobile polish; **F6 i18n DEFERRED**)
- Stream G — 5 verification items folded into Wave 1

Plus Wave 4 — 13 test phases — and Wave 5 — final convergence.

---

## NON-NEGOTIABLES (do not violate)

1. **Pure autonomy.** Do not ask. Do not pause between phases. Do not pause between waves. Do not pause to summarize for the user. Do not produce intermediate reports beyond the per-wave self-review files (`WAVE_<N>_REVIEW.md`) which are internal artifacts, not user reports. The user will see the final `SHIP_READY.md` only. No status updates to the user mid-run.

2. **No compromise.** No "deferred to next pass" unless the work is genuinely AI-impossible (operator action, firm engagement, mainnet tx, credential not in env after exhausting the 8-step checklist). Re-read the 8-step DON'T-GIVE-UP CHECKLIST in `TEST_BRIEF.md` before flagging anything HUMAN_ACTION_REQUIRED.

3. **No easy way.** Every fix follows `FIX_BRIEF.md` Step 1–7 — understand → consult docs → plan → implement → verify → document → regression-net. No `as any`, no `// @ts-ignore`, no silent catches, no half-finished work, no TODO comments left behind.

4. **Cross-language parity is sacred.** Any change that touches ix data, kernel commit, or canonical JSON updates TS + Python + Rust + their goldens together. Re-run the parity smokes after every parity-affecting change. Never commit a fix that breaks parity.

5. **NVIDIA NIM is the canonical LLM.** Every feature that needs an LLM call routes through `apps/web/lib/nvidia-nim.ts` (you will create this in Wave 0). No OpenAI, no Anthropic, no paid APIs anywhere unless the existing code already uses one — and even then swap to NIM when you touch that path. Smoke-test the NIM endpoint in Wave 0 before any feature relies on it.

6. **No paid services.** No Sentry DSN provisioning, no npm publish, no audit firm engagement, no mainnet rotation. Those are operator actions. Document them in `HUMAN_ACTIONS.md` if you encounter the need.

7. **Self-review between waves is mandatory.** After Wave 1, Wave 2, Wave 3, run the regression net (typecheck + harnesses + Playwright + Cycle 1 closures). Write `WAVE_<N>_REVIEW.md` documenting what shipped, what didn't, what surprised, devnet SOL spent so far. If regressions found, fix BEFORE proceeding.

8. **Wave 4 is non-negotiable.** Every feature built in Waves 1-3 gets tested as a real user would test it, end-to-end. The 8-step DON'T-GIVE-UP checklist applies to every test that "feels hard". Find a way. Do not skip.

9. **Bulletproof completion criteria per stream** (already in plan). Each stream is CLOSED only when ALL of: files exist + typecheck clean + verification passes + new tests added + FINDINGS updated + PROJECT_STATUS updated + the wave's self-review passes.

10. **Anti-drift rules** (already in plan). Re-read every wave start.

11. **Anchor deploy is AI-attempt** (per plan E1). CLI present, keypair present. Run `anchor build` + `anchor deploy --provider.cluster devnet`. If it fails (insufficient SOL, auth mismatch, network), document remediation in `HUMAN_ACTIONS.md` and continue the rest of the plan. Do not stop the entire run because of E1.

12. **Devnet SOL is unlimited per user direction.** Spend whatever's needed. Track total in `SHIP_READY.md`. Estimate from plan: ~0.5-1.0 SOL across all waves.

13. **No middle reports to the user.** Self-review files are internal. The user expects exactly one output at the end: a rewritten `SHIP_READY.md`. Do not chat-message the user a status update mid-run unless a STOP CONDITION fires.

14. **Use sub-agents for parallelism where streams are independent** (Stream B + G + F4 in Wave 1; C + D in Wave 2; E + F in Wave 3). Each sub-agent gets a self-contained prompt that includes the plan reference + the stream's scope. Sub-agents update findings/progress files directly so their work persists even if context compacts.

15. **No git commits, no git push, no git branch operations.** AI works on the local tree only. The user pushes when ready.

---

## CONVERGENCE DEFINITION (when you stop)

You stop ONLY when ALL of these hold simultaneously:

- `docs/audit/FINDINGS.md` has zero entries with status that isn't CLOSED, ACCEPTED, or HUMAN_ACTION_REQUIRED (with the 8-step checklist exhausted in writing).
- `docs/audit/WAVE_4_TEST_REPORT.md` shows zero FAIL or HARD_FAIL entries.
- `pnpm -r typecheck` green across all 9 workspaces.
- All 3 SDK test runners pass.
- All keypair harnesses pass on devnet (e2e + idempotency + streaming + all-intents post-deploy).
- Full Playwright suite passes (existing + every new spec from Wave 4).
- A final audit-pass-after-Wave-4 produces zero NEW findings (or only DOC_DRIFT-class).
- One full audit→test→fix cycle (Wave 4 → Wave 5) ran clean.

When convergence holds, **overwrite** `docs/audit/SHIP_READY.md` with the new state:

- Total findings (must be 0 + N HUMAN_ACTION_REQUIRED).
- Total test count (post-Wave-4).
- Total cycles run.
- Total devnet SOL spent across all waves.
- Total wall time.
- New shipped features list (the 26 from Waves 1-3).
- Mainnet readiness verdict.
- Confidence level (must be High).

After overwriting `SHIP_READY.md`, stop. Output a single short final message to the user: a 5-line summary pointing them at the file. That is the ONLY user-facing message.

---

## STOP CONDITIONS (only these — pause and surface to user)

1. A required action is genuinely destructive (`DROP TABLE`, force-push to main, mainnet tx) — describe what you'd do and ask.
2. A confirmed BLOCKER has live financial exposure RIGHT NOW (active mainnet funds at risk).
3. Devnet SOL exhausted past 3 SOL across all activity.
4. A verification needs a credential that is NOT in `.env.local` AND that the 8-step checklist couldn't work around. Document specifically what's needed and why.
5. The plan file (`PLAN_DEVNET_BACKLOG.md`) has been mutated mid-run by the user (a manual edit). Reread and confirm.

Everything else: continue.

- Phase complete → next phase, no pause.
- Wave complete → self-review file → next wave, no pause.
- Lots of findings → document and continue.
- Slow command → run it, use background + ScheduleWakeup if > 10 min.
- Complex fix → read more, plan harder, implement.
- Failed test → file finding → fix per FIX_BRIEF Step 1-7 → re-run → continue.
- Tempting refactor opportunity → resist; only the cited issue.
- Sub-agent finished with a result → integrate, continue main thread.

---

## START NOW

1. Verify starting state (read all listed briefs + run baseline regression).
2. Open `PLAN_DEVNET_BACKLOG.md` and execute Wave 0 (pre-flight: NVIDIA NIM smoke test, env keys, anchor CLI verify, baseline regression).
3. Execute Wave 1 (quick wins + receipts + verifications + revoke banner) → run self-review → write `WAVE_1_REVIEW.md`.
4. Execute Wave 2 (discovery + dev surfaces) → self-review → write `WAVE_2_REVIEW.md`.
5. Execute Wave 3 (polish + activation incl. anchor deploy attempt) → self-review → write `WAVE_3_REVIEW.md`.
6. Execute Wave 4 (full E2E test pass: T-W4-1 through T-W4-13) → write `WAVE_4_TEST_REPORT.md`.
7. Execute Wave 5 (audit pass 4 + final convergence) → overwrite `SHIP_READY.md`.
8. Output a single 5-line summary to the user pointing at `SHIP_READY.md`. Stop.

**Do not ask whether to start. Do not ask whether to continue between waves. Do not produce status updates to the user mid-run. Begin now and run all 6 waves (0-5) in a single autonomous pass. Until convergence is reached or a documented STOP CONDITION fires, you do not stop.**
