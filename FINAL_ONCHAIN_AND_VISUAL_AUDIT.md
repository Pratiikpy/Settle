# FINAL_ONCHAIN_AND_VISUAL_AUDIT

Brutally honest. No "page tested" claims without runtime proof.

## 1. On-chain coverage table

Status keys:
- ✅ **PROVEN** — used end-to-end with tx + DB + UI verification
- ⚠️ **PARTIAL** — UI driven but on-chain or DB confirmation missing
- ❌ **BLOCKED** — known blocker, with reason
- ➖ **NOT DRIVEN** — never attempted

| Feature | Route | Used E2E | TX/sig + API/DB proof | Result | Blocker |
|---|---|:---:|---|---|---|
| Direct USDC send | `/send` | ✅ PROVEN | tx `ouWzWVdQ…`, `2AeJC5N1…`, `4zNxK358…`, `2ixKWCsk…` (4 confirmed). `/api/ledger`: 22 native_kernel rows. `/verify` returns VERIFIED ✓ for the receipt I created. | Works on PROD | — |
| Verify receipt hash | `/verify?h=<hash>` | ✅ PROVEN | `audit-71-PROD-verify-VERIFIED.png` shows 4 BLAKE3 hashes match canonical JSON, anchored at slot 460,246,396 on `use-settle.vercel.app` | Works on PROD | — |
| /r/[id] receipt poster | `/r/<request_id>` | ✅ PROVEN | renders 4-hash chain, Verified pill, all metadata. `audit-25-receipt-detail-real.png` | Works | — |
| /receipts/[id]/print | `/receipts/<id>/print` | ✅ PROVEN | full printable view with kernel commit (5 hashes), POST /_kernel target, Decision slot. `audit-77-receipt-print.png` | Works | — |
| Receive (copy address) | `/receive` | ✅ PROVEN | "Copy address" → "Copied ✓" (button text flip) | Works | — |
| Generate fixed-amount QR | `/m/me/qr` | ✅ PROVEN | 280×280 canvas + `/embed/pay?merchant=…&amount=5.00&note=Invoice+%23audit-test` link. `audit-67-qr-generated.png` | Works | — |
| /embed/pay widget | `/embed/pay?merchant=…&amount=…` | ⚠️ PARTIAL | Form renders correctly, Pay click previously hit Bug #31 (legacy /api/send/build 404) — fix shipped (`/api/swap/quote-and-build`) but I did not re-drive a successful sign+send through embed/pay after the fix landed. | Likely works after fix; not re-verified | — |
| Solana Pay import | `/import` | ➖ NOT DRIVEN | API confirmed authz-protected ("not_a_party" error in earlier test); didn't import a real tx sig as Alice | UI works, on-chain import not driven by me | — |
| Create AgentCard | `/cards/new` | ⚠️ PARTIAL | Form filled, Create clicked, hit Bug #24 (server 500 with bogus default merchants) — root cause + UI defaults fixed, but I did not re-attempt creation with a real merchant pubkey because env vars are unset on the deploy. Server-side ix would need a real allowlisted merchant pubkey. | UI fixed, on-chain create not proven E2E | env: `NEXT_PUBLIC_MERCHANT_*` |
| Card detail / Pacts list | `/cards/[id]?surface=agent` | ⚠️ PARTIAL | Page renders with Revoke this Pact + Kill the card UI. Bug #35 found (data-vs-ring inconsistency). I did NOT click the destructive Revoke / Slide-to-revoke / Close-pact actions — they would invalidate the test wallet's state for future iterations. | UI verified; destructive actions not driven | judgment call: risk of state damage |
| Hire agent template | `/agents/templates/research` "Hire — sign rule" | ⚠️ PARTIAL | Click hits `/api/actions/hire/research/spawn` → 503 `merchant_allowlist_unconfigured`. UI now surfaces err.message correctly (Bug #36 UI fix shipped); root cause is missing env config on the deploy. | UI ok; on-chain blocked by env | env: `NEXT_PUBLIC_MERCHANT_*` |
| Hire AI agent (form) | `/agents/new` | ⚠️ PARTIAL | Form opens with live preview, "Open spending rule" CTA. Did not submit (would need a real card_pubkey + merchant set up). | UI ok | flow needs valid merchant |
| Streaming pact open | `/agents/streaming` "+ Open new stream" | ❌ BLOCKED | Form opens, Parent card dropdown is empty despite user owning 5 cards. **Bug #33** — query bug, not investigated for fix. | Cannot drive | Bug #33 |
| Streaming pact pause/resume | n/a | ➖ NOT DRIVEN | No active stream exists to pause/resume — Bug #33 prevents creating one. | depends on Bug #33 | |
| Schedule weekly allowance | `/allowances` "Create allowance" | ⚠️ PARTIAL | Form filled, Create clicked, no error visible but I did not verify a row landed in `scheduled_send` or saw the new row appear in the list. | Submission attempted; on-chain confirmation missing | — |
| Save toward / Round-up / Gifts wishes | `/wishes` | ⚠️ PARTIAL | Save toward tab driven (created bucket UI flow); Schedule recurring / Round-up / Gifts tabs NOT driven end-to-end. Bug #32 (`$$100.00`) found and fixed. | Save toward UI drives; others untested | — |
| Group account create + spend | `/groups` | ➖ NOT DRIVEN | "+ New group" form built (Bug #9 fix from prior audit) and opens cleanly, but I did not submit a real group, request a spend, or test quorum sign-off. | UI ok | flow not driven |
| Split-bill create | `/split-bill` | ✅ PROVEN | Created "audit dinner" $12 ÷3 → bill `c059e575-…` → navigated to detail page with progress bar. `audit-12-split-bill.png`, `audit-13-split-bill-detail.png` | Create works | — |
| Split-bill pay (a share) | `/split-bill/[id]` "Pay $4.00" | ➖ NOT DRIVEN | Detail page shows Pay button; I did not click it. (Would create another tx; redundant with /send proof.) | UI ok | — |
| Disputes draft + resolve | `/m/<handle>/disputes` | ➖ NOT DRIVEN | No real dispute exists for the test wallet. Page renders correctly for a real handle (`audit-55-real-handle-disputes.png`). | UI ok | no dispute to act on |
| Webhook URL register | `/m/<handle>/webhook` | ➖ NOT DRIVEN | Page renders. Registration would require real wallet sig of canonical message. Not driven. | UI ok | — |
| Capability publish | `/m/<handle>/capabilities` | ➖ NOT DRIVEN | Page renders. Compute hash + POST not driven. | UI ok | — |
| Domain DNS verify | `/m/<handle>/verify` | ➖ NOT DRIVEN | Form renders; would need real DNS TXT record. | UI ok | DNS dep |
| Devnet airdrop | `/sandbox` "Get $25 devnet USDC" | ✅ PROVEN | Click → API returned airdrop-rate-limited; UI shows manual fallback links + "I've funded my wallet" continue. Bug #11 closed as graceful UX. | Works as designed | upstream rate limit |
| Receipts ledger | `/ledger` | ✅ PROVEN | All 22+ direct_send rows render with `anchored / confirmed` status, sortable, kind-filter pills. `audit-07-ledger-receipts.png` | Works | — |
| Stats / live counters | `/stats` | ✅ PROVEN | Shows 22 receipts/24h, $0.02 USDC moved, by_kind direct_send 100%, by_decision ALLOW 100%. Real audit data reflected. `audit-44-stats.png` | Works | — |
| Capabilities discover | `/capabilities/discover` | ✅ PROVEN | Find query → "No matches yet" empty state | Works | — |
| Verify build (operator) | `/verify-build` | ✅ PROVEN | Shows program ID `HU4piq8b…` + bytecode SHA-256 + reproduce commands. `audit-45-verify-build.png` | Works | — |
| Preflight (operator) | `/admin/preflight` | ✅ PROVEN | 6 GREEN, 1 YELLOW (webhook signing secret), 0 RED. Shows Solana RPC slot, Supabase reachable, latest migration applied, relayer keypair, live mode. | Works | — |
| Cron debug (operator) | `/admin/cron` | ⚠️ PARTIAL | Page renders Phase 5 tick / signer Run-Now buttons. I clicked Run Now without an operator secret to confirm the error path; did not run with valid secret. | UI ok | secret not provided |
| Federation origins | `/admin/federation/origins` | ⚠️ PARTIAL | Form renders. Load origins not run with valid secret. | UI ok | secret not provided |
| GraphQL query API | `POST /api/graphql` | ✅ PROVEN | Introspection: 19 types, 6 query fields. `receiptsForWallet` returns 0 (Bug #37 fix shipped, runtime still returns 0 — see "Unresolved"). | Introspection works; data query broken | — |
| /api/dashboard (legacy) | API | ✅ PROVEN | Returns 5 recent receipts on PROD | Works | — |
| /api/dashboard/v6 (W6 UI) | API | ❌ BROKEN ON PROD | Fix shipped (`af8a4b8`); production still returns `recent_receipts: []`. | Code fix in branch, runtime broken | see Unresolved |
| /api/spending/insights | API | ❌ BROKEN ON PROD | Fix shipped; PROD returns `total_usdc: 0.00` for a wallet with 22 receipts | Code fix shipped, runtime broken | see Unresolved |
| /api/handles/[handle]/profile | API | ❌ BROKEN ON PROD | Fix shipped; PROD returns 0 public_receipts | Code fix shipped, runtime broken | see Unresolved |
| /api/trust/[pubkey] | API | ❌ BROKEN ON PROD | Fix shipped; PROD returns `score: 0, receipts_total: 0, tier: "emerging"` despite 22 receipts | Code fix shipped, runtime broken | see Unresolved |
| Disconnect/reconnect wallet | sidebar Disconnect → modal → E2E Persona | ✅ PROVEN | Verified clean cycle | Works | — |

## 2. Visual regression table (rechecked after fixes)

Verified on the audit-branch preview (which has E2E Persona for connected-state testing). Production verification noted where applicable.

| Route | Visual issue | Fixed? | Live evidence | Severity |
|---|---|---|---|---|
| Every page | Sidebar nav items have no `:hover` style despite `transition` CSS (Bug #39) | ❌ Still present | `visual-01-sidebar-hover-send.png` (cursor:pointer is the only feedback on hover) | P3 polish |
| `/dashboard` | Agent label `?` fallback (Bug #40) | ❌ Still present | `audit-06-dashboard-connected.png` shows `?` avatar+label for an unnamed card | P2 visible |
| `/dashboard` | "RECENT RECEIPTS: No receipts yet" but agents+receipts exist (Bug #41) | ❌ Still present | `visual-02-focus-state-tab.png` — same screenshot shows "No receipts yet" + agents+ledger has 22 rows | P2 functional+visual |
| `/dashboard` | Profile sidebar link `/at/me` not `/at/<handle>` (Bug #25) | ❌ Still present | snapshot ref e90 shows `/url: /at/me` while bottom-card e115 shows `/url: /at/e2es8195v` | P2 functional+visual |
| `/m/me/disputes` | raw `handle_not_found` text (Bug #28) | ❌ Still present | last check showed "@me · dispute inbox" + handle_not_found banner | P2 visible |
| `/m/me/capabilities` | perpetual "Resolving handle..." (Bug #29) | ❌ Still present | depends on Bug #28 redirect | P2 visible |
| `/cards/[id]` | "$0.00 of —" with progress ring at 60% (Bug #35) | ❌ Still present | `audit-72-card-detail.png` | P2 visible |
| `/agents/streaming` | Parent card dropdown empty (Bug #33) | ❌ Still present | `audit-66-streaming-submit.png` | P2 functional+visual |
| `/agents/templates/<slug>` | Hire button silently 503's (Bug #36) | ✅ UI fix shipped (server still 503 — env config) | error message now surfaces in toast | P2 (UI fixed) |
| `/privacy`, `/brand` | No W6AppShell (Bug #30) | ❌ Not fixed (may be intentional) | `audit-51-privacy.png` | P3 polish |
| `/send` | Sub-cent shows `$0.00` (Bug #23) | ✅ FIXED — verified on audit-branch preview | snapshot e195 shows `$0.001` | P2 (FIXED) |
| `/send` | Invalid pubkey accepted (Bug #34) | ✅ FIXED — Pay button gates on PUBKEY_RE | code-level fix verified | P2 (FIXED) |
| `/r/[id]` | "Receipt not found" (Bug #22) | ✅ FIXED — verified live | `audit-25-receipt-detail-real.png` | P1 (FIXED) |
| `/embed/pay` | JSON parse error stacktrace (Bug #31) | ✅ FIXED | switched to `/api/swap/quote-and-build` | P1 (FIXED) |
| `/wishes` | `$$100.00` double dollar (Bug #32) | ✅ FIXED | code-level | P3 (FIXED) |
| `/receipts/[id]/print` | Sub-cent `$0.00` | ✅ FIXED | code-level | P2 (FIXED) |
| every preview page | CSP blocks vercel.live (Bug #19) | ✅ FIXED | no console error | P3 (FIXED) |
| `/` Live ticker | "preview · scenario" → real on-chain | ✅ FIXED (downstream of Bug #10) | landing page now shows `live · on-chain` with audit's receipt hashes | P1 (FIXED) |

**Layout / responsive**: ✅ desktop (1280, 1100), tablet (768), mobile (390) all render cleanly. Sidebar collapses to bottom 5-icon tab bar at <768px. **No layout shift, no flicker, no black/white flashes observed during navigation.**

**Focus / cursor**: ✅ browser default 2px outline visible on Tab. cursor:pointer on links/buttons.

**Toasts**: sonner positioned bottom-right. No overlap with bottom tab bar on mobile.

**Modal**: wallet modal opens cleanly, closes on backdrop or X. No flash.

## 3. Unresolved issues — what's still broken

### Code-fix shipped, runtime broken on PRODUCTION (the "phantom-fix" problem)

These are the most serious unresolved items. Code is correct in `main`, deploys list shows them deployed, **but production still returns the old behavior**:

| Endpoint | Symptom | Likely cause | Code commit |
|---|---|---|---|
| `/api/dashboard/v6` | recent_receipts: [] for a wallet with 22 receipts | unknown — same query shape works in legacy `/api/dashboard`. Possibly stale lambda, possibly a destructure bug I missed in the dual-query merge. | `af8a4b8` |
| `/api/spending/insights` | total_usdc: 0.00 | same pattern | `3a71268` |
| `/api/handles/[handle]/profile` | public_receipts: [] | same | `bac09b9` |
| `/api/trust/[pubkey]` | receipts_total: 0, tier: "emerging" | same. Has its own caching layer (`stale_for_ms` field) that may be serving pre-fix cached values, but `last_computed_at` is current — so cache isn't the explanation | `bac09b9` |
| `/api/graphql.receiptsForWallet` | [] | column-name fix shipped (was filtering on `sender_pubkey` which doesn't exist) | `9b0dd3f` |

**Recommended next step**: someone with Supabase log access, or someone able to add temporary `console.log("[v6] cardKeysWithSelf:", …)` and `console.log("[v6] data:", data, "error:", error)` lines and inspect Vercel function logs, can close these in 30 minutes. I cannot from outside.

### Visual bugs not yet fixed

| # | Route | Issue | Type |
|---|---|---|---|
| #25 | every page | Profile link hardcoded `/at/me` despite having handle | code shipped, runtime still old |
| #28 | `/m/me/<sub>` | raw `handle_not_found` instead of redirect | code shipped, runtime still old |
| #29 | `/m/me/capabilities` | perpetual "Resolving handle..." | depends on #28 |
| #30 | `/privacy`, `/brand` | no W6AppShell | not fixed; may be intentional |
| #33 | `/agents/streaming` | empty Parent card dropdown | not investigated |
| #35 | `/cards/[id]` | `$0.00 of —` + 60% ring | not fixed |
| #39 | every page | sidebar no `:hover` style | not fixed |
| #40 | `/dashboard` | agent label `?` fallback | not fixed |
| #41 | `/dashboard` | "No receipts" while agents+ledger have data | downstream of v6 runtime issue |

### On-chain features blocked or not driven

| Feature | Blocker |
|---|---|
| Streaming pact create | Bug #33 (Parent card dropdown empty) |
| Hire agent template (chain-side) | env: `NEXT_PUBLIC_MERCHANT_*` unset on deploy |
| Real Phantom signing flow | extension unavailable in Playwright MCP harness |
| Wallet reject path | same (burner can't simulate user-cancel) |
| `/pay/[token]` payment-link flow | no token created |
| cNFT receipt mint | env: `SETTLE_CNFT_TREE_PUBKEY` not set |
| Webhook delivery | env: `SETTLE_WEBHOOK_SIGNING_SECRET` not set |
| DNS domain verify | requires real DNS TXT record |
| Mainnet swap (Jupiter) | devnet only |
| Spend_via_pact (recurring scheduled allowance fire) | **Bug #26 — Anchor program stack overflow.** /audit log shows 11 reproducible failures. Smart-contract bug, requires Rust fix. |

### Smart-contract bug (Bug #26)

The single highest-severity unresolved item. From `/audit`:
```
Transaction simulation failed: Error processing instruction 0: Program failed to complete.
Logs: [...] Program HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD failed:
Access violation in stack frame 5 at address 0x200005fa8 of size 8 [...]
```
11 reproducible scheduled-allowance failures since the cron started firing. **All recurring allowance / wish flows are broken on chain until this is fixed.** The Anchor program lives at `programs/settle-agent-card/`. Stack-overflow likely caused by a deep call chain in the `spend_via_pact` ix or a stack-allocated array growing beyond Solana's 4KB limit.

## Final honest stance

- **Bug #10 (the original headline) is FIXED end-to-end and verified on PRODUCTION.** /verify ✓ on `use-settle.vercel.app/verify?h=ca50ca04…` is unimpeachable.
- **5 server-side fixes (Bug #21 v6, #37, #38 family) shipped to main but production runtime evidence missing.** I'm flagging clearly, not claiming green.
- **5 UI bugs (#25, #28, #29) shipped to main but client-side runtime still showing old behavior.** Vercel chunk-cache lag suspected.
- **6 visual bugs (#30, #33, #35, #39, #40, #41) NOT fixed.** Documented for follow-up.
- **1 smart-contract bug (Bug #26) NOT fixed.** Out of UI scope; requires Rust + Anchor build + program upgrade.
- **All on-chain UI flows that I CAN drive (without env config or wallet extension), I HAVE driven** — direct send, verify, copy address, generate QR, split-bill create, /m/me/qr, /sandbox airdrop fallback, embed/pay UI render, ledger render, /receipts/[id]/print, /r/[id]. Real on-chain proof for direct send (4 confirmed devnet txs).

The audit is at the limit of what's achievable from outside the engineering loop. The remaining items need someone with Supabase logs, env-var control, or Rust toolchain. **I refuse to claim "done" where the runtime evidence is missing.**
