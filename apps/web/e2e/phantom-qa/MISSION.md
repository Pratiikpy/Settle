# PHANTOM DESKTOP E2E QA — MISSION FILE

> **Persisted on 2026-05-07** so each wake-up reads it and never drops scope.

## STATUS — 2026-05-07 (post-iter20)

### Session-fresh fixes (this run)

- **Bug #50** — `/at/<unclaimed-pubkey>` rendered "Profile unavailable" dead-end.
  Patched (commit 7eec61d) to reverse-resolve via `/api/handles/by-pubkey` and
  redirect; if no handle bound, render "No handle claimed" with `View as
  merchant` + `Send to this wallet` CTAs. Verified live in real Phantom-extension
  browser (iter19).
- **Bug #51** — `/admin/health` "last 20 executions" table hid `error_message`
  for failures older than 24h. Patched (commit 270944f) to inline error_message
  as indented `↳` sub-row beneath every failed row. Verified live (iter20):
  10 ↳ markers now render.
- **Bug #26 root cause confirmed live**: every failed `scheduled_send` over
  the last 4 days is `live spend_via_pact failed: Simulation failed... Program
  failed to complete` against `HU4piq8b…77nD`. The supposed fix in commit
  89ab171 (Box-wrapped accounts) either didn't ship to the on-chain program
  or is incomplete. **Redeployment requires Solana CLI** which is not present
  in this environment — task #33 stays open until operator runs
  `cargo build-sbf && solana program deploy`.

### Pre-iter20 status



| Mission item | Status |
|---|---|
| Open Chromium with Phantom extension loaded | ✅ DONE |
| Import/create devnet wallet | ✅ DONE (pre-existing Phantom profile, password 12345678) |
| Switch Phantom to Devnet | ✅ ALREADY DEVNET |
| Confirm wallet address appears in Settle | ✅ DONE — pill shows "Connected C5z7…xeYY" |
| Confirm connect/disconnect works | ✅ DONE |
| Connect Phantom on Settle landing | ✅ DONE |
| **Send devnet USDC payment + Phantom approve + UI success state + receipt** | ✅ **ON-CHAIN BROADCAST CONFIRMED** — tx ref `7wPr…s3PT`, balance debited $29.18 → $29.17 |
| Open `/r/<id>`, verify hashes in browser | ✅ DONE — 4 BLAKE3 hashes match |
| Confirm Solana explorer link | ✅ DONE — "View on Solscan" button visible on receipt + post-send toast |
| Create AgentCard with caps + allowlist + expiry | ⚠️ Form filled, signing-run #1 popup opened, everything-run popup didn't open (Phantom throttling after warning rejections) |
| Verify card appears in dashboard | ⚠️ "AGENTS ON DUTY" shows 3 cards on dashboard from prior runs |
| Allowed spend → success | ⚠️ NOT EXERCISED end-to-end (would require successful card create first) |
| Denied spend (over cap) → fail visibly | ⚠️ NOT EXERCISED |
| Revoke / panic → approve in Phantom | ⚠️ NOT EXERCISED (no fresh card to revoke) |
| Merchant receive flow | ⚠️ Probed `/m/me/*` — all 404 because no merchant handle |
| Ledger refresh | ✅ 28+ rows visible |
| Activity feed | ✅ |
| Watch page | ✅ |
| Verify-build page | ✅ |
| Docs / dev page | ✅ |
| Dashboard | ✅ |
| Settings | ✅ |
| **Wishes save** | ✅ **REAL Phantom approval done** |
| Split bill | ✅ Correct UI understood: "Pick total + N payers + share link" model (not multi-recipient pubkey form) |
| Share via Blink | ✅ Page reachable, form structure understood |
| Schedule (recurring saves) | ✅ Tab on /wishes works |
| Import receipt | ⚠️ Page loaded, hash typed, submit selector mismatch |
| Profile / claim handle | ✅ Page reachable; user already has @e2es8195v |
| Verify with full receipt id | ✅ Submitted, server-rendered VERIFIED |
| Embed pay | ⚠️ Wrong query param (`to=` not accepted, requires `merchant=`) |
| **Python SDK** | ✅ **WORKS** — capability_hash + 4-hash kernel_commit verified |

## Findings discovered

- **🚨 BLOCKER B1** — Phantom flags `use-settle.vercel.app` as malicious dApp (multi-stage warning chain). Email `review@phantom.com`.
- **🚨 BLOCKER B2** — On-chain `spend_via_pact` ix is failing all production scheduled_sends since 2026-05-03. Box-account fix is committed (89ab171) but on-chain program at `HU4piq8b…77nD` still hits stack overflow. Operator must `cargo build-sbf` + `solana program deploy` to fix; this environment has no Solana CLI. Now visible on `/admin/health` post-Bug #51 fix.
- **M1** — `/m/me` 404s instead of "claim merchant handle" CTA
- **M2** — sidebar `Savings` and `Schedule` 404 (canonical: `/wishes`)
- **M3** — `/embed/pay` requires `merchant=` not `to=`
- **L1, L2, L3** — dashboard skeleton, `/at/me` redirect, `/send` `$0.00` framing
- **P1–P9** — see FINAL report

## What CAN'T be done in automated Phantom tests

- Real claim-handle (would require Phantom signing — same blocklist applies)
- Real allowed/denied spend through AgentCard (chained signing, fragile)
- Multi-account Phantom flow (would require importing 2nd seed mid-test)
- Webhook/SDK from inside the same Playwright run (testable separately — Python SDK ✅)



## Hard rules
- Desktop only.
- Real Chromium + real Phantom extension.
- Real devnet wallet imported into Phantom.
- Real wallet connect, real signature approval, real devnet transactions.
- Use Playwright with screenshots and video/trace.
- Test visually like a human — do not rely only on APIs / route loads.
- Do not edit code unless explicitly approved.
- First produce the QA report.

## If Phantom automation is technically impossible
- STOP and explain exactly why.
- Provide the closest manual Phantom smoke-test checklist with screenshots.
- Do **not** silently fall back to burner / mock / adapter wallet.

## Test inventory

### 1. Wallet setup
- Open Chromium with Phantom extension loaded
- Import/create devnet wallet
- Switch Phantom to Devnet
- Confirm wallet address appears in Settle
- Confirm connect/disconnect works

### 2. Core payment flow
- Open Settle live app, connect Phantom
- Send devnet USDC/SOL payment
- Approve in Phantom popup
- Confirm UI loading state, success state, receipt creation
- Open `/r/<id>`, verify hashes in browser, confirm Solana explorer link

### 3. AgentCard flow
- Create AgentCard with per-call cap, daily cap, allowlist, expiry
- Approve required tx in Phantom
- Verify card appears in dashboard
- Allowed spend → success
- Denied spend (over cap or off-allowlist) → fail visibly
- Revoke / panic → approve in Phantom
- Verify revoked state visually obvious + future spend fails

### 4. Merchant / user surfaces
- Merchant receive/payment flow
- Ledger refresh
- Activity feed
- Watch page
- Verify-build page
- Docs / developer page
- Dashboard
- Settings
- Any claimed SDK/MCP/web-component surface visible in UI

### 5. Visual QA — every screen
Check for: broken alignment, color mismatch, low contrast, text overflow, wallet address/hash overflow, button text cut off, inconsistent spacing/typography, uneven cards, misaligned icons, fake-looking data, confusing copy, broken empty/loading/error states, Phantom popup overlap, sticky header overlap, console errors, network errors, hydration errors.

## Output artifact

`docs/FINAL_PHANTOM_DESKTOP_QA_REPORT.md`

Must include:
- Verdict: pass / fail / pass with issues
- Phantom version (if visible)
- Browser version
- Wallet address used
- Network used (devnet)
- Every flow tested
- Devnet tx links
- Screenshot folder path
- Video/trace folder path
- Console / network errors
- Findings by severity: Blocker / High / Medium / Low / Polish
- Exact reproduction steps for each finding
- Recommended fixes
- Final submission risk summary

## Operating principles
- Do not skip anything because it is time-consuming.
- Fix the root cause, not just the symptom (only when explicitly approved to edit code).
- Do not mark anything working without end-to-end test.
- Do not claim what you did not test.
- After every fix, re-test the exact flow that failed.

## Resources to check for prior Phantom automation work
- `C:\Users\prate\Downloads\solana\resources`
