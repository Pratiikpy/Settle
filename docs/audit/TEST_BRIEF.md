# Settle Protocol — Real-User End-to-End Test (autonomous)

You are a senior QA engineer + automation engineer + Solana protocol tester. The audit is complete. Findings are in `docs/audit/FINDINGS.md`. Now you are running the **testing pass**: every feature this product claims to offer, exercised the way a real user / real agent / real merchant / real cron would exercise it.

This is NOT unit testing. This is end-to-end product validation. You will use the actual UI, actual RPC, actual Supabase, actual Phase 5 cron loop. You will land real txs on devnet. You will take screenshots, validate visual output, assert state at every layer.

**The hard rule: do not give up on a test because it's hard.** Every flow this product claims to support has a way to test it. Find it. Use Playwright for UI. Use keypair harnesses for on-chain. Use direct Supabase queries for state. Use Network throttling for failure modes. Use multiple browser contexts for concurrency. Use the Anchor test framework for program-level. Use sub-agents in parallel for breadth.

The ONLY tests you skip are ones that need a credential / faucet / human action you genuinely cannot perform. You document those in `HUMAN_ACTIONS.md` with the exact reason.

---

## SCOPE — what to test

Every flow listed in `docs/audit/FEATURE_TRACEABILITY_MATRIX.md` AND `docs/audit/INTEGRATION_GRAPH.md`. Plus everything in PROJECT_STATUS.md marked "complete" or "shipped".

Concretely (non-exhaustive — derive complete list from audit docs):

**User flows:**
- Connect wallet → see dashboard with empty state
- Spawn AgentCard (create_card via UI) → on-chain confirmed → indexer mirrored → /cards shows the new card
- Open Pact → vault funded → /cards/[id] shows pact + balance
- Spend via Pact → on-chain confirmed → indexer wrote receipt → /receipts/[id] renders with hash chain → /verify confirms
- Direct send → tx confirms → recipient ATA balance updates → ledger shows entry
- Send via link → recipient claims → escrow drains → claim attribution lands
- Schedule a recurring send (/wishes) → cron tick picks it up → cron signer fires → receipt + execution row
- Auto-refill rule fires when threshold crossed
- Round-up rule fires after a triggering spend
- Group spend: create request → vote to quorum → cron fires
- Allowance: parent creates → kid spawns spending card → daily cap enforced
- Gift: send → claim flow → receipt
- Gift: send → expire → refund flow
- Streaming pact: open → claim works (or document why it can't on devnet) → pause → resume
- Delivery escrow: open → release → dispute path
- Refund flow: post-receipt → linkage row → /receipts shows refund linkage
- Split bill flow
- Collab payment flow
- Save-for-X bucket
- Capability registry: merchant publishes spec → cap_hash matches → /verify shows the alias

**Merchant flows:**
- Create merchant profile (/m/[handle])
- Verify domain via DNS TXT
- Publish capabilities → cap_hash computed
- Receive a payment → /m/[handle]/manage shows it
- Dispute flow with AI draft
- Webhook self-serve setup → test ping → signature verifies
- Analytics page renders with real data

**Admin flows:**
- /admin/preflight gates pass for current env
- /admin/cron debug + manual trigger
- /admin/federation/origins promote/demote
- /admin/health shows real numbers

**Agent flows:**
- demo-agent uses MCP middleware to spend
- SDK consumer signs + submits + verifies receipt

**Cross-cutting:**
- Wallet disconnect mid-flow → graceful error
- Network failure mid-tx → loud failure, no fake success
- Expired blockhash → retry path
- Insufficient SOL → error toast
- Insufficient USDC → error toast
- Revoked card → fire fails loud
- Closed pact → fire fails loud
- Cap exceeded → on-chain reject visible in UI
- Phantom popup cancel → app recovers cleanly

---

## TESTING TOOLKIT (what to use, no excuses)

**For UI flows:** Playwright with the burner adapter (already wired via `NEXT_PUBLIC_E2E_BURNER=1`). For flows needing real wallet popup behavior, use the existing burner-driven approach (covers 95% of wiring).

**For visual regression:** Playwright `page.screenshot()` with `toMatchSnapshot()`. Take baselines of every Phase 5 surface (desktop + tablet + mobile viewports). Diff on subsequent runs. Stage screenshots under `apps/web/e2e/__screenshots__/`.

**For on-chain landing:** existing keypair harnesses (`scripts/e2e-payment-flow.ts`, `phase5-live-test.ts`, `phase5-live-all-intents.ts`, `phase5-idempotency-drill.ts`). Extend if features lack a harness — add new scripts under `scripts/test/`.

**For Supabase state:** direct service-role queries via `@supabase/supabase-js`. Assert exact row counts, exact field values.

**For Anchor program logic:** `anchor test` in `programs/settle-agent-card/`. Write new tests if existing are stale.

**For SDK parity:** re-run `smoke-multikind-goldens.ts`, `smoke-ix-data-parity.ts`, `smoke-python-parity.ts`, Rust + Python test suites.

**For network failure modes:** Playwright `page.route()` to intercept + fail specific requests.

**For race conditions:** spawn multiple browser contexts concurrently; submit competing operations; assert no double-spend, no duplicate row, correct dedup.

**For accessibility:** Playwright + `@axe-core/playwright`. Assert no violations on every Phase 5 surface.

**For performance:** Playwright `page.metrics()` + `performance.timing`. Set budgets: home < 2s LCP, dashboard < 3s LCP. Fail tests that exceed.

**For mobile:** raw 390×844 viewport (avoids webkit dep). Repeat key flows.

**For load / concurrency stress:** sequential script that fires 10 scheduled_sends concurrently and asserts dedup logic + queue integrity.

**For "claude gives up" prevention:** if a test seems impossible, **try at least 3 alternative approaches** before flagging human-action. Document what you tried.

---

## DON'T-GIVE-UP CHECKLIST (mandatory for every "I can't test this" claim)

Before flagging a test as `HUMAN_ACTION_REQUIRED`, you MUST have tried:

1. Did you try Playwright with the burner adapter?
2. Did you try a keypair-based programmatic harness?
3. Did you try direct Supabase service-role write to set up state, then trigger flow?
4. Did you try `page.route()` interception to mock the missing dependency?
5. Did you try setting `NEXT_PUBLIC_E2E_*` env flags to enable test-only code paths?
6. Did you try writing a small audit-only Anchor instruction or DB seeding helper?
7. Did you try sub-agents in parallel for breadth?
8. Did you check if the user already has the credential in `.env.local`?

Only after all 8 fail with documented reasoning do you mark `HUMAN_ACTION_REQUIRED`. Examples of GENUINE human-only:
- Claiming devnet faucet SOL when rate-limited
- Mainnet txs (we don't go there yet)
- Third-party admin dashboard (Helius project setup, Sentry org create)
- Phantom mobile deeplink testing on a physical iOS/Android device

Examples of NOT genuine (you can do these):
- "Need a wallet to test wallet flow" → use burner adapter
- "Need USDC to test payments" → existing test-wallet has it
- "Need the cron to fire" → curl the endpoint with CRON_SECRET
- "Need indexer running" → use direct Supabase upsert to mirror state
- "Visual test needs human eye" → screenshot diff
- "Mobile needs real device" → 390×844 viewport in Chromium

---

## TESTING PHASES

### T0 — Inventory + plan

Read `docs/audit/FEATURE_TRACEABILITY_MATRIX.md`, `INTEGRATION_GRAPH.md`, `FINDINGS.md`. Build the full test list. Create `docs/audit/TEST_PLAN.md` with every test ID, scope, expected outcome, fixtures needed.

### T1 — Static + parity tests (cheap, fast — run first)

- `pnpm typecheck` — must be zero errors
- `pnpm test` — full vitest suite
- `pnpm tsx scripts/smoke-multikind-goldens.ts`
- `pnpm tsx scripts/smoke-ix-data-parity.ts`
- `pnpm tsx scripts/smoke-python-parity.ts`
- `cargo test` in `packages/rust-sdk`
- `pytest` in `packages/python-sdk`
- `anchor test` in `programs/settle-agent-card`
- `pnpm tsx scripts/check-idl-drift.ts`

For each: capture pass/fail/duration. Any failure = HARD_FAIL.

### T2 — On-chain integration tests (keypair harnesses)

- `pnpm tsx --env-file=.env.local scripts/e2e-payment-flow.ts`
- `pnpm tsx --env-file=apps/web/.env.local scripts/phase5-live-test.ts`
- `pnpm tsx --env-file=apps/web/.env.local scripts/phase5-live-all-intents.ts`
- `pnpm tsx --env-file=apps/web/.env.local scripts/phase5-idempotency-drill.ts`

For any flow not covered by an existing harness: **write a new harness** under `scripts/test/` and run it. Don't skip.

Track: every flow → confirmed sig + Solscan URL + Supabase row delta + total devnet SOL spent.

### T3 — UI Playwright suite (existing + extended)

Run the existing 20 tests. Then **add new tests** for every UI flow not already covered. Targets:

- Cards: spawn → confirm → list shows new card → click → /cards/[id] renders pact + balance + bulk-close
- Wishes: create scheduled send → see in list → click "Spawn Pact" → flow completes
- Allowances: create allowance → kid view shows it → spawn kid card flow
- Groups: create group → create request → vote → quorum_met state visible → fire trigger
- Spending: auto-refill rule create → status shown
- Send: form fills → resolve → sign → confirm → toast → receipt link
- Send/voice: voice input → intent parse → form prefills
- Send/link: claim flow
- Receipts/[id]: hash chain renders, refund linkage when present, PDF print page works
- Verify: paste a sig, see verification result
- Federation origins admin: promote → demote → re-list
- Merchant profile + verify-domain UX (skip the actual DNS TXT publish — use stub)
- Settings/relayer: setup flow

Per test: assert UI state + Supabase row state + (where on-chain) tx confirmed.

### T4 — Visual regression suite

For every Phase 5 surface, take screenshots at:
- Desktop 1280×800
- Tablet 768×1024
- Mobile 390×844

Both connected (burner) and disconnected states. Store under `apps/web/e2e/__screenshots__/`. On second run, diff. Threshold: zero pixel changes outside expected dynamic regions.

### T5 — Failure mode tests

For every primary flow, deliberately inject a failure and verify the UI fails gracefully:
- Wallet disconnect mid-sign
- Insufficient SOL (Playwright `page.route()` to mock OR fresh unfunded burner)
- Insufficient USDC
- Revoked card path (mark revoked in Supabase mirror, attempt spend)
- Closed pact path
- Cap exceeded path
- Network failure (`page.route(/api\/.*/, route => route.abort())`)
- Slow network (`page.route` with `await new Promise(r => setTimeout(r, 5000))`)
- Indexer lag (set last receipt to 1 hour old; verify health page shows lag warning)

For each: assert no fake success, no silent failure, error toast with actionable message, no JS console errors.

### T6 — Race condition + concurrency tests

- Spawn 5 concurrent browser contexts; each fires the same scheduled_send simultaneously. Assert: exactly 1 phase5_executions row, exactly 1 on-chain spend.
- Two browsers same wallet attempting create_card with same label simultaneously → one succeeds, one fails cleanly.
- Cron tick + cron signer fire interleaved (run them as Promise.all). Assert no race in last_fired_at advancement.

### T7 — Accessibility audit

`@axe-core/playwright` on every Phase 5 surface. Zero violations target. Document any blocking violations as findings.

### T8 — Performance budget

Playwright performance metrics on every Phase 5 surface. Budgets:
- LCP < 2.5s
- FID/INP < 200ms (where measurable)
- Bundle size of `apps/web/.next/static` JS < 1.5MB total

Document violations.

### T9 — Multi-language SDK consumer simulation

- TS consumer: import `@settle/sdk`, build a kernel commit, verify with another instance — golden hex matches
- Python consumer: same
- Rust consumer: same
- All three: verify a real on-chain receipt sig + slot, output identical `kernel_hashes`

### T10 — MCP middleware end-to-end

Spawn an MCP client, call the tool definitions, assert correct tx is built + signed + landed.

### T11 — Final E2E orchestration

A single Playwright test that walks the entire happy path:
1. Connect (burner)
2. Create card
3. Open pact
4. Schedule a daily send
5. Wait for cron tick (or curl it)
6. Wait for cron signer (or curl it)
7. See receipt in /receipts
8. Verify receipt via SDK
9. Disconnect
10. Reconnect
11. See state preserved

If this passes, the product works end-to-end for a single user.

### T12 — Test report

`docs/audit/TEST_REPORT.md`:
- Per test ID: PASS / FAIL / SKIPPED (with reason) / HUMAN_ACTION_REQUIRED (with attempted approaches)
- Total devnet SOL spent
- Total wall-clock time
- Failure list with exact reproduction steps
- Performance budget compliance
- Accessibility violation count
- Visual regression delta count

Cross-reference every FAIL with a finding ID in `FINDINGS.md` (creating new IDs if the test surfaced a bug not in the audit).

---

## NON-NEGOTIABLE TESTING RULES

1. **No test marked PASS without evidence.** Sig + Solscan URL + Supabase row OR Playwright screenshot OR test output dump.
2. **No flaky tolerance.** A test that fails 1/5 runs is a FAIL — race condition or real bug. Hunt it.
3. **No "looks like it worked" assertion.** Compare actual values to expected.
4. **No skip without 8-step justification.** See DON'T-GIVE-UP CHECKLIST above.
5. **Every failure becomes a finding** in `FINDINGS.md` (new ID, severity, evidence, fix-verification command).

---

## START NOW

Create `docs/audit/TEST_PLAN.md` from the audit's traceability matrix. Run T0 → T12 in order. Update `docs/audit/AUDIT_PROGRESS.md` with `TEST_*` rows. When complete, write `TEST_REPORT.md`.

Do not ask before starting. Do not pause between phases. Do not skip without exhausting alternatives.
