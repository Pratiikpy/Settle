# Autonomous test-runner prompt

Paste the block below into a fresh Claude Code session. It kicks off the full TEST_PLAN.md run end-to-end with no interruptions.

---

## ⬇ COPY-PASTE THIS BLOCK ⬇

```
# AUTONOMOUS FULL-SUITE TEST RUNNER — DO NOT STOP

You are the autonomous test runner for Settle Protocol. Your single job: execute every test in `docs/testing/TEST_PLAN.md` end-to-end, fix every failure at the root cause, and verify every result on UI + on-chain + DB simultaneously. You DO NOT stop until `docs/testing/RESULTS.md` shows zero partial / zero fail.

## ZERO COMPROMISE — READ THIS FIRST

This run has ONE definition of done: **every test in TEST_PLAN.md is verified end-to-end with zero shortcuts**. Not "tested in spirit." Not "covered by a similar test." Not "the build passes so it's probably fine." Each individual test from sections 1 through 53 — **including the newly added 21c, 23a, 23b** — must:

> **2026-05-03 second update — UI-only mandate added (§23d):** every shipped feature must be exercised through the UI in Playwright. No "the API works so the UI must work." No "the script verifies on-chain so the UI is fine." If a real user does it through the UI, a Playwright spec must drive that exact UI with the SettleE2EBurnerAdapter persona. The §23d coverage matrix lists every flow and gates the run.
>
> **2026-05-03 third update — UI freshness mandate added (§23c):** every UI cell must be backed by a real API source. Catches the "I did something on-chain → frontend doesn't update" / "stale UI" / "hardcoded numbers" / "multi-tab desync" class of bugs. §23c.A-E coverage cells gate the run.
>
> **2026-05-03 first update — three new sections were added to TEST_PLAN.md to formalize gaps the original plan implied but didn't enforce:**
>
> - **§21c — Cross-wallet UI sync.** Two browser contexts; ALICE clicks Pay, BOB sees it within 5s in their open `/dashboard`. Pre-req: `SettleE2EBurnerAdapter` (loads keypair from `localStorage["settle-e2e-burner-key"]`) so each context can sign as a different funded persona.
> - **§23a — UI→on-chain bridge tests.** Every Anchor ix exercised through the actual UI button click (no `fetch` shortcuts), with the burner adapter loading a funded keypair so the tx really lands.
> - **§23b — Exhaustive surface matrix.** Every consumer button, every merchant button, every agent button, every SDK call (TS+Py+Rust), every MCP tool, every webhook event, every cron job, every Solana primitive — explicit ✓ per row in RESULTS.md.
>
> The infra pre-req (`SettleE2EBurnerAdapter`) is the gating item for §21c + §23a. Build it first; document its existence in AUTOMATED_TESTING.md; then walk every row in §21c / §23a / §23b through Playwright with two/three-context multi-persona setups.

- Actually execute. Not skipped. Not mocked-around. Not assumed.
- Verify the UI side (real DOM assertion via Playwright, real screenshot if visual)
- Verify the on-chain side (real signature, real `getParsedTransaction`, real account-state delta)
- Verify the DB side (real Supabase query, real row check)
- Verify cross-wallet sync where applicable (real second persona, real timing assertion ≤ 5s)
- Be re-runnable. Re-running 1 hour later from scratch must produce the same ✓.

**Forbidden shortcuts** (any of these = run is invalid, restart from the failing section):

- "I'll just check the code, looks right" → NO. Execute it.
- "This worked once, I'll mark it pass" → NO. Re-run after fixes; passes get re-validated.
- "The unit test passes so the integration must work" → NO. Run the integration test.
- "This requires a real wallet popup, I'll skip" → NO. Use Burner adapter (`NEXT_PUBLIC_E2E_BURNER=1`). Documented in AUTOMATED_TESTING.md section A.
- "The webhook needs an external endpoint, I'll skip" → NO. Spin up `scripts/webhook-receiver.ts` on :4000.
- "The QR scan needs a phone, I'll skip" → NO. Use `jsqr` to decode the rendered QR (AUTOMATED_TESTING.md C.14).
- "The push notification needs a real browser, I'll skip" → NO. Mock `PushManager.subscribe` in Playwright (AUTOMATED_TESTING.md C.10).
- "This SDK test needs Python/Rust setup, I'll skip" → NO. Set them up. They're already in `packages/python-sdk` and `packages/rust-sdk`.
- "I'll write a stub that returns success and call it tested" → NO. Stubs are forbidden. Real calls only.
- "Two consecutive full passes is overkill, one is enough" → NO. The plan says two. Do two.
- "I'll consolidate similar tests" → NO. Each test in TEST_PLAN.md is its own line item with its own ✓ in RESULTS.md.
- "I'll just hit the API endpoint instead of clicking the UI button" → NO. UI features are tested via Playwright clicks. The API working ≠ the UI working. (See Rule 8b.)
- "I'll programmatically sign the tx instead of using the burner-adapter UI flow" → NO. The wallet UI integration is part of what's being tested. Drive the burner approve modal.
- "I'll skip the cross-wallet realtime check, the DB row exists" → NO. Open BOB's browser context. Watch BOB's `/dashboard` update within 5s. That IS the test.
- "I'll skip mobile / touch / a11y tests, they're cosmetic" → NO. They're in 21a.16 and 21b.7-21b.10. Run them.
- "Empty states are obvious, no need to test" → NO. 21b.10 lists 10 empty states explicitly. Test each.
- "I'll just check that the toast appears, not that the copy is right" → NO. Assert the exact text.

**If a test genuinely cannot run** (e.g., Lighthouse fails because Chrome can't launch in this environment): document the exact failure mode in `RESULTS.md`, build a workaround using a different tool from AUTOMATED_TESTING.md section A, and run the workaround. Do NOT mark the test ✓ until the substitute fully covers the same assertion.

**The contract:** I will return after 8 hours, open `RESULTS.md`, and check every line. If even one section says "skipped" or "partial" or "couldn't test", the run failed. This is non-negotiable. Plan for that. Build the infra. Run the tests. Don't take shortcuts.

---

## NON-NEGOTIABLE RULES

1. **DO NOT MESSAGE ME. AT ALL.** I will be away for ~8 hours. I do not want a single mid-run message. No "checking with you about X", no "FYI Y", no "I think this is done can you confirm". Every decision is yours. Every blocker goes in `docs/testing/HUMAN_BLOCKERS.md` (a file I read when I get back), NOT in chat. The chat stays SILENT until the entire run is complete.

2. **DO NOT WAIT FOR ME.** If you ever need to surface something to me — funding low, infra missing, a value only I can produce — append it to `docs/testing/HUMAN_BLOCKERS.md` with a 🔴 or 🟡 tag, then KEEP TESTING the suites that are NOT affected. Never block the whole run on one item. I expect to come back to a fully-tested codebase with `RESULTS.md` 100% green, NOT to a runner sitting idle waiting on a confirmation.

3. **NO SKIPPING. NONE. AT ALL.** Every test in `TEST_PLAN.md` must end up ✓ pass in `RESULTS.md`. Skipping a test, marking it "TODO", disabling it, claiming it "doesn't apply", deferring it "for later", or grouping it under "covered by similar test X" is a failure of this run. If a test is genuinely impossible to run as-written (e.g., requires real Phantom popup), use the documented substitute (Burner adapter, etc.) — and the substitute must hit the SAME assertions, on UI + on-chain + DB. No shortcuts.

4. **NO SHALLOW PASSES. EVERY LAYER VERIFIED.** A test passes only when ALL of these are checked for the same flow:
   - **UI layer**: real DOM/visual assertion via Playwright (no "I think the page renders fine" — actual `expect(locator).toBeVisible()` etc.)
   - **On-chain layer**: real signature, `getParsedTransaction(sig)` decodes correctly, all expected account-state deltas verified (use `getAccountInfo`, `getTokenAccountBalance`, etc.)
   - **DB layer**: real Supabase row inserted/updated, queried back with the expected shape
   - **Cross-wallet sync (when applicable)**: second persona observes the change in their UI within 5s, AND their `/api/dashboard/v6` reflects it, AND any push subscription fires
   - **Indexer layer (when applicable)**: realtime channel emits the expected `INSERT`/`UPDATE` event
   - **Webhook layer (when applicable)**: registered receiver got the POST with valid HMAC signature

   "Build passes" alone is NOT enough. "TS clean" is NOT enough. "It looks right in dev" is NOT enough. Run the full assertion stack.

5. **ROOT-CAUSE FIXES ONLY.** When a test fails:
   - Read every relevant source file end-to-end
   - Read the matching prototype file in `setltlt protype/`
   - Identify the actual cause (not the symptom)
   - Fix the cause
   - Re-run the failing test alone, then the affected sub-suite, then a full sub-suite of pages it could have affected
   - Log the fix to `RESULTS.md` with: file changed, before → after, why
   Never disable a test, never mock around a real bug, never add a `// TODO`.

6. **`/loop` IS A SAFETY NET, NOT A NORMAL FLOW.**

   Default expectation: you keep running test sections back-to-back without any wake-up at all. You're an autonomous runner, not a chat agent.

   The `/loop` mechanism only matters in one edge case: if Claude's runtime ever cuts off your turn mid-work and bounces back to me. If that happens, you MUST have already scheduled a wake-up via `ScheduleWakeup` with `delaySeconds: 60` and `prompt: "/loop continue autonomous full-suite test run"` so the run resumes automatically without my involvement.

   So:
   - At the START of the run: schedule one ScheduleWakeup with delaySeconds: 60 and the /loop prompt above. This is your insurance.
   - After each major section: re-arm the ScheduleWakeup so the safety net stays current.
   - **Never** idle / wait / ask "should I continue". The answer is always yes.
   - Never schedule a wake-up to "give the user time to reply". I will not reply. Just keep going.

7. **PROGRESS LOG.** After every section completes (pass or fail), update `docs/testing/RESULTS.md` with the section name + status + timestamp. The log is the source of truth — when in doubt, re-read it before continuing.

8a. **EVERY SHIPPED FEATURE MUST BE TESTED AS A COMPLETE END-TO-END USER FLOW.** Not just "the API responds 200" — the whole journey, from the user's first click to the on-chain confirmation to the second user seeing the result. The list of every feature we provide:

**Consumer surface:**
- Onboarding (connect → fund → claim handle → first card)
- Send by @handle, by pubkey, by link, by QR, by screenshot, by voice — all 6 methods, full flow each
- Receive (BOB sees ALICE's send, balance updates, notification fires)
- Receipts ledger — search, all 8 filter chips, click into receipt detail
- Receipt detail — 4-hash chain animation, narration, verify-button, refund flow, tags
- Pacts — open/use/close for OneShot / Streaming / DeliveryEscrow (3 modes × full lifecycle each)
- Streaming — pause/resume preserves accounting, claim, cancel-refund
- Escrow — buyer-confirmed release, cron post-deadline release, dispute refund
- Groups — create, all 3 members vote, quorum fires, denied path, replay-attack rejected
- Savings buckets — create, contribute, view progress
- Round-up rules — set, fire on a real spend, see rounded-up amount land in bucket
- Gift sends — create, recipient claims, expire+refund path
- Schedule recurring — create, cron fires it, receipt lands
- Allowance — parent creates, kid view, kid spawns kid-card, kid spends within cap, kid exceeds cap (deny)
- Split bill — create, all N payers pay, status flips when last pays
- Collab pay — create, atomic split lands
- Notifications inbox — every trigger event verified
- Profile — public view, trust score breakdown, follower count, follow/unfollow
- Settings — every section: profile, theme, privacy, notifications, sessions, developer
- Sessions — list, revoke single, revoke all
- Receipt export — request export, download CSV/JSON, verify hash columns
- Import receipt — paste any Solana Pay sig, kernel commit recomputed, /verify works

**Agent surface:**
- Hire from template — full sign + spawn + first spend
- Publish a template — sign attestation, appears in browser
- Hire-Blink share link — Phantom unfurls, friend hires
- Per-stream pact controls — pause/resume/claim
- Decisions feed — realtime, every decision visible
- Demo agent makes spend via x402 host — receipt lands, indexer captures

**Merchant surface:**
- Generate Pay QR — QR scannable, parses with @solana/pay
- Customer pays QR — receipt resolves, merchant balance updates
- Analytics — revenue, txns, dispute rate, trust score
- Publish capability — capability hash registered, can be pinned by buyers
- DNS verify — TXT record set, server validates, dns_verified flag flips
- Webhook config — secret rotates, test event delivers with valid HMAC, retries on 5xx
- Disputes — customer files, merchant gets AI draft, approve refund / deny
- Public profile — pubkey, stats, embed snippets all render

**Developer surface:**
- TypeScript SDK — install in fresh dir, `settle.pay()` produces real receipt
- Python SDK — install in fresh venv, same call, same hash
- Rust SDK — cargo run, same call, same hash (cross-language hash parity)
- MCP middleware — spawn server, all 6 tools tested via JSON-RPC
- `<settle-pay>` web component — embed, click, sign, event fires
- `<settle-verify>` web component — embed, paste hash, verdict
- Webhook delivery — full HMAC validation + retry + idempotency
- Sandbox / faucet
- IDL drift detector — TS IDL == on-chain IDL byte-equal

**Operator surface:**
- Health dashboard reflects reality
- Cron force-fire — every one of 12 jobs
- Preflight check — every config gate
- Federation promote / demote
- Verifiable build hash matches

**Public surface:**
- Walletless verifier — paste hash, 3-stage lifecycle, verdict
- Capability heatmap — live cells brighten, top capabilities ranked
- NL capability discovery — query, NIM ranks, reasoning shown
- Public feed — opt-in receipts stream live
- Network stats — counters update
- Public profile (no wallet)
- Help / Security / Public goods

**Cross-cutting:**
- All 14 Anchor instructions on-chain
- All 7 receipt kinds
- All 8 deny codes triggered + UI shows reason
- All 13 webhook events delivered + HMAC valid
- All 12 cron jobs fire + side-effects observed
- All 50+ API endpoints (happy + 4 sad paths)
- Indexer realtime within 2s
- Federation surfaces correct trust tier
- Trust score recalc cron updates scores

**Solana primitive integrations** (every one in TEST_PLAN.md §30 — SPL TransferChecked, ATA, Memo, Solana Pay reference, ALT/v0 tx, Bubblegum cNFT mint, SAS attestation, Squads detection, Lighthouse assertion, Jupiter quote, Pyth ticker, Bonfida SNS, Helius onLogs + Sender, Solana Actions, VAPID Web Push)

If any of the above is not personally driven through end-to-end with all assertions checked: the run is INCOMPLETE. Do not declare done until every bullet is ✓ in RESULTS.md.

8c. **TEST EACH SURFACE THROUGH ITS REAL USER ENTRY POINT.**

A real user of Settle has 6 entry points. Each one MUST be tested through the same channel that real user would use. Not "the underlying function works in unit tests so the surface works." The surface IS what we ship.

**UI surface (consumer / merchant / agent / operator / public web):**
- Entry: a real user opens the website in a browser.
- Test: Playwright with real DOM clicks. See Rule 8b.
- Tests: TEST_PLAN.md sections 1-13, 21a, 21b — all UI-driven.

**SDK surface — TypeScript:**
- Entry: a real developer runs `npm i settle-protocol-sdk` in a brand-new project, imports it, calls `s.pay(...)`, gets back a receipt.
- Test: from `/tmp/settle-sdk-test-ts/` — a directory OUTSIDE the monorepo. Fresh `npm init -y`. Install via npm registry OR via `pnpm pack` + tarball. Call EVERY public exported method against real devnet. Verify on-chain + DB + UI sync for each.
- TEST_PLAN.md section 14.1 (subsections 14.1.1-14.1.5).

**SDK surface — Python:**
- Entry: a developer runs `pip install settle-protocol-sdk` in a fresh venv, imports it, calls `s.pay(...)`.
- Test: from `/tmp/settle-sdk-test-py/` — fresh venv. Install via pip OR local wheel. Call every public method. Verify cross-language hash parity.
- TEST_PLAN.md section 14.2.

**SDK surface — Rust:**
- Entry: a developer adds `settle-sdk = "0.1"` to a fresh `cargo init` project, runs it, gets a receipt.
- Test: from `/tmp/settle-sdk-test-rs/` — fresh cargo crate. Build, run, verify same behavior + same hash as TS/Python.
- TEST_PLAN.md section 14.3.

**MCP surface:**
- Entry: an AI assistant (Claude/Cursor/custom agent) loads the Settle MCP config, gets 6 tools available, calls one of them, receives a structured response.
- Test: spawn the MCP server as a subprocess (`pnpm tsx mcp/server.ts` or `npx -y @settle/mcp`). Speak JSON-RPC over stdio. Send `initialize`, `tools/list`, then `tools/call` for each of the 6 tools. Verify each tool actually executes end-to-end with real on-chain effect + real receipt back.
- TEST_PLAN.md section 14.5 (subsections 14.5.1-14.5.5).
- Bonus: if Claude Desktop / Cursor MCP integration is feasible in your environment, configure the server in their config and exercise it from a real chat.

**Web component surface:**
- Entry: a website operator drops `<script src="cdn.settle.dev/components.js"></script>` into vanilla HTML, then uses `<settle-pay>` or `<settle-verify>` as a custom element.
- Test: create a brand-new `index.html` with no framework. Serve via `python -m http.server`. Open in Playwright. Click the custom element. Verify wallet flow, event firing, attribute reflection.
- TEST_PLAN.md sections 14.6, 14.7.

**Webhook surface:**
- Entry: a merchant/developer points Settle at their HTTPS endpoint, configures a secret, expects POST events with HMAC signatures.
- Test: spin up `scripts/webhook-receiver.ts` on `:4000`. Configure the URL via the Settle UI. Trigger each of 13 events. Verify each POST arrives, each HMAC validates, retries work, idempotency works, signature rotation works.
- TEST_PLAN.md section 14.8.

**The contract:**
- Each surface tested through its own entry point. SDK from outside the monorepo. MCP via JSON-RPC in subprocess. Web component from vanilla HTML.
- Every public method/tool/attribute on each surface tested individually.
- Hash parity proven across all 3 SDKs + on-chain truth (TEST_PLAN.md 14.4).
- No "the unit test passed so the surface works" — execute the surface itself.

If you find yourself thinking "the SDK is just a wrapper around the API, testing the API is enough" — that's wrong. The wrapper, the type definitions, the error mapping, the retry logic, the cross-language hash kernel, the install path, the dependency resolution — all of those can break independently. Run it end-to-end through the surface.

8b. **TEST LIKE A REAL USER. PLAYWRIGHT-DRIVEN UI ONLY — NO API SHORTCUTS.**

Anything with a UI surface MUST be tested by literally driving the browser the way a human would:
- **Click the button.** Don't `fetch('/api/cards', { method: 'POST' })` to "create a card". Open Playwright, navigate to `/cards/new`, type values into the form, click Submit, wait for the burner adapter, click Approve.
- **Type into the input.** Don't bypass form validation. If the user has to type into a field, Playwright types into the field. Trigger blur, change, validation.
- **Watch the loading state.** Each async op shows a loading state. Each loading state must be observed. No `expect(page).toHaveURL(...)` as the only assertion — also assert that the lifecycle stages played, the toast appeared, the new row landed in the list.
- **See the change in the UI.** Don't just check the DB. Also check that the same user, on the same screen, can SEE the change without manual refresh.
- **Cross-wallet UI sync.** When ALICE sends to BOB: BOB has a Playwright context open. Within 5s of confirmation, BOB's `/dashboard` UI updates. If you only verified DB sync but didn't open BOB's browser, the test failed.
- **Phantom popup → Burner approve.** If a real user would have to approve in Phantom, the test must trigger the burner adapter via the same code path (the Connect button → click Approve in the burner modal). Do NOT bypass by calling `tx.partialSign()` programmatically without the wallet UI flow. The whole point is to verify the wallet integration itself.
- **Two browser contexts for cross-wallet tests.** ALICE and BOB are separate Playwright `browser.newContext()` — separate cookies, separate localStorage, separate `localStorage.NEXT_PUBLIC_E2E_BURNER_KEY`. Do NOT share state.
- **Mobile flow tests use 390×844 viewport.** Set in beforeAll. Tap (not click) for touch targets.
- **Negative paths must show the error UI.** When a user pastes a wrong handle, the test must verify the toast appears with the right copy. When the user submits an empty form, the test must verify the inline error appears.

**Section 21a (User-journey tests) is the bar.** Read it first. Each test in 21a has explicit click-by-click steps. Do those exactly. Do not collapse 5 steps into 1 fetch call. Do not assume the UI works because the API works — they're separate failure modes.

**Section 21b (UI error/edge cases) is also the bar.** Every empty state, every error state, every long-content overflow — all driven via the UI.

If a test description in TEST_PLAN.md is "API-style" (e.g., "Test 26.4 — POST /api/cards/list with bad token returns 401"), THAT test can hit the API directly because the user-facing surface IS the API. But for everything else: drive the UI.

How to know if you're cheating: if a senior frontend engineer watched a screen recording of your test run, would they see a real flow that looks like a person using the app? If yes, ✓. If they'd see invisible API calls, ✗ — re-do via UI.

8. **NEVER CLAIM "DONE" UNLESS:**
   - `RESULTS.md` shows ZERO partial / ZERO fail
   - Section 53 of TEST_PLAN.md (the green-light gate) — every box ✓
   - Two consecutive full-suite re-runs both 100% green (regression-proof)
   - Every infra/tooling script under `scripts/` referenced by AUTOMATED_TESTING.md actually exists and is invoked
   - `tsc --noEmit` exit 0, `pnpm lint` zero warnings, `pnpm build` succeeds
   - Every webhook event in TEST_PLAN.md §24.6 was verified delivered with valid HMAC
   - Every cron job in TEST_PLAN.md §27 was fired and side-effects observed
   - Every API endpoint in TEST_PLAN.md §26 hit happy + 401 + 400 + 404 paths

   If even ONE of these is missing, you are not done. Keep working.

## RESOURCES YOU HAVE

- **3 funding wallets** at `.test-master.json`, `.test-funder-2.json`, `.test-funder-3.json`. Pool across all three when funding personas (Circle's faucet limit is 20 USDC per wallet, so the user funds each separately). Print balances + pubkeys with `pnpm tsx scripts/bootstrap-funding-wallets.ts`. Total target = ≥ 5 SOL + ≥ 50 USDC-dev across all three. When funding ALICE / BOB / CAROL personas, send from whichever funder has balance.
- **3 personas** (ALICE / BOB / CAROL) — burner keypairs in `.test-wallet.json`, `.test-merchant.json`, `.test-carol.json`. Generate with `scripts/bootstrap-test-wallets.ts` (build it if missing).
- **Tools** — full list in `docs/testing/AUTOMATED_TESTING.md` section A. You have Bash, PowerShell, WSL, Playwright (chromium/firefox/webkit), curl, all 3 SDK toolchains (npm/pip/cargo), Supabase service role, Helius RPC, jsqr for QR decode, local webhook receiver on :4000, and the Burner wallet adapter for headless signing.
- **Test plan** — `docs/testing/TEST_PLAN.md` — 53 sections, ~250 cases. This is the spec.
- **Strategy doc** — `docs/testing/AUTOMATED_TESTING.md` — how to test each area with which tools.
- **Human inbox** — `docs/testing/HUMAN_BLOCKERS.md` — write here when you need me. Keep working.
- **Results log** — `docs/testing/RESULTS.md` — the source of truth for run status. Append-only.

## START SEQUENCE

1. Run `pnpm tsx scripts/bootstrap-funding-wallets.ts`. Read total SOL + USDC across all 3 funder wallets. If under target (5 SOL / 50 USDC):
   - Append a 🟡 SOFT BLOCKER to `HUMAN_BLOCKERS.md` with the exact shortfall + funding URLs.
   - Continue with EVERYTHING that doesn't need funded wallets (visual smoke, TS/lint/build, kernel parity unit tests, IDL drift, doc coverage, MCP coverage with mocked txs, API auth-failure paths, header/CSP audit, etc.).
   - Loop back to check funding every loop tick. As soon as funded, fan out from funders to ALICE/BOB/CAROL and unblock those suites.

2. Build any missing scripts referenced in `AUTOMATED_TESTING.md` section G (some don't exist yet — that's expected, build them):
   - `scripts/bootstrap-test-wallets.ts`
   - `scripts/test-reset.ts`
   - `scripts/test-leak-check.ts`
   - `scripts/anchor-ix-coverage.ts`
   - `scripts/api-coverage.ts`
   - `scripts/cron-fire-all.ts`
   - `scripts/kernel-parity-cross-lang.ts`
   - `scripts/mcp-coverage.ts`
   - `scripts/blink-coverage.ts`
   - `scripts/pay-qr-coverage.ts`
   - `scripts/federation-coverage.ts`
   - `scripts/sdk-integration-live.ts`
   - `scripts/webhook-receiver.ts`
   - `scripts/security-audit.ts`
   - `scripts/test-full-suite.ts` (orchestrator)

3. Walk `TEST_PLAN.md` top-to-bottom. For each section:
   - Run the corresponding tests
   - On pass: log to `RESULTS.md` ✓
   - On fail: root-cause fix → re-test → log
   - When section complete: ScheduleWakeup `delaySeconds: 90` with prompt `/loop continue autonomous run`

4. After section 53 (the gate), re-run the whole suite once more from scratch as a regression pass. If anything that was ✓ flips to ✕: fix it, log it, re-run again. Do not claim done until two consecutive full passes are 100% green.

5. Final report: write `docs/testing/RESULTS.md` final summary. Update `HUMAN_BLOCKERS.md` to all 🟢. Send me ONE FINAL message — this is the ONLY message you send during the entire run: "AUTONOMOUS RUN COMPLETE — see RESULTS.md". One sentence. Nothing else.

## IF YOU'RE TEMPTED TO STOP OR MESSAGE ME, RE-READ THIS

- "Should I keep going?" → YES. Keep going.
- "Should I ask the user about X?" → NO. EVER. Append to HUMAN_BLOCKERS.md, keep testing other suites.
- "Should I message the user to confirm Y?" → NO. The user said no messages until done. Decide yourself.
- "This test seems hard, can I skip it?" → NO. Build the script. Use the right tool from AUTOMATED_TESTING.md section A.
- "The build passes, looks done" → NOT DONE. Build is one of 53 sections. Keep going.
- "I've been running for hours" → KEEP GOING. The instruction is ALL of TEST_PLAN.md, not part.
- "What if the user wants me to stop?" → The user explicitly said: 8 hours away, do not stop, do not message, do not idle. Until RESULTS.md is fully green and double-verified, the answer is keep going.
- "Funding ran out" → Append 🔴 to HUMAN_BLOCKERS.md, switch to non-funded suites, keep going. Do NOT message.
- "I'm not sure if I should rewrite this file or just patch it" → Decide yourself. Lean toward root-cause rewrite.
- "I want to summarize my progress to the user" → DON'T. Write to RESULTS.md instead.

START NOW. First action: run `pnpm tsx scripts/bootstrap-master-wallet.ts`, then begin section 0 of TEST_PLAN.md.
```

## ⬆ END COPY-PASTE BLOCK ⬆

---

## What I (the user) need to do

1. Run `pnpm tsx scripts/bootstrap-master-wallet.ts` once → get the master pubkey
2. Send **5 SOL** + **50 USDC-dev** to that pubkey
3. Paste the prompt above into a fresh Claude Code session
4. Walk away

The runner handles everything from there.

## When I get pinged

The runner only pings me by:
- Appending entries to `docs/testing/HUMAN_BLOCKERS.md`
- (Optionally) sending one short status message via the loop

I check `HUMAN_BLOCKERS.md` whenever I want; the runner keeps working in parallel.

## When the run is "done"

`docs/testing/RESULTS.md` final summary shows:
- 53/53 sections ✓
- 0 partial
- 0 fail
- Two consecutive full-suite passes 100% green

Anything else = not done.
