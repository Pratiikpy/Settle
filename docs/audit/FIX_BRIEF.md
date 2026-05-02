# Settle Protocol — Proper Fix Mode (autonomous, no compromises)

You are a senior protocol engineer + framework expert + security-aware refactorer. The audit and testing passes are complete. `FINDINGS.md` lists every issue. `TEST_REPORT.md` lists every failure. Your job is to fix them — properly, completely, and without taking shortcuts.

**This is the no-easy-way mode.** Each fix must be the right fix, not the fastest fix. You will read official docs. You will read all related files, not just the cited file. You will plan before coding. You will verify before declaring done.

---

## THE FIX PROTOCOL (mandatory per finding)

For every finding ID in `FINDINGS.md` and every failure in `TEST_REPORT.md`:

### Step 1 — Understand
- Read the finding end to end.
- Read EVERY file cited in the finding. Not skim — read.
- Read the upstream callers and downstream consumers of every function involved (use Grep to find references).
- Read related migrations if a DB column is involved.
- Read related Anchor instructions if program logic is involved.
- Read the SDK builder if an ix-data shape is involved (TS, Python, Rust — all three).
- Re-read the audit's `FEATURE_TRACEABILITY_MATRIX.md` row for this feature to understand intended behavior.

### Step 2 — Consult docs
- For any framework/library involved: **WebFetch the current official docs**. Cite the URL in your fix commit message + plan note.
- For Anchor: read the relevant section of the Anchor book.
- For Supabase: read the relevant RLS / migrations / client doc.
- For React/Next.js: read the relevant App Router / hooks doc.
- For Solana web3.js: read the relevant API.

### Step 3 — Plan
Before writing code, write the plan in your response (1–3 paragraphs):
- Root cause (not symptom)
- The fix at conceptual level
- Files that will change + why
- Files that will NOT change but were considered (and why they don't need to change)
- Test that will verify the fix
- Risk: what could break
- Rollback path

### Step 4 — Implement
- Smallest correct change that fully resolves the root cause. No collateral refactors.
- Match existing code style.
- Update or add types.
- Update or add tests so the regression is caught next time.
- Update relevant docs (`PROJECT_STATUS.md`, README sections, inline comments where the WHY is non-obvious).
- Cross-language: if the fix touches an ix-data builder or kernel commit, update TS + Python + Rust + their goldens. Re-run parity smoke.

### Step 5 — Verify
- `pnpm -F @settle/web typecheck` (and any other affected workspace) → green.
- Affected unit tests → green.
- Affected smoke / parity scripts → green.
- The exact "How to verify the fix" command from the finding → produces expected output.
- For on-chain fixes: run a live devnet harness; capture a confirmed sig.
- For UI fixes: run the relevant Playwright spec; confirm screenshot + state assertions.
- For RLS / DB fixes: query Supabase before + after; confirm policy actually rejects/allows correctly.

### Step 6 — Document the fix
Append a "Fix Log" entry to the finding in `FINDINGS.md`:
```
Fix log:
- Date:
- Files changed: [paths with line ranges]
- Doc URLs consulted:
- Test added: [test ID + path]
- Verification command + output:
- Status: CLOSED
```

### Step 7 — Run the regression net
After every fix, before moving to the next finding:
- Run the full Layer A keypair harnesses (`phase5-live-test.ts`, `idempotency-drill.ts`)
- Run the Layer B Playwright suite
- Run typecheck across all workspaces
- Confirm no NEW failure appeared

If a fix introduced a regression, revert + re-plan. Don't pile fixes on top of broken fixes.

---

## NON-NEGOTIABLE FIX RULES

1. **No partial fixes.** A finding is CLOSED only when the root cause is resolved AND a test prevents regression AND verification command passes.
2. **No "we'll fix that later" comments.** If you see a related issue while fixing, file a new finding ID; don't ignore.
3. **No `as any`, no `// @ts-ignore`, no `eslint-disable`** unless paired with a comment explaining the specific framework limitation forcing it AND a follow-up finding to revisit.
4. **No silent fallbacks.** If a fix path can fail, surface the failure (toast / log / Sentry capture).
5. **No copy-paste between TS/Python/Rust.** If fix touches one SDK, all three must align (parity is the contract).
6. **No skipping the doc fetch.** Reading current docs before fixing prevents using deprecated APIs.
7. **No batching unrelated fixes into one commit.** One finding = one logical change set.
8. **No fixing tests to make them pass when the test was correct.** If the test failed and the test was right, fix the code, not the test.

---

## PRIORITIZATION

Follow `FINAL_AUDIT_REPORT.md`'s prioritized fix plan exactly:
1. BLOCKER first (mainnet-blocker, fund-loss, auth-bypass, RLS-hole, double-spend)
2. HIGH next (silent fail, broken intent, indexer drift, money-flow error state)
3. MEDIUM
4. LOW
5. DOC_DRIFT last (often tied to other fixes)

Within a tier, fix in dependency order: program-level → SDK-level → API-level → UI-level → docs. A bug in the program will surface in SDK + API + UI; fix the source first.

---

## CROSS-CUTTING FIX CATEGORIES (apply systematically)

### Supabase bigint number/string handling
We already found one (`amount_lamports`). Sweep for the rest. Every place that reads a bigint column from Supabase must coerce with `String()` or `BigInt()` explicitly before passing to validators.

### Streaming claim landing
Kernel commit is fixed. On-chain landing requires open_streaming pact. If the audit found this as a HIGH/BLOCKER, build the streaming pact harness + add it to `phase5-live-all-intents.ts`. Don't defer.

### Mobile polish
For every UX_NOT_REACHABLE finding on mobile: add bottom-nav or sticky-header so primary actions are reachable at 390×844 without scroll.

### i18n
For every error toast that leaks codes: route through the i18n layer with friendly translations.

### Card revoke → orphaned schedules
For every UX gap: surface a "this card is revoked; pick a new one" prompt on every page that lists schedules using that card.

### Native receipt webhook retry
Mirror the federation retry mechanism for native receipts.

### Anchor program audit prep
Don't run the audit yourself. Write the threat-model doc + scoping letter + collect findings from Phase 11 of the audit. Output a clean PR-ready bundle for an external firm.

---

## STOP CONDITIONS

You stop and report only when:
1. A fix requires a destructive action (DROP TABLE, force-push, mainnet tx).
2. A fix requires a credential / human action genuinely unavailable.
3. All findings are CLOSED and all test failures are resolved (= success state).
4. You've made 50 fix attempts in one autonomous run (cap to prevent runaway).

You do NOT stop for:
- Lots of findings.
- Slow tests (use background + ScheduleWakeup).
- Complex fix (read more, plan harder, then fix).
- Tempting refactor opportunity (resist; only fix the cited issue).

---

## START NOW

1. Read `FINDINGS.md` end to end.
2. Read `TEST_REPORT.md` end to end.
3. Read `FINAL_AUDIT_REPORT.md`'s prioritized fix plan.
4. Open the highest-severity unclosed finding.
5. Run the FIX PROTOCOL (Steps 1–7).
6. Mark it CLOSED in `FINDINGS.md`.
7. Move to the next.
8. Continue until all findings closed OR a STOP CONDITION triggers.

When complete, write `docs/audit/FIX_REPORT.md`:
- Total findings closed
- Total findings remaining (with reason)
- Tests added (count + paths)
- Devnet SOL spent
- Net diff size (lines added/removed)
- Confidence the codebase is now in better state

Do not ask before starting.
