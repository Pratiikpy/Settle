# HUMAN_BLOCKERS — autonomous run inbox

> The autonomous test runner appends entries here whenever it needs you.
> It does NOT pause the run. It keeps testing every other thing it can.
> Read top-to-bottom; check items off when handled; runner picks them up
> on next loop tick.

## Status legend

- 🔴 **HARD BLOCKER** — runner cannot make progress on the affected suite until you handle it
- 🟡 **SOFT** — affects coverage but other suites continue
- 🟢 **DONE** — handled

---

## Open blockers

### 🟢 DONE — Program redeployed; spend_via_pact fixed (commit 89ab171)
- **Resolved:** 2026-05-03 06:51
- **Root cause** (different from earlier hypothesis): not a stale binary — a real bug in HEAD source. With 12 accounts on `SpendViaPact` (including a 329-byte Pact allowlist Vec + AgentCard with 654-byte allowlist), Anchor's account-validation deserialized them all directly onto the 4 KB BPF stack and overflowed at frame 5.
- **Fix:** `Box<Account<...>>` for the 5 large accounts (`card`, `pact`, `usdc_mint`, `vault_usdc`, `merchant_usdc`) in `spend_via_pact.rs` — moves data to heap, leaves only thin pointers on the stack.
- **Verified end-to-end on devnet:** `pnpm tsx scripts/e2e-payment-flow.ts` passes all 4 steps (create_card → open_pact → spend_via_pact 1→0.5 USDC → record_receipt). Phase 5 idempotency drill PASSES (1 spend, 0 replay duplicates). `smoke-verify-build` re-aligned via regenerated `build-info.json`.
- **History (original report):**
- ~~Where:~~ Anchor program `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD` on devnet
- ~~Symptom (compound):~~
  - ~~`scripts/smoke-verify-build.ts`: local source hash `407e0630…` ≠ on-chain hash `dde6499f…`. Sizes differ (451672 local vs 493944 on-chain).~~
  - `scripts/e2e-payment-flow.ts`: on the SAME deployed binary, `spend_via_pact` panics with "Access violation in stack frame 5 at address 0x200005fa8 of size 8" after only 2944 CU. `create_card` and `open_pact` work fine; `spend_via_pact` is the broken codepath.
- **Likely root cause:** the on-chain binary was built from an older commit that has a bug in spend_via_pact's account/seed math. HEAD source has fixed it (or has different layout) but no redeploy has happened.
- **Action:** `bash scripts/deploy-devnet.sh` to redeploy the program from HEAD. Then re-run `pnpm tsx scripts/e2e-payment-flow.ts` — should succeed all 4 steps (create_card + open_pact + spend_via_pact + DB poll).
- **Affected gates:** Section 23 (all 14 Anchor ix on-chain), Test 34 (verifiable build), Section 53 "All 14 Anchor instructions execute on devnet" + "Verifiable build hash matches". This single redeploy fixes both blockers at once.
- **Verified ix that DO work on current binary (so far):**
  - `create_card` — real tx 4iwaA11A...
  - `open_pact` — real tx 2RUd7wr8...
  - `record_receipt` — real tx M5gY3yC... (Path A direct-send + receipt mint)
- **Verified ix that BREAK on current binary:**
  - `spend_via_pact` — Access violation reproduced 3× (e2e-payment-flow, phase5-live-test, phase5-idempotency-drill all hit it)
- **Downstream tests blocked by spend_via_pact:** scheduled sends, allowance kid spends, agent x402 spends, refunds via pact, claim_streaming, release_delivery_escrow (anything that takes from a pact vault). After redeploy, ~30 cascading test rows currently in "blocked" state should automatically progress.

### 🟡 SOFT — Anchor `before all` tests fail without local validator
- **Where:** `programs/settle-agent-card/tests/*.ts` mocha suite
- **Symptom:** `Error: ANCHOR_PROVIDER_URL is not defined`
- **Likely cause:** anchor tests expect either `anchor test` (which spins up `solana-test-validator`) or a pre-set `ANCHOR_PROVIDER_URL`
- **Action:** run `cd programs/settle-agent-card && anchor test` (boots local validator); OR set `ANCHOR_PROVIDER_URL=https://api.devnet.solana.com` + `ANCHOR_WALLET=$HOME/.config/solana/id.json` before `pnpm test`
- **Affected gates:** Section 23 (Anchor ix on-chain coverage)

### 🟢 DONE — Dev server reconfigured with burner adapter
- Killed old dev (PID 4524), restarted with `PORT=3001 NEXT_PUBLIC_E2E_BURNER=1 pnpm dev:web`
- Listening on http://localhost:3001 (PID 19884)
- For Playwright: `PLAYWRIGHT_BASE_URL=http://localhost:3001`
- NOTE: Port 3000 still occupied by an older user-process (PID 40804, started 23:04 — left untouched per rule against killing user state)
- Resolved: 2026-05-03 00:48

### 🟡 SOFT — Some smoke scripts don't auto-load `.env.local`
- **Where:** `scripts/smoke-receipt-importer.ts` (and likely others)
- **Symptom:** `supabaseUrl is required` because `process.env.NEXT_PUBLIC_SUPABASE_URL` is undefined when run via `pnpm tsx`
- **Action:** add `import "dotenv/config"` at top of those scripts, OR run with `--env-file .env.local`, OR export env vars before running
- **Affected gates:** various smoke scripts

### 🟡 SOFT — sign-tx-wiring test: stale selector `input[placeholder='@elena']`
- **Where:** `apps/web/e2e/sign-tx-wiring.spec.ts:24`
- **Symptom:** Test waits for an input with placeholder `@elena` on `/send` but it's not found (UI changed; placeholder differs)
- **Action:** open `apps/web/app/send/page.tsx`, find the actual recipient handle input placeholder, update the test's locator to match. One-line fix.
- **Affected gates:** wallet-signing flow gate (only this one test)

### 🟡 SOFT — final-e2e T11 timeout navigating /cards
- **Where:** `apps/web/e2e/final-e2e.spec.ts:12`
- **Symptom:** `page.goto('/cards')` times out at 90s. Cold dev compile of /cards plus prior pages can exceed window; the global setup pre-warms but T11 visits more.
- **Action:** Either (a) bump the per-test timeout from 120s to 240s for T11, or (b) pre-warm /cards in global setup, or (c) ensure dev cache stays warm between specs (run T11 last). Recommended: pre-warm the route in global setup.
- **Affected gates:** end-to-end happy path gate

### 🟡 SOFT — Visual-regression baselines stale (16 mismatches)
- **Where:** `apps/web/e2e/visual-regression.spec.ts-snapshots/*`
- **Symptom:** Page heights have grown (e.g., send-mobile 1153px → 1536px). Functional behavior correct; baselines were captured at older content height.
- **Action:** After a UI/content freeze, regenerate via `cd apps/web && PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test visual-regression --update-snapshots`, then commit new PNGs. Visual gate passes only after a fresh capture is in repo.
- **Affected gates:** Section 1 visual fidelity, Section 53 visual checklist
- **NOTE:** these are NOT functional regressions; the routes render correctly (proven by nav-smoke 14/14 + w6-* 24/24 + phase5-flows + dashboard + landing all green)

### 🟡 SOFT — Lint reports 34 cosmetic warnings
- **Symptom:** `react/no-unescaped-entities` warnings across ~10 files (apostrophes/quotes in JSX text)
- **Note:** functional impact = zero; gate of "0 warnings" requires either escaping or rule disable
- **Action:** either run a sed pass replacing `'` with `&apos;` and `"` with `&quot;` inside JSX text, or add an `eslint-disable-next-line` config for `react/no-unescaped-entities` in `apps/web/.eslintrc.json`
- **Affected gates:** Section 49 lint gate

### 🟡 SOFT — 15 infrastructure scripts referenced in AUTOMATED_TESTING.md don't exist yet
- **Missing scripts:** `bootstrap-test-wallets.ts` (multi-persona), `test-reset.ts`, `test-leak-check.ts`, `anchor-ix-coverage.ts`, `api-coverage.ts`, `cron-fire-all.ts`, `kernel-parity-cross-lang.ts`, `mcp-coverage.ts`, `blink-coverage.ts`, `pay-qr-coverage.ts`, `federation-coverage.ts`, `sdk-integration-live.ts`, `webhook-receiver.ts`, `security-audit.ts`, `test-full-suite.ts`
- **Action:** these need to be built one-by-one before their corresponding section can be tested in earnest. The autonomous prompt step 2 says "build them as needed". Each is ~50-150 lines.
- **Affected gates:** Sections 14.4, 14.5, 14.8, 23, 24, 26, 27, 31, etc.

### 🟢 DONE — Persona burner wallets generated and funded
- **Where:** `.test-wallet.json` (ALICE), `.test-merchant.json` (BOB), `.test-carol.json` (CAROL)
- **Pubkeys:**
  - ALICE: `C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY` — 0.5000 SOL · 12.90 USDC
  - BOB: `Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB` — 0.5000 SOL · 10.00 USDC
  - CAROL: `HNktQ9RVKeXqRwatBrswWChdqJ3YYYpZJFrHFpEHj9RH` — 0.4980 SOL · 10.00 USDC (NEW, slightly under SOL target after gas; functionally fine)
- **Built:** `scripts/bootstrap-test-wallets.ts` (idempotent — safe to re-run for top-up)
- **Resolved:** 2026-05-03 00:42

---

## Handled blockers

(history)
