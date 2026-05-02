# Settle Protocol — Master Orchestrator (audit → test → fix → loop until perfect)

You are running the full ship-readiness pipeline. There are three phases and they cycle until convergence:

```
   ┌─────────┐    ┌─────────┐    ┌────────┐
   │  AUDIT  │───▶│  TEST   │───▶│  FIX   │
   └─────────┘    └─────────┘    └───┬────┘
        ▲                            │
        └────────────────────────────┘
        loop until: zero open findings + all tests green
```

Each cycle uses the corresponding brief:
- `docs/audit/AUDIT_BRIEF.md`
- `docs/audit/TEST_BRIEF.md`
- `docs/audit/FIX_BRIEF.md`

---

## CONVERGENCE CONDITION

The loop terminates ONLY when ALL of these hold simultaneously:

1. `FINDINGS.md` has zero entries with status != CLOSED
2. `TEST_REPORT.md` has zero entries with result FAIL or HARD_FAIL
3. The full pipeline ran clean for one complete cycle (no new findings introduced)
4. Typecheck green across all workspaces
5. Mainnet readiness gate (BLOCKER + HIGH count = 0)

Or one of the hard stops triggers:
- Iteration cap reached (default: 5 cycles)
- Genuine human-action blocker (documented in `HUMAN_ACTIONS.md`)
- Devnet SOL budget exhausted (3 SOL across all cycles)

---

## RUN PROTOCOL

### Cycle N

**Pass 1 — Audit**
Execute `AUDIT_BRIEF.md` Phases 0–15 in full. Output: `FINDINGS.md` (cumulative — new findings appended; existing findings re-verified).

**Pass 2 — Test**
Execute `TEST_BRIEF.md` Phases T0–T12 in full. Output: `TEST_REPORT.md`. New failures append to `FINDINGS.md` with `T-` prefix.

**Pass 3 — Fix**
Execute `FIX_BRIEF.md` until either: all findings CLOSED, or 50 fix attempts consumed, or hard stop. Output: `FIX_REPORT.md`.

**Pass 4 — Convergence check**
Read `FINDINGS.md` + `TEST_REPORT.md` + run typecheck. If convergence condition met → write `SHIP_READY.md` and stop. Else → log cycle in `AUDIT_PROGRESS.md` and start Cycle N+1.

---

## TRACKING

Every cycle, append to `docs/audit/AUDIT_PROGRESS.md`:

```
## Cycle N — [date start] → [date end]
- Findings start: X
- Findings end: Y
- New findings introduced: Z
- Findings closed: W
- Tests pass/fail/skipped: A/B/C
- Devnet SOL spent: 0.XX
- Wall time: NhMm
- Convergence reached: yes/no
- Notes:
```

If convergence isn't reached after 5 cycles, halt and write `docs/audit/STUCK_REPORT.md` documenting why — usually one of:
- A finding requires architectural change beyond fix scope (escalate)
- A library is missing a feature we depend on (escalate)
- A flaky test that resists fix (deeper investigation)
- A genuine human-only action

---

## NON-NEGOTIABLE ORCHESTRATION RULES

1. **Never run TEST without AUDIT having completed**: tests are designed against findings.
2. **Never run FIX without TEST having completed**: fixes are designed against confirmed failures, not assumed bugs.
3. **Never declare ship-ready without convergence**: 4 conditions all hold.
4. **Never silently re-fix the same finding**: if Cycle N+1's audit re-discovers a Cycle N "closed" finding, that's a meta-bug — the original fix didn't work. Document it as `REGRESSION` severity HIGH.
5. **Never skip the convergence check**: even if everything looks green, run the verification.
6. **Never modify the brief files** (`AUDIT_BRIEF`, `TEST_BRIEF`, `FIX_BRIEF`, this `MASTER_BRIEF`). They are the contract.

---

## START NOW

1. Verify all four brief files exist in `docs/audit/`. If missing, halt and request them.
2. Initialize `AUDIT_PROGRESS.md` with cycle counter = 1.
3. Begin Cycle 1, Pass 1 (AUDIT_BRIEF Phase 0).
4. Continue all four passes for Cycle 1.
5. Run convergence check.
6. If not converged, begin Cycle 2.
7. Continue until convergence or hard stop.
8. On convergence: write `docs/audit/SHIP_READY.md` with:
   - Final findings count (must be 0)
   - Final test pass count
   - Total cycles run
   - Total devnet SOL spent
   - Total wall time
   - Mainnet readiness verdict (the one and only Yes)
   - Confidence level (must be High)

Do not ask before starting. Do not pause between phases. Do not pause between cycles.
