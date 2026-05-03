# Settle — Full QA Test Plan

> Every UI, every flow, every backend signal, every wallet role.
> Walk top-to-bottom. Each test has: **pre**, **steps**, **expected UI**, **expected on-chain**, **expected DB**.

---

## 0 · Test environment setup

### 0.1 — Three devnet wallets

You need three real Phantom wallets for cross-wallet flows.

| Persona | Role | Wallet | Funding |
|---|---|---|---|
| **ALICE** | Primary consumer | Phantom devnet wallet #1 | 0.5 SOL + 25 USDC-dev |
| **BOB** | Recipient / second member | Phantom devnet wallet #2 | 0.5 SOL + 25 USDC-dev |
| **CAROL** | Third member / 3rd voter | Phantom devnet wallet #3 | 0.1 SOL |

Funding flow: open `/onboarding` while connected to each wallet → "Get devnet funds" button. Manual fallback at `/sandbox` if the airdrop is rate-limited.

### 0.2 — Tabs to keep open

- Tab A: Settle app at `localhost:3000` (or Vercel URL)
- Tab B: Solscan devnet — `https://solscan.io/?cluster=devnet`
- Tab C: Supabase SQL editor (for DB verification)
- Tab D: Browser DevTools → Network tab + Console

### 0.3 — Quick env sanity

Open `/admin/health`. Expected:
- ✅ status: green
- ✅ migrations count: 49+
- ✅ recent indexer write < 5 min ago
- ✅ no failures in last 24h
- ✅ cron lag < 60s

If anything red/yellow: don't continue, fix infra first.

---

## 1 · Visual smoke — every route loads correctly

For each route below, navigate to it, screenshot, verify:
- ✅ Light W6 palette (no dark flash, no green buttons, no invisible text)
- ✅ Sidebar shows correct surface (Consumer / Agent / Merchant / Developer / Operator / Public)
- ✅ Active sidebar item highlighted
- ✅ Hero with eyebrow + heading + subtitle
- ✅ Footer renders W6 light (only for legacy chrome routes)

| Route | Surface | Notes |
|---|---|---|
| `/` | Public | Marketing landing — bento, agent card preview, surface tiles |
| `/dashboard` | Consumer | Hero + balance strip + Today bento + Active Pacts + Coming Up |
| `/send` | Consumer | Grid 2: composer + summary panel |
| `/send/link` | Consumer | One-shot payment link composer |
| `/send/voice` | Consumer | Voice intent parser |
| `/cards` | Consumer | 3 mode-explainers + filter chips + Pact grid |
| `/cards/new` | Consumer | Form: label/cap/per-call/expiry/allowlist + preview |
| `/cards/<id>` | Consumer | Card detail (only if you own it) |
| `/ledger` | Consumer | Search + 8 chips + flat receipts table |
| `/groups` | Consumer | Group selector grid + active group's pending votes |
| `/wishes` | Consumer | 4 tabs: Save / Schedule / Round-up / Gifts |
| `/allowances` | Consumer | Tabs: I'm paying / I'm receiving |
| `/activity` | Consumer | Decisions feed + filter + agent select + search |
| `/notifications` | Consumer | 2-pane: list + detail |
| `/at/<handle>` | Public/Consumer | Profile (server-rendered for any handle) |
| `/at/<handle>/proof` | Public | Trust score breakdown |
| `/onboarding` | Consumer | 4-step wizard |
| `/settings` | Consumer | 6 sections: Profile / Theme / Privacy / Notifications / Sessions / Developer |
| `/settings/exports` | Consumer | Receipt export by year |
| `/settings/relayer` | Consumer | Phase-5 delegation |
| `/agents` | Agent | List+detail panel of your AgentCards |
| `/agents/new` | Agent | Hire-agent form |
| `/agents/templates` | Agent | Template browser |
| `/agents/templates/new` | Agent | Publish a template |
| `/agents/templates/<slug>` | Agent | Template detail + hire button |
| `/agents/streaming` | Agent | Per-stream pact controls |
| `/agents/collab` | Agent | Two-tap collab pay |
| `/audit` | Agent | Policy decisions feed |
| `/m/<handle>` | Merchant | Public merchant profile |
| `/m/me/manage` | Merchant | Admin landing |
| `/m/me/analytics` | Merchant | Revenue + dispute stats |
| `/m/me/capabilities` | Merchant | Publish capabilities |
| `/m/me/disputes` | Merchant | Dispute inbox |
| `/m/me/verify` | Merchant | DNS verify |
| `/m/me/webhook` | Merchant | Webhook config |
| `/docs` | Developer | Protocol reference |
| `/docs/mcp` | Developer | MCP middleware docs |
| `/docs/pay-component` | Developer | `<settle-pay>` docs |
| `/docs/verify-component` | Developer | `<settle-verify>` docs |
| `/docs/webhooks` | Developer | Webhook contract |
| `/sandbox` | Developer | Devnet faucet + sandbox |
| `/import` | Consumer | Receipt importer |
| `/split-bill` | Consumer | Organize a split |
| `/split-bill/<id>` | Consumer | Active split status |
| `/collab/<id>` | Consumer | Active collab pay |
| `/pay` | Developer | `<settle-pay>` live demo |
| `/pay/widget` | Embed | Iframe pay widget |
| `/request` | Merchant | Generate Pay QR/Blink |
| `/qr/<merchant>/<slug>` | Merchant | QR landing |
| `/blink/<slug>` | Public | Blink share page |
| `/control-center` | Operator | Knowledge base |
| `/admin/health` | Operator | Phase 5 health |
| `/admin/cron` | Operator | Cron debug |
| `/admin/preflight` | Operator | Preflight checks |
| `/admin/federation/origins` | Operator | Federation promote/demote |
| `/verify` | Public | Walletless verifier |
| `/verify/<hash>` | Public | Public proof page |
| `/verify-build` | Public | Verifiable build hash |
| `/leaderboard` | Public | Capability heatmap + leaders |
| `/leaderboard/<hash>` | Public | Per-capability page |
| `/feed` | Public | Public live feed |
| `/stats` | Public | Network counters |
| `/capabilities` | Public | Capability registry |
| `/capabilities/discover` | Public | NL capability search |
| `/help` | Public | FAQ |
| `/security` | Public | Threat model |
| `/public-goods` | Public | OSS contributions |
| `/brand` | Public | Brand assets |
| `/changelog` | Public | Changelog |
| `/privacy` | Public | Privacy policy |
| `/terms` | Public | Terms |

**Negative-path visual smoke**:
- Visit any made-up URL `/foo` → custom W6 404 page (light, W6Logo, 3 CTAs)
- Throw a runtime error in dev tools → custom W6 error page (Try again / Home / Verify)

---

## 2 · Onboarding (Consumer · ALICE)

### Test 2.1 — First-time user onboarding

**Pre**: ALICE wallet not connected, no handle claimed yet.

**Steps**:
1. Open `localhost:3000/onboarding`
2. Verify 4-step indicator shows step 1 "Connect" active
3. Click WalletButton → connect ALICE Phantom
4. Verify auto-advance to step 2 "Get devnet funds"
5. Click "Get funds" → wait for airdrop
6. Verify auto-advance to step 3 "Create card"
7. Click "Create AgentCard" → sign in Phantom
8. Verify auto-advance to step 4 "Done"

**Expected UI**:
- Each step lights up sequentially in the step-indicator
- Card preview reflects label + cap as you type
- Success state shows: card pubkey, agent pubkey, agent secret (sensitive — copy once warning)
- Final CTA: "Open dashboard"

**Expected on-chain**:
- New `agent_cards` PDA created (verify via Solscan link)
- ALICE's USDC balance: 25.00
- ALICE's SOL balance: ≥ 0.5

**Expected DB**:
- `agent_cards` row with `authority_pubkey = ALICE`, `revoked = false`
- `handles` row (if claimed) with `pubkey = ALICE`

### Test 2.2 — Onboarding with manual airdrop fallback

**Pre**: Faucet rate-limited or offline.

**Steps**:
1. Click "Get funds" → see "Airdrop is offline right now" amber callout
2. Click both "faucet.solana.com" and "faucet.circle.com" external links → verify they open in new tab
3. Manually fund ALICE wallet with 0.5 SOL + 25 USDC-dev
4. Click "I've funded my wallet manually — continue"

**Expected UI**: advance to step 3 with no error.

---

## 3 · Send flow (Consumer · ALICE → BOB)

### Test 3.1 — Send by @handle

**Pre**: ALICE connected, BOB has handle `@bob` claimed.

**Steps**:
1. Go to `/send`
2. Method picker: select "@handle" pill (active = black)
3. To field: type `@bob`, blur → resolves with green ✓ + truncated pubkey
4. Amount: `5.00`, Token: USDC
5. For: `lunch`
6. Toggle "Public receipt" extra → checkbox black
7. Click "Pay 5.00 USDC to @bob" primary button
8. Sign in Phantom

**Expected UI**:
- Lifecycle stages: signing → confirming → success
- Success card: ✓ icon, "Sent.", Solscan link, Send another button
- Toast: "Sent 5.00 USDC to @bob"
- Right-side summary updates: $5.00 / USDC → @bob / "lunch" / public yes

**Expected on-chain**:
- ALICE USDC: 25.00 → 20.00
- BOB USDC: prev + 5.00
- A new transaction with USDC TransferChecked + Memo("lunch") + Settle Reference

**Expected DB**:
- `receipts` row with `sender_pubkey = ALICE`, `recipient_pubkey = BOB`, `amount_lamports = 5000000`, `kind = direct_send`
- `policy_decisions` row with `decision = ALLOW`
- BOB's notification fires (if push subscription exists) OR appears in BOB's `/notifications` after refresh

**Cross-wallet verification (BOB)**:
- Open new browser profile, connect BOB
- `/dashboard` → "Today · received $5.00 / 1 receipt"
- `/ledger` → row "+$5.00 from ALICE pubkey" with timestamp
- `/notifications` → no new (denials only) — BUT activity badge increments

### Test 3.2 — Send by pubkey

Same as 3.1 but method = "Pubkey", paste BOB's full pubkey.
Verify resolves and sends. Receipt shape identical except no @handle.

### Test 3.3 — Send by link

**Pre**: ALICE connected.

**Steps**:
1. Method picker → "Link" → click "Open link composer →"
2. On `/send/link`: amount `10.00`, note `birthday`
3. Click "Create claim link" → sign in Phantom
4. Verify success card with claim URL (contains fragment `#claim_secret=...`)
5. Click "Copy link"
6. Paste link in incognito window connected to BOB → land on `/claim/<escrow>`
7. Click "Claim" → sign in Phantom (BOB)

**Expected on-chain**:
- ALICE: -0.003 SOL (escrow rent) + -10 USDC
- BOB: +10 USDC + +0.003 SOL (rent refunded on claim)
- Escrow PDA created then closed

**Expected DB**:
- `payment_links` row with `status = claimed` after BOB claims
- `receipts` rows: 1 for the escrow drain (ALICE → escrow), 1 for the claim (escrow → BOB) — depending on impl

### Test 3.4 — Send by QR / screenshot

**Pre**: BOB has Settle Pay QR generated at `/request` (Test 9.1).

**Steps**:
1. ALICE on `/send`, method picker → "QR"
2. Drop a screenshot of BOB's QR onto the dropzone
3. Verify autofill: To = BOB pubkey, Amount = (whatever BOB requested), Note = (memo)
4. Click "Pay X USDC to @bob"

**Expected**: same as 3.1 with merchant_pubkey from QR.

### Test 3.5 — Send by voice

**Pre**: ALICE connected, NVIDIA NIM key configured.

**Steps**:
1. Method picker → "Voice" → click "Open voice composer →"
2. On `/send/voice`: hold mic, say "Send Bob five dollars for pizza"
3. Verify intent extraction: `recipient_handle: bob`, `amount_usdc: 5`, `note: "pizza"`
4. Click "Continue to confirm" → routes to `/send?to=@bob&amount=5&note=pizza`
5. Click "Pay" → sign

**Expected**: parsed intent fills /send composer; user confirms before signing.

### Test 3.6 — Multi-token send (devnet — informational only)

**Steps**:
1. Method picker → "@handle", to `@bob`
2. Token picker → SOL
3. Amount: `0.01`
4. Verify quote row: "Devnet has no DEX liquidity. Quote is informational — swap+send activates on mainnet."
5. CTA disabled with text "Pick USDC — swap is mainnet only"

### Test 3.7 — Send with Split Bill extra

**Steps**:
1. Compose send → toggle "Split this bill" extra → click extra → routes to `/split-bill`
2. On `/split-bill`: label "Friday dinner", total "60.00", payers `3`
3. Per-payer preview shows `$20.00`
4. Click "Create bill" → sign
5. Land on `/split-bill/<id>` → verify state "Open · 0/3 paid"

### Test 3.8 — Send to unresolved handle (negative)

**Steps**:
1. Type `@nonexistent`, blur
2. Verify red toast "Could not resolve: handle_not_found"

---

## 4 · Receipts (Consumer · ALICE)

### Test 4.1 — Ledger filters

**Pre**: ALICE has multiple receipts (sends + receives + denies + imports).

**Steps**:
1. Open `/ledger`
2. Click chip "All" → see everything
3. Click "Sends" → only `direct_send`
4. Click "Agent spends" → only `x402_spend` (if any)
5. Click "Streaming" → only `streaming_claim`
6. Click "Escrow" → only `escrow_release`
7. Click "Refunds" → only `refund`
8. Click "Denied" → only rows with `decision === DENY`
9. Click "Public" → only rows with `is_public=true`
10. Toggle "+ untrusted federated" → see federated rows with amber border
11. Search box: type 8-char prefix of a known request_id → row filters
12. Click any native row → routes to `/r/<request_id>`

**Expected**: every chip filters live, hash-mark `#` only on native rows.

### Test 4.2 — Receipt detail (4-hash chain)

**Steps**:
1. Open any native receipt
2. Verify 4-hash chain animation plays once
3. Verify narration text loaded (template fallback OR LLM-generated)
4. Click "Verify" button → all 4 hashes match
5. If receipt is owned, see "Refund" CTA (only within window)
6. If receipt has tags: tags shown as chips
7. Verify Solscan link works

### Test 4.3 — Verify by hash (walletless)

**Steps**:
1. Open `/verify` (no wallet)
2. Paste any of the 4 commit-chain hashes from a known receipt
3. Click "Verify" → 3-stage lifecycle plays (fetching → computing → done)
4. Verdict: ✓ VERIFIED with all 4 hashes listed
5. Click "Open receipt" → routes to `/r/<request_id>`

**Expected**: receipt resolves correctly; recomputed hashes match canonical JSON.

### Test 4.4 — Receipt importer

**Pre**: A real Solana Pay tx signature you sent or received.

**Steps**:
1. Open `/import`
2. Paste signature
3. Click "Import receipt"
4. Verify success card: amount, sender, recipient, memos, "Open receipt" + "Public proof" CTAs
5. Open the receipt → kernel commit recomputed even though origin was Solana Pay (not Settle)

**Expected DB**: new `receipts` row with `import_source = 'solana_pay'`.

### Test 4.5 — Export receipts

**Steps**:
1. `/settings/exports` → pick year 2026
2. Click "Export" → download CSV/JSON
3. Verify file contains hash columns alongside row data

---

## 5 · Pacts (Consumer · ALICE)

### Test 5.1 — Open OneShot Pact

**Pre**: ALICE has an AgentCard.

**Steps**:
1. `/cards` → click "Open OneShot" mode-explainer card
2. Routes to `/cards/new?mode=oneshot`
3. Form: label = "test pact", cap = `1.00`, expiry = 1 day, 1 merchant in allowlist
4. Submit → sign

**Expected on-chain**: new `pacts` PDA with `mode = 'oneshot'`, `cap_lamports = 1000000`.
**Expected DB**: row in `pacts` table.
**Expected UI**: pact appears in `/cards` "OneShot" filter.

### Test 5.2 — Open Streaming Pact

**Pre**: ALICE has card.

**Steps**:
1. `/cards/new?mode=streaming`
2. Set rate per slot, max total, recipient
3. Submit → sign

**Expected**:
- pact row with `mode = 'streaming'`, `rate_lamports_per_slot`, `max_total_lamports`
- Realtime tachometer ticks on `/agents/streaming`

### Test 5.3 — Pause + Resume streaming pact

**Steps**:
1. Open `/agents/streaming`
2. Find the streaming pact row
3. Click "Pause" → sign
4. Verify: bar turns amber, "Paused" label
5. Click "Resume" → sign
6. Verify: bar turns black, "Accruing at $X/sec"

**Expected on-chain**: `pacts.paused = true` then `false`.
**Expected DB**: realtime UPDATE event flips paused flag immediately.

### Test 5.4 — Claim streaming pact

**Steps**:
1. After some time elapsed, click "Claim now"
2. Pick merchant, purpose
3. Click "Fire claim_streaming ix"

**Expected**: server signs (using card.agent_pubkey == relayer), submits, claimed amount goes up.

### Test 5.5 — Open Delivery Escrow

**Pre**: ALICE wants to pre-fund a delivery to merchant BOB.

**Steps**:
1. `/cards/new?mode=delivery_escrow`
2. Set amount, merchant_pubkey = BOB, deadline
3. Submit → sign

**Expected**: pact with `mode = 'delivery_escrow'`, `escrow_merchant_pubkey = BOB`, `escrow_amount`, `confirm_deadline_slot`.

### Test 5.6 — Release escrow (buyer-confirmed)

**Steps**:
1. ALICE on `/cards/<pact-pubkey>` → "Release"
2. Sign
3. Verify pact `released = true`, BOB receives the funds

### Test 5.7 — Release escrow (cron-driven, post-deadline)

**Pre**: an open escrow whose `confirm_deadline_slot` has passed.

**Steps**:
1. Wait for cron tick (5-min interval)
2. OR fire manually from `/admin/cron` → "release_escrow_overdue"

**Expected**: `pacts.released = true`, `released_caller_pubkey = relayer`, `released_is_buyer_confirmed = false`. BOB receives funds.

### Test 5.8 — Dispute escrow

**Pre**: open escrow.

**Steps**:
1. Within dispute window, ALICE → "Dispute" on the pact detail
2. Sign

**Expected**: pact `refunded = true`, ALICE receives funds back.

### Test 5.9 — Close OneShot pact (refund unspent)

**Steps**:
1. After spending some of the pact, click "Close pact"
2. Sign

**Expected**: pact closed, vault USDC returned to ALICE authority ATA.

### Test 5.10 — Bulk-close all pacts under a card

**Pre**: a card with ≥2 open pacts.

**Steps**:
1. `/cards/<card>` → "Close all N open" red button
2. Sign each batch (max 6 per tx)

**Expected**: all pacts close, killchain animation plays once for each.

### Test 5.11 — Revoke card (kills all pacts)

**Pre**: a card with active pacts.

**Steps**:
1. `/cards/<card>` → slide "Slide to revoke card →"
2. Sign

**Expected**:
- Card `revoked = true` instantly
- ALL child pacts freeze (visible animation in `/cards`)
- "Card revoked on-chain in <0.5s. N pacts frozen."

---

## 6 · Groups (Consumer · ALICE + BOB + CAROL)

### Test 6.1 — Create group account (3-of-3 quorum)

**Pre**: ALICE custodian. BOB + CAROL added as members via API.

**Steps**:
1. POST `/api/group-accounts` with `members: [ALICE, BOB, CAROL]`, `quorum: 3`
2. ALICE on `/groups` → see new group selector card
3. Verify: "quorum 3 · threshold $X"

### Test 6.2 — Custodian creates spend request

**Steps** (ALICE):
1. `/groups` → click group → "+ Request spend"
2. Recipient: external pubkey, amount: 50 USDC, note: "team lunch"
3. Click "Create request + spawn Pact" → sign
4. Verify Pact PDA spawned, request appears with "0/3 approvals"

### Test 6.3 — Members vote

**Steps** (ALICE):
1. Click "✓ Approve" on the request
2. Sign attestation message in Phantom (signMessage)
3. Verify "1/3 approvals"

(Switch wallet → BOB)

**Steps** (BOB):
1. Open `/groups`, navigate to the group
2. See pending request → "✓ Approve" → sign attestation
3. Verify "2/3 approvals"

(Switch wallet → CAROL)

**Steps** (CAROL):
1. Same → approve → "3/3 approvals" → status flips to `quorum_met`

**Expected DB**: `group_spend_requests.status = 'quorum_met'`, `voters` array has 3 approve entries with each member's signature.

### Test 6.4 — Cron fires the spend

**Steps**:
1. Wait for next cron tick (60s)
2. OR fire manually `/admin/cron` → "fire_quorum_met_group_spends"

**Expected**:
- Request status → `fired`
- Pact transfers 50 USDC to recipient
- Solscan: signature visible
- Realtime UPDATE on the group request

### Test 6.5 — Deny vote (negative path)

**Steps**:
1. ALICE creates new request
2. BOB approves
3. CAROL clicks "Pass" (deny)

**Expected**: `denials = 1`, `quorum_met` does not trigger.

### Test 6.6 — Vote replay attack (negative)

**Steps**:
1. Member tries to vote twice on the same request

**Expected**: server rejects second vote with `already_voted` error.

### Test 6.7 — Wrong member tries to vote (negative)

**Steps**:
1. A wallet not in the group tries to POST `/api/group-accounts/approve`

**Expected**: 403 `not_a_member`.

---

## 7 · Savings / Wishes (Consumer · ALICE)

### Test 7.1 — Create savings bucket

**Steps**:
1. `/wishes` → "Save" tab
2. Goal label "Vacation", target `500.00`, category "vacation"
3. "+ New bucket"

**Expected DB**: `save_for_buckets` row.
**Expected UI**: bucket card appears in grid-3.

### Test 7.2 — Schedule recurring send

**Pre**: ALICE has delegated card (Phase 5).

**Steps**:
1. `/wishes` → "Schedule" tab
2. Recipient pubkey, amount `5.00`, cadence `WEEKLY`, day=Friday, time=09:00
3. Click "Save wish"

**Expected DB**: `scheduled_sends` row with `enabled = true`.
**Expected on-chain**: relayer fires once next tick → receipt appears in `/ledger`.

### Test 7.3 — Round-up rule

**Steps**:
1. `/wishes` → "Round-up" tab
2. Round to $0.50, dest pubkey, daily cap $5
3. Save

**Expected DB**: `round_up_rules` row, fires on each direct_send rounding up to nearest $0.50.

### Test 7.4 — Gift send

**Steps**:
1. `/wishes` → "Gifts" tab
2. Recipient handle `@charlie`, amount `10.00`, note "happy bday"
3. Send

**Expected**: gift expires if unclaimed → auto-refund.

---

## 8 · Allowances (Consumer · ALICE → BOB as kid)

### Test 8.1 — Create allowance

**Steps** (ALICE):
1. `/allowances` → "I'm paying" tab
2. Kid pubkey = BOB, weekly $20, daily cap $5
3. Save

**Expected DB**: `allowances` row.

### Test 8.2 — Kid view

**Steps** (BOB):
1. `/allowances` → "I'm receiving" tab
2. See allowance from ALICE: weekly $20, daily $5
3. "Spawn kid card" → sign (creates BOB's spending card linked to allowance)

### Test 8.3 — Kid spends within cap

**Steps** (BOB):
1. Use kid card to make a $3 spend
2. Verify ALLOW + ALICE's allowance deducted

### Test 8.4 — Kid exceeds daily cap (negative)

**Steps** (BOB):
1. Try to spend $10 with daily $5 cap

**Expected**: DENY with `deny_code = OverCap`.

---

## 9 · Merchant flow (Merchant · BOB)

### Test 9.1 — Generate Pay QR

**Steps** (BOB):
1. `/request` → amount `10.00`, memo "coffee"
2. Click "Generate QR"
3. Verify Solana Pay URL + QR rendered

### Test 9.2 — Customer pays via QR

**Steps** (ALICE in another tab):
1. `/send` → method "QR" → drop screenshot of BOB's QR
2. Verify autofill
3. Pay

**Expected**: receipt with `merchant_pubkey = BOB`, `merchant_handle` resolved if BOB has one.

### Test 9.3 — Merchant analytics

**Steps** (BOB):
1. `/m/me/analytics`
2. Verify counters: revenue 24h/7d, txn count, dispute rate, trust score

### Test 9.4 — Publish capability

**Steps** (BOB):
1. `/m/me/capabilities`
2. Click "+ New capability"
3. Domain: `bob.example`, method: `POST`, path: `/api/research`, amount: 0.50, version: `v1`
4. Sign + publish

**Expected DB**: `verified_merchants` row. Capability hash registered.

### Test 9.5 — DNS verify

**Steps** (BOB):
1. `/m/me/verify`
2. Get TXT record like `_settle.bob.example` → `pubkey=...sig=...`
3. Click "Verify"

**Expected**: backend resolves DNS, validates pubkey + sig, sets `merchants.dns_verified = true`.

### Test 9.6 — Configure webhook

**Steps** (BOB):
1. `/m/me/webhook`
2. URL `https://bob.example/hooks/settle`
3. Secret rotates
4. Save

**Expected DB**: `merchant_webhooks` row with secret. Test endpoint receives signed payload on next receipt.

### Test 9.7 — Customer disputes a receipt

**Steps** (ALICE):
1. Open a recent receipt
2. Click "Dispute" → reason
3. Submit

**Expected DB**: `disputes` row with `status = pending`.

### Test 9.8 — Merchant resolves dispute

**Steps** (BOB):
1. `/m/me/disputes`
2. See pending dispute
3. Click "Generate AI draft" → see drafted response
4. Edit → "Approve refund" OR "Deny"
5. Sign

**Expected**:
- Approve → on-chain refund tx, dispute `resolution_decision = approved_refund`
- Deny → dispute `status = denied`, no on-chain action

### Test 9.9 — Public merchant profile

**Steps** (anyone, no wallet):
1. Open `/m/bob`
2. Verify: handle, trust score, stats grid (receipts, payers, revenue, disputes), recent activity, embed snippets, pubkey

---

## 10 · Agent flow (Agent · ALICE)

### Test 10.1 — Hire from template

**Steps** (ALICE):
1. `/agents/templates` → click "Research" template
2. Verify cap, expiry, allowlist preview
3. Click "Use this template" → routes to `/agents/new` with prefill
4. Customize, sign

**Expected**: new AgentCard + Pact spawned.

### Test 10.2 — Publish a template

**Steps**:
1. `/agents/templates/new`
2. Slug, title, description, defaults
3. Sign (wallet auth)

**Expected DB**: `agent_templates` row.

### Test 10.3 — Hire-Blink share link

**Steps**:
1. `/agents` → AgentDetail → "Share via Blink"
2. Routes to `/blink/research?card=...`
3. Verify W6 light card with template details + Hire CTA
4. Copy URL, paste in Twitter (or Discord) → verify Phantom unfurls as Action card

### Test 10.4 — Agent decisions feed

**Pre**: ALICE has agents that have made spends/denies.

**Steps**:
1. `/audit` (or `/agents` → "See live decisions")
2. Verify realtime feed: each decision shows ALLOW/DENY pill, card, merchant, amount, deny_code if any, slot, ts
3. Click row → routes to `/r/<request_id>`

### Test 10.5 — Agent makes spend (via demo-agent app)

**Pre**: Run `apps/demo-agent` locally with `SETTLE_AGENT_PRIVKEY` from test 2.1.

**Steps**:
1. Demo agent runs → makes x402 call
2. Verify policy_decision recorded
3. Real-time appears in `/audit`

---

## 11 · Receipts kinds (each one fires a different code path)

Test each kind, verify receipt_kind column, verify hash chain on /verify:

| Kind | Triggered by |
|---|---|
| `direct_send` | `/send` |
| `link_send` | `/send/link` claim |
| `x402_spend` | demo-agent x402 call via card |
| `streaming_claim` | claim_streaming ix |
| `escrow_release` | release_delivery_escrow ix |
| `escrow_dispute` | dispute_delivery_escrow ix |
| `refund` | merchant approves dispute |

---

## 12 · Notifications

### Test 12.1 — In-app notifications inbox

**Pre**: ALICE has had at least one denied spend (e.g. cap exceeded) and one group request awaiting her vote.

**Steps**:
1. `/notifications`
2. Verify list shows real items derived from `policy_decisions` (denies)
3. Click row → detail panel renders
4. Click "Mark all read"

### Test 12.2 — Web push

**Pre**: VAPID configured, ALICE has subscribed via `/settings/notifications`.

**Steps**:
1. Trigger a deny (test 5.x or test 6.x)
2. Verify push notification fires on device
3. Tap → opens Settle app at right route

---

## 13 · Federation (Public)

### Test 13.1 — Federation panel on leaderboard

**Pre**: at least one federation_origin row.

**Steps**:
1. `/leaderboard` → see "Federation" section
2. Verify trusted origins listed

### Test 13.2 — Operator promotes origin

**Steps** (operator):
1. `/admin/federation/origins` → enter CRON_SECRET
2. Click "Promote" on a pending origin
3. Verify status flips to `trusted`

### Test 13.3 — Federated receipts surface in /ledger

**Pre**: trusted origin posted a receipt for ALICE.

**Steps** (ALICE):
1. `/ledger`
2. See federated_trusted rows alongside native rows
3. Toggle "+ untrusted federated" → see federated_untrusted with amber border

---

## 14 · Developer surface

> **Hard rule for this section:** every test is from the perspective of a real external developer using the surface AS A USER, not as someone with this monorepo open.
>
> - SDK tests: install from registry/path into a **fresh empty directory** outside the monorepo. Open a brand-new terminal. Run real code. Hit real devnet.
> - MCP tests: launch the MCP server in a separate process, talk to it over stdio JSON-RPC the way a real MCP client (Claude Desktop / Cursor) would. Initialize, list tools, call tools, parse responses.
> - Web component tests: drop the `<script>` tag into a brand-new `index.html`, open in a browser, click the actual element. Don't import via React.
> - Webhook tests: spin up a real HTTP receiver on `:4000`, register the URL via the Settle UI/API, fire a real on-chain event, watch the POST land.
>
> If you're testing from inside the monorepo with workspace shortcuts, you're cheating. A real developer doesn't have that.

---

### 14.1 · TypeScript SDK — real developer flow

#### Test 14.1.1 — Fresh-directory install

In a brand-new throwaway directory `/tmp/settle-sdk-test-ts`:
1. `mkdir /tmp/settle-sdk-test-ts && cd /tmp/settle-sdk-test-ts`
2. `npm init -y`
3. `npm i settle-protocol-sdk` (from npm if published, else `pnpm pack` the local package and install the tarball)
4. Verify `node_modules/settle-protocol-sdk/package.json` exists with the right name + version
5. Write `test.ts`:
   ```ts
   import { Settle } from "settle-protocol-sdk";
   const s = new Settle({ rpcUrl: "https://api.devnet.solana.com", payerSecret: "<base58 of ALICE>" });
   const r = await s.pay({ to: "@bob", amount: 0.05, token: "USDC" });
   console.log(JSON.stringify(r, null, 2));
   ```
6. `npx tsx test.ts`
7. Verify output has `request_id`, `signature`, `kernel_commit`, `confirmedMs < 5000`
8. Verify the signature on Solscan resolves
9. Verify the receipt row exists in DB
10. Verify ALICE's UI `/ledger` shows the new send within 5s

#### Test 14.1.2 — Every public method actually works

For each exported method on the TS SDK, write a real call against devnet and verify the response shape + side-effects:

- `pay({ to, amount, token })` → receipt
- `payBlink({ to, amount, token })` → returns Solana Action / Blink URL, opens in browser, completes
- `verify({ hash })` → returns `{ valid: true, kinds: [...], 4_hashes: [...] }`
- `verifyByPubkey({ pubkey })` → returns trust report
- `history({ limit })` → returns list of receipts
- `streamingOpen({ to, total, perSecond })` → returns pact_pubkey
- `streamingPause({ pact })`, `streamingResume({ pact })`, `streamingClaim({ pact })`
- `escrowOpen`, `escrowRelease`, `escrowDispute`
- `oneshotOpen`, `oneshotClose`
- `cardSpawn({ ... })`, `cardRevoke({ pubkey })`
- `groupCreate`, `groupVote`
- `attest({ subject, claim })`
- `webhookConfigure({ url, secret, events })`
- Whatever else `packages/sdk-ts/src/index.ts` exports — every public function

For each: real call → real on-chain tx → real DB row → assertion.

#### Test 14.1.3 — TypeScript types + IntelliSense

In the test dir:
1. Open `test.ts` in a fresh editor
2. Verify `s.pay({ ... })` autocompletes `to`, `amount`, `token`, `note`, `extras`
3. Verify return type is `Promise<Receipt>` with full property completion
4. Pass a wrong type (`amount: "five"`) — `tsc --noEmit` errors

#### Test 14.1.4 — Error handling

1. Call `s.pay({ to: "@nonexistent_handle_xyz", amount: 1 })` → throws `SettleHandleError` with the right code
2. Call `s.pay({ to: "@bob", amount: 999_999_999 })` (insufficient) → throws `SettleInsufficientError`
3. Call with bad RPC URL → throws `SettleRpcError`
4. Call after card revoked → throws `SettleAuthorityError`

Each throws a typed error with `code`, `message`, and where applicable `request_id`.

#### Test 14.1.5 — Browser bundle

1. Bundle SDK with esbuild for browser target → output size < 50 KB gzipped
2. In a fresh `index.html`, `<script type="module">import { Settle } from './settle.bundle.js'; ... </script>`
3. SDK loads in browser, calls work using injected wallet
4. No `process` / `Buffer` polyfill errors

---

### 14.2 · Python SDK — real developer flow

#### Test 14.2.1 — Fresh venv install

In a brand-new directory `/tmp/settle-sdk-test-py`:
1. `python -m venv .venv && source .venv/bin/activate`
2. `pip install settle-protocol-sdk` (or local wheel via `pip install /path/to/settle_protocol_sdk-*.whl`)
3. Verify install completed, `pip show settle-protocol-sdk` returns version
4. Write `test.py`:
   ```python
   from settle_sdk import Settle
   s = Settle(rpc_url="https://api.devnet.solana.com", payer_secret="<base58 ALICE>")
   r = s.pay(to="@bob", amount=0.05, token="USDC")
   print(r)
   ```
5. `python test.py`
6. Verify output, verify Solscan, verify DB row, verify cross-wallet UI sync

#### Test 14.2.2 — Every public method (same coverage as TS)

Each method on the Python SDK gets the same real-call test as 14.1.2. The full list lives in `packages/sdk-py/settle_sdk/__init__.py` — every public symbol.

#### Test 14.2.3 — Type hints + linting

1. `mypy test.py --strict` → zero errors
2. `pyright test.py` → zero errors
3. Pass wrong type to `s.pay(amount="five")` → mypy errors

#### Test 14.2.4 — Error handling

Same matrix as 14.1.4 but with Python `SettleHandleError`, `SettleInsufficientError`, etc.

#### Test 14.2.5 — Async variant

If SDK exports `AsyncSettle`:
```python
import asyncio
from settle_sdk import AsyncSettle
async def main():
    s = AsyncSettle(...)
    r = await s.pay(to="@bob", amount=0.05)
asyncio.run(main())
```

Concurrency: 10 parallel `s.pay()` calls all succeed.

---

### 14.3 · Rust SDK — real developer flow

#### Test 14.3.1 — Fresh crate install

In `/tmp/settle-sdk-test-rs`:
1. `cargo init --bin`
2. Add to `Cargo.toml`:
   ```toml
   settle-sdk = "0.1"
   tokio = { version = "1", features = ["full"] }
   ```
3. `cargo build` succeeds
4. Write `src/main.rs`:
   ```rust
   use settle_sdk::Settle;
   #[tokio::main]
   async fn main() {
       let s = Settle::new("https://api.devnet.solana.com", "<base58 ALICE>");
       let r = s.pay("@bob", 0.05, "USDC").await.unwrap();
       println!("{:?}", r);
   }
   ```
5. `cargo run` → real on-chain tx, prints receipt
6. Verify Solscan + DB + UI sync

#### Test 14.3.2 — Every public method (same coverage as TS/Python)

#### Test 14.3.3 — Compilation

`cargo build --release` succeeds, binary < 5 MB.

#### Test 14.3.4 — Error types

`Result<Receipt, SettleError>` with proper variants for handle/insufficient/rpc/authority. Match arms compile.

---

### 14.4 · Cross-language hash parity (the contract)

#### Test 14.4.1 — Same input, same `kernel_commit`

For 100 random `(payer, recipient, amount, slot, kind)` tuples:
1. TS SDK: `settle.computeCommit(input)` → hash A
2. Python SDK: `s.compute_commit(input)` → hash B
3. Rust SDK: `s.compute_commit(input)` → hash C
4. On-chain (Anchor program receipts table): `kernel_commit` for the same args → hash D
5. **All four MUST be byte-equal.** Any mismatch = critical bug.

Write `scripts/kernel-parity-cross-lang.ts` that drives all 3 SDKs from the same TS test runner and compares.

#### Test 14.4.2 — Same input, same 4-hash chain

For each test in 14.4.1, also verify that all 4 hashes (`payer_hash`, `recipient_hash`, `meta_hash`, `commit_hash`) match across all 3 SDKs and the on-chain truth.

---

### 14.5 · MCP middleware — real AI assistant flow

> **The user perspective here is an AI assistant** — Claude / Cursor / a custom agent — that loaded Settle's MCP server config and now has 6 tools available.
>
> Test by spawning the MCP server as a subprocess and speaking JSON-RPC over stdio, exactly the way Claude Desktop would.

#### Test 14.5.1 — MCP server starts + advertises tools

1. Spawn: `npx -y @settle/mcp` (or `pnpm tsx mcp/server.ts` from monorepo)
2. Server outputs MCP handshake on stdout
3. Send `initialize` request → server responds with capabilities
4. Send `tools/list` → server returns 6 tools with full JSON schemas:
   - `settle.pay`
   - `settle.verify`
   - `settle.list_capabilities`
   - `settle.open_pact`
   - `settle.close_pact`
   - `settle.refund`
5. Verify each tool has `name`, `description`, `inputSchema` with JSON Schema validation

#### Test 14.5.2 — Each tool actually executes end-to-end

For each of the 6 tools, send a real `tools/call` JSON-RPC request and verify:

**`settle.pay`**:
```json
{ "jsonrpc": "2.0", "method": "tools/call",
  "params": { "name": "settle.pay", "arguments": { "to": "@bob", "amount": 0.05, "token": "USDC" } },
  "id": 1 }
```
- Response contains `request_id`, `signature`, `kernel_commit`
- On-chain tx exists
- DB row exists
- BOB's UI updates

**`settle.verify`**:
- Pass a real hash → returns `{ valid: true, kinds: [...] }` with structured content
- Pass a bogus hash → returns `{ valid: false }`

**`settle.list_capabilities`**:
- Returns array of objects with `pubkey`, `name`, `description`, `category`, `attestation_count`

**`settle.open_pact`**:
- Args: `{ kind: "streaming", to: "@bob", total: 1, per_second: 0.001 }`
- Returns pact_pubkey, signature
- On-chain pact account exists

**`settle.close_pact`**:
- Args: `{ pact: "<pubkey>" }`
- On-chain account closed
- DB row marked closed

**`settle.refund`**:
- Args: `{ request_id: "<id>" }`
- Refund tx fires
- Receipt linked to original

#### Test 14.5.3 — MCP error handling

- Call tool with missing required arg → server responds with structured MCP error (`isError: true`)
- Call tool with invalid card → returns deny code
- Call non-existent tool → JSON-RPC error -32601

#### Test 14.5.4 — Real Claude Desktop / Cursor integration (optional but ideal)

If feasible:
1. Set up Claude Desktop with `settle` MCP entry in config
2. Restart Claude Desktop
3. Open a chat, ask "what tools do you have from settle?"
4. Claude lists the 6 tools
5. Ask "send 0.05 USDC to @bob via settle"
6. Claude invokes `settle.pay` with the right args
7. Real tx fires, receipt comes back, Claude reports it

(If Claude Desktop integration is too friction-heavy, simulate the flow with a JSON-RPC client and document.)

#### Test 14.5.5 — MCP card-scoped permissions

The MCP server is scoped to one `SETTLE_CARD`. Test:
- Spawn MCP server with card A's credentials
- Try to refund a receipt under card B → tool returns auth-denied error, not a refund

---

### 14.6 · `<settle-pay>` web component — real embedder flow

#### Test 14.6.1 — Drop into vanilla HTML

In a fresh `/tmp/settle-pay-test/index.html`:
```html
<!DOCTYPE html>
<html>
<head><script src="https://cdn.settle.dev/components.js"></script></head>
<body>
  <settle-pay
    to="@bob"
    amount="0.05"
    token="USDC"
    note="coffee">
  </settle-pay>
  <script>
    document.querySelector('settle-pay').addEventListener('settle-paid', e => {
      console.log('paid:', e.detail);
    });
  </script>
</body>
</html>
```

Steps:
1. Serve via `python -m http.server`
2. Open in browser → `<settle-pay>` renders as a clickable button
3. Click → wallet adapter modal opens (or burner)
4. Approve → tx fires
5. `settle-paid` event fires with `e.detail = { request_id, signature, kernel_commit }`
6. Console log appears

#### Test 14.6.2 — All component attributes

Test every attribute documented:
- `to`, `amount`, `token`, `note`
- `extras` (split-bill / public-receipt / pact-mode)
- `network` (devnet/mainnet)
- `theme` (light/dark)
- `card` (scoped pact card)

For each attribute change, verify the rendered DOM updates correctly.

#### Test 14.6.3 — Events fired

- `settle-paid` (success)
- `settle-error` (rejection / failure) with `e.detail.code`
- `settle-loading` (lifecycle stages)

#### Test 14.6.4 — Cross-framework

Drop the same `<settle-pay>` into:
- A React app (no wrapper) → works
- A Vue app → works
- A Svelte app → works
- A Next.js page → works (with `'use client'` if needed)

---

### 14.7 · `<settle-verify>` web component — real embedder flow

#### Test 14.7.1 — Drop into vanilla HTML

```html
<settle-verify hash="abc123..." network="devnet"></settle-verify>
```

1. Renders verdict card
2. Shows 4 hashes
3. Shows "VERIFIED" or "INVALID" badge
4. Click → opens full receipt at `/r/<id>`

#### Test 14.7.2 — Programmatic verify

```js
const result = await document.querySelector('settle-verify').verify('abc...');
```

Returns the full verdict object.

---

### 14.8 · Webhooks — real receiver flow

#### Test 14.8.1 — Real webhook receiver setup

1. `pnpm tsx scripts/webhook-receiver.ts` → starts on `:4000`
2. Receiver logs every POST + validates HMAC
3. In Settle UI: `/m/me/manage` → set webhook URL = `http://localhost:4000/webhook`
4. Generate webhook secret in UI → copy
5. Restart receiver with `WEBHOOK_SECRET=<secret>` env

#### Test 14.8.2 — Every event fires + delivers

Trigger each of the 13 webhook events and verify the receiver got a POST with valid HMAC + correct payload schema:

- `receipt.allowed`
- `receipt.denied`
- `pact.opened`
- `pact.paused`
- `pact.resumed`
- `pact.closed`
- `pact.refunded`
- `escrow.released`
- `escrow.disputed`
- `card.spawned`
- `card.revoked`
- `dispute.opened`
- `dispute.resolved`

For each: trigger via UI, watch receiver log, verify HMAC matches, verify JSON shape matches `/docs/webhooks` spec.

#### Test 14.8.3 — Retry on 5xx

1. Configure receiver to return 500 for first 2 attempts, 200 on 3rd
2. Trigger an event
3. Watch retries: t+0s 500, t+30s 500, t+90s 200
4. DB shows `delivery_status = delivered` after 3rd attempt
5. UI dispute-status badge updates

#### Test 14.8.4 — Signature rotation

1. Rotate secret in UI
2. Old signature fails HMAC check on receiver
3. New signature passes
4. Old signature accepted for 24h grace window (overlap), then rejected

#### Test 14.8.5 — Idempotency on receiver side

Same event delivered twice (network retry) → receiver sees both, but `Settle-Idempotency-Key` is identical → receiver dedupes.

---

### 14.9 · Sandbox / faucet

`/sandbox` page:
1. Click "Get test USDC" → 5 USDC airdrops to connected wallet
2. Click "Spawn test card" → card created
3. Click "Run example send" → full e2e tx
4. Each demo action shows real Solscan link

---

### 14.10 · IDL drift detector

#### Test 14.10.1 — TS IDL == on-chain IDL

```bash
pnpm tsx scripts/anchor-ix-coverage.ts
```

1. Loads `target/idl/settle.json` from monorepo
2. Loads on-chain IDL via `anchor idl fetch <PROGRAM_ID>`
3. Byte-equal comparison
4. If different: print full diff, exit 1

---

### 14.11 — API explorer

`/docs/api` (or wherever) → renders OpenAPI spec for every public endpoint with:
- Try-it-out forms that hit real devnet endpoints
- Response schema preview
- Auth header explanation

---

## 15 · Operator

### Test 15.1 — Health check

`/admin/health` — see test 0.3.

### Test 15.2 — Cron force-fire

`/admin/cron` → enter CRON_SECRET → click "Fire claim_streaming" → verify execution row.

### Test 15.3 — Preflight

`/admin/preflight` → green/yellow/red status for: SUPABASE_URL, SERVICE_ROLE_KEY, NVIDIA_API_KEY, RELAYER_PRIVKEY, VAPID_KEY_PAIR, CIRCLE_FAUCET_KEY, etc.

### Test 15.4 — Verifiable build

`/verify-build` → on-chain hash matches committed source-of-truth hash.

---

## 16 · Public surfaces

### Test 16.1 — Walletless verifier

Already covered in Test 4.3.

### Test 16.2 — Capability heatmap

`/leaderboard` — verify live cells, brightest now ranked, all-time leaders table.

### Test 16.3 — Capability discovery (NL search)

`/capabilities/discover` → "fast translation for spanish→english" → verify NVIDIA NIM ranks results.

### Test 16.4 — Public feed

`/feed` — verify rolling list of opt-in public receipts. Real-time inserts.

### Test 16.5 — Stats

`/stats` — verify counters update (24h, 7d, all-time), histograms render.

### Test 16.6 — Public profile

`/at/<handle>` — viewable without wallet. Public stats. "Pay @handle" CTA opens connect modal.

### Test 16.7 — Help / Security / Public Goods / Brand / Changelog / Privacy / Terms

Each loads, no broken links, all anchors scroll correctly.

---

## 17 · Negative paths (rule enforcement)

### Test 17.1 — Cap exceeded

ALICE spends > daily_cap → DENY with `deny_code = 4 OverCap`. UI shows red receipt row + denial notification.

### Test 17.2 — Per-call max exceeded

Single spend > per_call_max → DENY with `deny_code = 5`.

### Test 17.3 — Allowlist miss

Spend to merchant not in allowlist → DENY with `deny_code = 3`.

### Test 17.4 — Capability hash mismatch

Pinned capability spec mismatch → DENY with `deny_code = 7`.

### Test 17.5 — Card revoked

Spend after revoke → DENY with `deny_code = 1`.

### Test 17.6 — Card expired

Spend after expiry_slot → DENY with `deny_code = 2`.

### Test 17.7 — Replay (same nonce twice)

POST same auth challenge nonce → 401.

### Test 17.8 — Wrong authority

Sign with wrong wallet → 401 `pubkey_mismatch`.

### Test 17.9 — Stale signature

Sign challenge from > 5 min ago → 401 `expired`.

---

## 18 · Mobile (390px viewport)

For each screen below, resize to 390px and verify:
- Sidebar collapses to bottom-tab
- No horizontal scroll
- Cards stack vertically
- Tap targets ≥ 44px
- Text readable, no overlap

Critical screens:
- `/dashboard`, `/send`, `/cards`, `/ledger`, `/agents`, `/groups`, `/wishes`, `/allowances`, `/activity`, `/notifications`, `/at/me`, `/onboarding`, `/`, `/verify`, `/m/<handle>`

---

## 19 · Accessibility

For each major screen:
- All text contrast ≥ 4.5:1
- All buttons have visible focus ring
- Tab order logical
- Form labels associated
- aria-labels on icons
- Esc closes modals
- Cmd+K opens command palette

---

## 20 · Performance

- Lighthouse score ≥ 90 on `/`
- LCP < 2.5s on `/dashboard`
- No JS errors in console
- No 404s on assets in Network tab
- WebSocket connections stable (Supabase Realtime)

---

## 21 · Cross-wallet sync verification

For each test where two wallets interact (3.1, 6.x, 8.x, 9.2, etc):

**ALICE side**:
- UI updates immediately after sign
- Toast confirms
- Solscan link works

**BOB side** (in separate browser profile, same time):
- Activity badge increments
- `/ledger` shows the new receipt within 5s of confirmation
- `/dashboard` "received" counter increments
- If subscribed: web push fires

---

## 21a · Pure user-journey tests (drive the UI like a real user)

> **Hard rule for these tests:** every step is a Playwright click / type / scroll / wait. NO direct API calls. NO programmatic tx signing outside the wallet adapter. The runner must literally drive the browser the way a human would. If it's a button, the runner clicks it. If it's a form, the runner types in it. If it's a Phantom popup, the runner opens the burner equivalent and clicks Approve.

> If any of these tests passes by skipping the UI (e.g., calling `/api/cards/list` directly), the test FAILS the audit. Re-do it via UI clicks.

### 21a.1 — Brand-new user, no wallet, lands on `/`

ALICE has never used Settle. Open `/` in a clean browser context.

Drive via clicks:
1. Read the hero, click "Open product preview" → routes to `/dashboard?demo=1`
2. Demo state shows fake data with banner "demo mode"
3. Click "Connect a wallet" → wallet modal opens
4. Pick "Burner" (which represents Phantom in test mode)
5. Approve in the modal popup
6. Auto-redirected (or stays on landing) — verify
7. Sidebar appears, "You" footer card shows truncated pubkey + "Tap to claim a handle"
8. Click "You" card → routes to `/settings`
9. Settings page shows "Profile" tab with handle input

### 21a.2 — Onboarding wizard end-to-end

Continuing from 21a.1 with no handle yet.

1. Click sidebar → Home
2. Hero: "Connect a wallet to see your dashboard." — verify
3. Click sidebar → "Settings" → no, wait, go through `/onboarding`
4. Manually navigate to `/onboarding`
5. Step 1: Connect wallet — already connected, auto-advances
6. Step 2: "Get devnet funds" — click button
7. Wait for confetti + "Funded" state
8. Step 3: "Create card" — defaults shown, click "Create AgentCard"
9. Burner approves
10. Step 4: "You're ready" with agent secret
11. Click "Open dashboard" → arrives at `/dashboard` with real card present

### 21a.3 — Send money (handle method) full flow

Pre: ALICE onboarded, BOB has handle `@bob`.

Drive via clicks:
1. ALICE clicks sidebar "Send"
2. Method picker → click "@handle" pill (becomes black)
3. Type `@bob` in To field, blur
4. Wait for green ✓ and resolved pubkey display
5. Type `5.00` in Amount
6. Verify token picker shows "USDC"
7. Type "lunch" in For
8. Click "Public receipt" extra — checkbox should fill black
9. Read summary on right — shows "$5.00 / USDC → @bob / lunch / public yes"
10. Click "Pay 5.00 USDC to @bob"
11. Burner adapter approves
12. Lifecycle stage 1: "Signing in Phantom…"
13. Lifecycle stage 2: "Confirming on Solana…"
14. Lifecycle stage 3: "Sent." with green check
15. Toast appears bottom-center
16. Sidebar "You" card unchanged (it's BOB who got money, not ALICE's notification)
17. Click "View on Solscan ↗" → opens new tab to Solscan
18. Click "Send another" → form resets

### 21a.4 — Cross-wallet receive (BOB sees ALICE's send within 5s)

In a SECOND browser context (parallel to ALICE):

1. BOB connected to BOB's burner
2. On `/dashboard`, "Today" cell reads $0.00 received before
3. ALICE fires Test 21a.3
4. Within 5s of confirmation, BOB's `/dashboard` Today cell auto-updates to "$5.00 received · 1 receipt" via Realtime
5. BOB's sidebar shows updated state without manual refresh
6. BOB clicks `/ledger` → row "+$5.00 from <ALICE_pubkey>" with hash-mark `#` (native)
7. Click row → routes to `/r/<request_id>` → 4-hash chain animation plays
8. Click "Verify" → 4 ✓ hashes match

### 21a.5 — Send by QR (full physical-style flow)

Pre: BOB on `/request` has generated a $10 QR for "coffee".

1. ALICE in tab 1: navigate to `/send`
2. Method picker → click "QR" pill
3. Dropzone shows "Drop a Solana Pay QR screenshot"
4. Take a screenshot of BOB's QR (use `page.screenshot` of the canvas)
5. Drop the image onto the dropzone
6. Verify autofill: To = BOB pubkey, Amount = 10.00, Note = "coffee"
7. Click "Pay 10.00 USDC to <bob-short>"
8. Burner approves
9. Confirmed → "Sent" state
10. Switch to BOB's tab — `/dashboard` shows received +10.00 within 5s

### 21a.6 — Receive money + verify the proof

BOB receives $5 from ALICE (Test 21a.3). Now BOB drives:

1. Notification badge appears on sidebar (if push subscribed) OR `/notifications` increments
2. Click sidebar `/ledger`
3. Row shows the receive
4. Click row
5. Receipt detail loads with 4-hash chain animation
6. Click "Verify" button
7. 4 hashes recompute and all match → green check
8. Click "Share" / copy link
9. Open the link in incognito (no wallet) → /verify/<hash> page
10. Page shows verdict "VERIFIED" + 4 hashes + narration

### 21a.7 — Hire AI agent end-to-end

ALICE drives:

1. Click sidebar (or surface switcher) → "Agents"
2. List is empty; "Hire your first agent →" CTA visible
3. Click CTA → routes to `/agents/new`
4. Form: task = "Translate this paper", cap = $0.50, expiry 15min, allowlist defaulted
5. Click "Spawn Pact card"
6. Burner approves
7. Wax seal animation plays
8. Routes to `/cards/<pact-pubkey>?surface=agent`
9. Card detail shows: 4-hash chain (none yet), allowlist chips, expiry timer
10. Demo agent (run via `apps/demo-agent`) makes a real x402 call against this card
11. Within 5s, "Live decisions" feed shows ALLOW row
12. Receipt count increments

### 21a.8 — Group spend (ALICE + BOB + CAROL all 3 tabs open)

Three browser contexts in parallel.

Steps:
1. ALICE creates 3-member group via API (or UI if available)
2. ALICE clicks `/groups`, sees the group, clicks it
3. Click "+ Request spend"
4. Recipient = some external pubkey, amount = $5, note = "team coffee"
5. Sign tx (Pact spawn) → confirm
6. Request appears with "0/3 approvals"
7. ALICE clicks "✓ Approve" on her own request → sign attestation message
8. Burner approves the signMessage
9. Request shows "1/3 approvals"
10. Switch to BOB's tab — `/groups` shows group → click → see pending request → "✓ Approve"
11. Burner BOB approves
12. Status → "2/3 approvals"
13. Switch to CAROL's tab — same → CAROL approves → "3/3 approvals" → status flips to `quorum_met`
14. Wait 60s OR force-fire `/admin/cron/group-spend-fire-quorum-met`
15. Status flips to `fired` with Solscan link
16. Recipient gets the $5 on-chain
17. ALICE's `/groups` shows updated state via Realtime in <5s

### 21a.9 — Split bill (3 payers)

ALICE drives:
1. Click sidebar TOOLS → "Split bill" (verify the link works)
2. On `/split-bill`: label "Friday dinner", total $60, payers 3
3. Per-payer preview shows $20.00
4. Click "Create bill"
5. Sign
6. Routes to `/split-bill/<id>` showing 0/3 paid
7. Copy share link from the page
8. Switch to BOB's tab, paste link → /split-bill/<id> shows BOB's share view
9. BOB clicks "Pay my share" → sign → 1/3 paid
10. Switch to CAROL's tab, repeat → 2/3 paid
11. Switch back to ALICE, ALICE pays her own share → 3/3 paid → status flips to `closed`
12. Bill recipient (ALICE's choice) received $60 across 3 receipts

### 21a.10 — Merchant: BOB receives QR pay + sees in dashboard

BOB drives:
1. Click sidebar (merchant surface) → `/m/me/manage`
2. Click "Show pay-me QR" → routes to `/request`
3. Generate QR: amount $10, memo "coffee"
4. Copy the URL
5. Switch to ALICE's tab, paste in /send screenshot dropzone
6. ALICE pays
7. BOB's `/m/me/analytics` shows revenue 24h += $10 within 5s
8. BOB's `/m/me/disputes` shows no disputes (yet)

### 21a.11 — Dispute flow (customer opens, merchant resolves)

ALICE files dispute:
1. ALICE on a recent receipt → click "Dispute" button
2. Modal: reason = "didn't get my coffee", evidence text
3. Submit → sign
4. Modal closes, receipt shows "dispute pending" badge

BOB resolves:
5. Switch to BOB's tab → `/m/me/disputes`
6. New dispute appears at top
7. Click row → drawer opens with details
8. Click "Generate AI draft" → AI text appears
9. Edit text → click "Approve refund"
10. Sign refund tx
11. Confirmed → dispute status `approved_refund`
12. ALICE's tab — `/ledger` shows refund row within 5s, original receipt now linked to refund

### 21a.12 — Save toward a goal (full bucket lifecycle)

ALICE drives:
1. Click sidebar `/wishes` → "Save toward" tab
2. Fill: label "Vacation", target $500, category "vacation"
3. Click "+ New bucket"
4. Bucket appears with 0/500
5. Set up a round-up rule on `/wishes` "Round-up" tab → round to $0.50, dest = bucket
6. ALICE makes a $4.30 send → round-up of $0.20 fires (cron or trigger)
7. `/wishes` Save tab → bucket now shows $0.20 / $500

### 21a.13 — Schedule a recurring send (full automation)

ALICE drives:
1. `/wishes` → "Schedule" tab
2. Recipient = BOB, amount $5, cadence WEEKLY, day Monday, time 09:00
3. Save (sign)
4. `next_run_slot` set
5. Force-fire `/admin/cron/scheduled-send-fire`
6. ALICE's balance −$5, BOB's balance +$5
7. Receipt appears in ALICE's `/ledger` with `import_source = NULL` (real Settle send)

### 21a.14 — Revoke a card mid-flight

ALICE drives:
1. Has an active card with running streaming pact
2. Goes to `/cards`
3. Sees streaming pact ticking
4. Clicks card → `/cards/<id>?surface=agent`
5. Slides "Slide to revoke card →"
6. Burner approves
7. Within 1s: card row turns red, all child pacts freeze
8. Toast: "X pacts frozen on-chain in <0.5s"
9. Verify on `/cards` page: pact shows "frozen" overlay

### 21a.15 — Walletless verifier (third-party verification)

User has no wallet. Receives a receipt link from a friend.

1. Open `/verify` in clean incognito (no wallet)
2. Type/paste a receipt's hash (one of the 5)
3. Click "Verify"
4. 3-stage lifecycle plays
5. Verdict: VERIFIED with all 4 hashes shown
6. Click "Open receipt" → routes to `/r/<id>` (still walletless — view-only)
7. Receipt detail renders without prompting wallet connect

### 21a.16 — Mobile user (390px width — touch flows)

Set Playwright viewport to 390×844 for the entire test.

1. Open `/` → marketing landing scrollable, CTA button reachable with thumb
2. Click "Connect a wallet" → modal renders correctly
3. Burner connect
4. Bottom-tab nav appears (sidebar collapsed)
5. Tap each tab — Home / Send / Receipts / Pacts → routes correctly
6. On `/send`: form fields tappable (≥44px), keyboard pops up correctly
7. Pay flow completes
8. Receipt detail readable, hashes wrap correctly, no horizontal scroll

### 21a.17 — Switch surfaces via top tab

ALICE drives:
1. On `/dashboard` (consumer surface)
2. Click surface switcher pill "Agent"
3. URL updates to `?surface=agent`, sidebar swaps to agent nav, lands on `/agents`
4. Click "Merchant" → `/m/me/manage`, sidebar = merchant
5. Click "Developer" → `/docs`, sidebar = developer
6. Click "Operator" → `/control-center`, sidebar = operator
7. Click "Public" → `/verify`, sidebar = public
8. Click "Consumer" → back to `/dashboard`
9. Each switch: animation plays, no flash, no broken state

### 21a.18 — Disconnect / reconnect

ALICE drives:
1. Sidebar "You" card → click "Disconnect"
2. Wallet disconnects, sidebar shows "Connect a wallet" prompt
3. Auth cache cleared (next signed action would re-prompt)
4. Click connect again → Burner re-connects
5. Sidebar restores with handle + truncated pubkey

### 21a.19 — Multi-tab sync

ALICE drives:
1. Open Settle in tab A, navigate to `/dashboard`
2. Open Settle in tab B (same browser context, same wallet), navigate to `/wishes`
3. In tab A: open a new pact via `/cards/new`, sign, confirm
4. Tab B should reflect the new pact in `/cards` list within 5s (Realtime)

### 21a.20 — Browser back/forward sanity

ALICE drives:
1. /dashboard → /send → fill form (don't submit) → browser back
2. Back to /dashboard
3. Forward → /send — form state can be empty (acceptable) but page renders correctly
4. Refresh /send mid-flow → wallet still connected, form blank (acceptable)
5. Click "Open receipt" link → routes correctly
6. Browser back → returns to ledger

### 21a.21 — Form validation (every input)

ALICE drives, expects clear inline errors:

- Send: empty amount → "Enter an amount." toast
- Send: negative amount → toast rejects
- Send: amount > balance → submit fails with "insufficient" UI message
- Send: invalid handle → red toast on blur
- Cards/new: per-call > daily cap → "Per-call max must be ≤ daily cap." toast
- Cards/new: expiry days > 365 → input clamps OR error
- Wishes: empty label → "Add a label" toast
- Group spend: empty dest → "Recipient + amount required." toast

### 21a.22 — Wallet rejection handling

ALICE drives:
1. Start a Send flow
2. When Burner adapter triggers, REJECT instead of approve
3. UI shows error toast "Send failed: User rejected the request" or similar
4. Form state preserved (can retry without re-typing)
5. No partial DB write, no orphan tx
6. ALICE retries → approves this time → success

### 21a.23 — Slow network handling

Set Playwright network to "Slow 3G".

1. Navigate to /dashboard → loading spinner appears (not blank screen, not janky)
2. Skeleton renders before data lands
3. Send flow: each fetch shows progress, no double-submit possible (button disabled while pending)
4. Realtime channel reconnects after brief disconnect

### 21a.24 — Notification flow (denial reaches user)

ALICE has a card with $1 daily cap. Demo agent tries to spend $5.

1. Demo agent fires real x402 call
2. Server denies with `deny_code = 4 OverCap`
3. ALICE's `/notifications` shows the denial within 5s (Realtime)
4. If push subscribed: web push fires
5. ALICE clicks notification → drawer opens with full details (deny code, merchant, amount, slot)
6. Click "See live decisions" → routes to `/audit` filtered to that card

### 21a.25 — Receipt sharing (public proof)

ALICE drives:
1. Open a receipt in `/ledger`
2. Click share button (or copy receipt URL `/r/<id>`)
3. Open URL in incognito (no wallet)
4. /r/<id> renders read-only — receipt detail with verify button
5. Click verify → 4 hashes recompute → verdict
6. Page is OG-tagged → preview renders correctly when shared on Twitter

---

## 21b · UI error/edge cases (non-happy paths)

### 21b.1 — Invalid handle in URL

Open `/at/nonexistent-handle-xyz` → 404 page renders W6-styled.

### 21b.2 — Invalid receipt id

Open `/r/badxxxxxxxxxxxx` → "Failed to load receipt" card with retry CTA, NOT a raw error.

### 21b.3 — Expired payment link

Open `/pay/<token>` for a link past expiry → "Link expired" card.

### 21b.4 — Already-claimed link

Open `/pay/<token>` where someone already claimed → "Already claimed" card.

### 21b.5 — Connection error

Disconnect Supabase mid-session → UI shows "Couldn't connect" banner, retry button, but does not crash.

### 21b.6 — On-chain rejection (program-level)

Force a tx that the program rejects (e.g., spend without authority) → UI shows "Send failed: <program error message>" toast, no crash.

### 21b.7 — Hover states

Hover every button in the W6 sidebar / topbar / cards — verify hover transition (background or border subtly changes), no flicker.

### 21b.8 — Focus states

Tab through every form using only the keyboard — visible focus ring on every input/button, logical order, no traps.

### 21b.9 — Long content overflow

Receipt with 200-char purpose text → truncates with ellipsis OR wraps cleanly, no horizontal scroll.

### 21b.10 — Empty states everywhere

For each surface, force the empty state and verify each has copy + CTA + W6 design (not blank page):
- /cards (no pacts)
- /ledger (no receipts)
- /agents (no agents)
- /groups (not in any)
- /wishes (no buckets)
- /allowances (none)
- /activity (no decisions)
- /notifications (all clear)
- /m/me/disputes (none open)
- /leaderboard (no capabilities)

---

## 21c · Cross-wallet UI sync (NEW — honest gap)

> **Status: pre-req infra missing. Currently tested ONLY via DB+on-chain
> scripts; no two-context UI test exists yet.** This section is added to
> formalize what the autonomous prompt's "no shortcuts" rule actually
> requires. See pre-reqs below.

Pre-req — must be built before this section can run for real:
- `SettleE2EBurnerAdapter`: a wallet adapter that loads a base58 secret
  from `localStorage["settle-e2e-burner-key"]` (or
  `process.env.NEXT_PUBLIC_E2E_BURNER_KEY`) instead of generating a fresh
  random keypair per page load. This is what lets Playwright pre-seed
  ALICE / BOB / CAROL keypairs into separate browser contexts and have
  each context land real on-chain txs as that persona.
- `apps/web/e2e/helpers/seed-burner.ts`: seeds the localStorage key in
  Playwright `globalSetup` before the page mounts the wallet provider.
- `bootstrap-test-wallets.ts` keypairs (already exist) get pre-seeded
  into separate `browser.newContext()` instances per persona.

Once those exist, every test below must run with two contexts (ALICE +
BOB) sharing nothing. ALICE clicks Pay → tx lands on devnet → BOB sees
the receipt within 5s in their open `/dashboard` UI WITHOUT manual
refresh:

### Test 21c.1 — ALICE sends to BOB by handle (cross-wallet UI sync)
- Open `browser.newContext()` for ALICE; pre-seed ALICE keypair
- Open `browser.newContext()` for BOB; pre-seed BOB keypair
- ALICE: `/send` → fill `@bob` → click Pay → tx confirms
- BOB: `/dashboard` open in parallel → asserts new received row appears
  within 5s WITHOUT page reload
- Verify Supabase: `receipts` row with the new request_id
- Verify on-chain: `getParsedTransaction(sig)` shows TransferChecked

### Test 21c.2 — ALICE opens a Pact, BOB sees nothing (privacy)
- ALICE creates a OneShot Pact via `/cards/new` UI
- BOB's `/cards` does NOT show ALICE's pact
- Verify privacy boundary holds in UI

### Test 21c.3 — Webhook fires when ALICE pays BOB
- BOB has a webhook URL configured (via `/m/me/webhook` UI)
- ALICE sends → expect HMAC-signed POST to BOB's receiver within 5s

---

## 23a · UI → on-chain bridge tests (NEW — honest gap)

> **Status: pre-req infra missing. Currently each Anchor ix is exercised
> via standalone scripts (`scripts/test-remaining-ix.ts`,
> `e2e-payment-flow.ts`, etc.) and the UI rendering of those routes is
> tested separately. They are NOT yet bridged: no test today both clicks
> a UI button AND lands a real tx on devnet through that click.**
>
> This section formalizes the bridge requirement to satisfy the
> autonomous prompt's "if a senior frontend engineer watched a screen
> recording, would they see a real flow?" bar.

Pre-reqs — same as Section 21c:
1. `SettleE2EBurnerAdapter` reading from localStorage so a Playwright
   context can hold a funded ALICE / BOB / CAROL keypair.
2. Pre-funded persona wallets (already done — see
   `scripts/bootstrap-test-wallets.ts`).
3. Burner adapter must implement `signTransaction` / `signMessage` /
   `signAllTransactions` so the wallet-adapter UI flow goes through
   normally without a popup.

Each test in this section must:
- Drive a UI click (no `fetch` shortcuts to `/api/*`)
- Result in a real tx with a confirmed signature on devnet
- Verify the UI sees the change WITHOUT manual refresh
- Verify Supabase row lands within 5s
- Verify the indexer realtime channel emits

| Test | Anchor ix | UI entry-point |
|---|---|---|
| 23a.1 | `create_card` | `/cards/new` → click "Create" |
| 23a.2 | `revoke` | `/cards/[id]` → slide-to-confirm "Kill the card" |
| 23a.3 | `open_pact` (OneShot) | `/cards/new?mode=oneshot` → click "Open Pact" |
| 23a.4 | `close_pact` | `/cards/[id]` → click "Close" → vault refund visible |
| 23a.5 | `spend` (legacy) | demo-merchant call site → receipt UI updates |
| 23a.6 | `spend_via_pact` | demo-agent x402 flow → receipt UI updates |
| 23a.7 | `open_streaming_pact` | `/cards/new?mode=streaming` → click "Open" |
| 23a.8 | `claim_streaming` | `/cards/[id]` → click "Claim" → vault drops |
| 23a.9 | `pause_streaming` | `/cards/[id]` → click "Pause" → status flips |
| 23a.10 | `resume_streaming` | `/cards/[id]` → click "Resume" → accrual resumes |
| 23a.11 | `open_delivery_escrow` | `/cards/new?mode=delivery_escrow` → click "Open" |
| 23a.12 | `release_delivery_escrow` | buyer slides to confirm release |
| 23a.13 | `dispute_delivery_escrow` | buyer clicks "Dispute" before deadline |
| 23a.14 | `record_receipt` | any Path A direct send → `/r/[id]` 4-hash chain anim |

Plus end-to-end multi-persona flows:

### Test 23a.M1 — Group 3-of-3 quorum end-to-end
- 3 browser contexts: ALICE (custodian), BOB, CAROL (members)
- ALICE: `/groups` → create → invite BOB, CAROL
- ALICE: creates spend request
- BOB + CAROL: each opens `/groups/[id]/request/[req_id]` and votes Approve via UI button
- After third vote, cron fires → on-chain spend lands
- All three contexts see the request flip to "executed" within 5s

### Test 23a.M2 — Customer scans Pay QR → merchant balance updates
- Merchant context: `/m/me/manage` → "Generate Pay QR" → QR rendered
- Customer context: paste the QR's solana: URL into wallet → sign → confirm
- Merchant context: `/m/me/analytics` shows the new payment within 5s

### Test 23a.M3 — Allowance kid spend
- Parent context: `/allowances` → create allowance for kid pubkey
- Kid context: tries spend within cap → on-chain tx lands → UI shows it
- Kid context: tries spend exceeding cap → on-chain DENY → UI shows deny code

---

## 23b · Exhaustive surface matrix (NEW — leave nothing untested)

> The autonomous prompt's "every test must execute" bar requires explicit
> coverage of every user action across every surface. This section is the
> exhaustive list: each row is one UI button / one SDK call / one MCP
> tool that a real user / dev / agent will exercise. Each row gets its
> own ✓ or ✗ in RESULTS.md.

### 23b.A — Consumer surface UI (every button → on-chain or DB effect)

#### Onboarding
- [ ] 23b.A1 — Connect wallet button works (Phantom path)
- [ ] 23b.A2 — Connect wallet button works (Burner path, NEXT_PUBLIC_E2E_BURNER=1)
- [ ] 23b.A3 — Sign-in message cached (no spam on subsequent actions)
- [ ] 23b.A4 — Disconnect button clears state
- [ ] 23b.A5 — First-time user: claim handle CTA → handle row in `handles`
- [ ] 23b.A6 — Avatar / display name edit on `/settings` saves

#### Send (every method, every variation)
- [ ] 23b.A7 — Send by `@handle` (resolved) → tx + ledger row
- [ ] 23b.A8 — Send by base58 pubkey → tx + ledger row
- [ ] 23b.A9 — Send by Solana Pay link → tx + ledger row
- [ ] 23b.A10 — Send by QR scan (jsqr-decoded image) → tx + ledger row
- [ ] 23b.A11 — Send by screenshot (image OCR / QR detection) → tx
- [ ] 23b.A12 — Send by voice (whisper transcription) → tx
- [ ] 23b.A13 — Send to unresolved handle → inline error toast
- [ ] 23b.A14 — Send with insufficient funds → deny code 1 surfaced
- [ ] 23b.A15 — Send with memo / reason text → reason_hash on receipt
- [ ] 23b.A16 — Send with `Split with…` extra → split-bill row created
- [ ] 23b.A17 — Send link (gift) → recipient claim flow → receipt issues

#### Receipts
- [ ] 23b.A18 — `/ledger` filter chip "All" → unfiltered list
- [ ] 23b.A19 — `/ledger` filter "Sends" → only direct_send rows
- [ ] 23b.A20 — `/ledger` filter "Agent spends" → only x402_spend rows
- [ ] 23b.A21 — `/ledger` filter "Streaming" → only streaming_claim rows
- [ ] 23b.A22 — `/ledger` filter "Escrow" → only escrow_release rows
- [ ] 23b.A23 — `/ledger` filter "Refunds" → only refund rows
- [ ] 23b.A24 — `/ledger` filter "Denied" → only DENY rows
- [ ] 23b.A25 — `/ledger` filter "Public" → only public_feed=true rows
- [ ] 23b.A26 — `/ledger` search by request_id substring works
- [ ] 23b.A27 — Click receipt row → `/receipts/[id]` opens
- [ ] 23b.A28 — Receipt detail: 4-hash chain renders + animates
- [ ] 23b.A29 — Receipt detail: AI narration loads
- [ ] 23b.A30 — Receipt detail: tags can be added/removed
- [ ] 23b.A31 — Receipt detail: refund button → on-chain refund tx
- [ ] 23b.A32 — Walletless `/verify` accepts hash + shows verdict
- [ ] 23b.A33 — `/import` paste Solana Pay sig → kernel receipt mints
- [ ] 23b.A34 — `/settings/exports` → request export → CSV/JSON downloads

#### Pacts (3 modes × full lifecycle)
- [ ] 23b.A35 — `/cards/new?mode=oneshot` → click Open → vault funded
- [ ] 23b.A36 — `/cards/[id]` shows OneShot pact details
- [ ] 23b.A37 — Spend through OneShot pact (via demo-agent or x402) → receipt
- [ ] 23b.A38 — Close OneShot → unspent USDC refunded to authority
- [ ] 23b.A39 — `/cards/new?mode=streaming` → click Open → streaming pact created
- [ ] 23b.A40 — Streaming pause via UI → on-chain `paused=true`
- [ ] 23b.A41 — Streaming resume via UI → on-chain `paused=false`
- [ ] 23b.A42 — Streaming claim via agent UI → vault drops, merchant gets USDC
- [ ] 23b.A43 — `/cards/new?mode=delivery_escrow` → escrow pact opened
- [ ] 23b.A44 — Buyer-confirm release via UI → merchant balance up
- [ ] 23b.A45 — Cron-driven release post-deadline → merchant balance up
- [ ] 23b.A46 — Buyer dispute before deadline → vault refunded
- [ ] 23b.A47 — Bulk-close all pacts under a card via UI
- [ ] 23b.A48 — Revoke card via slide-to-confirm → all child pacts frozen + UI animates kill

#### Groups (multi-persona)
- [ ] 23b.A49 — Create group account 3-of-3 → on-chain
- [ ] 23b.A50 — Custodian creates spend request via UI
- [ ] 23b.A51 — Member 1 votes Approve via UI
- [ ] 23b.A52 — Member 2 votes Approve via UI
- [ ] 23b.A53 — Member 3 votes Approve → quorum fires → on-chain spend
- [ ] 23b.A54 — Deny vote path: 1 deny stops execution
- [ ] 23b.A55 — Replay attack: same vote twice → 2nd rejected
- [ ] 23b.A56 — Wrong-member vote rejected with clear UI error

#### Savings
- [ ] 23b.A57 — Create savings bucket via UI
- [ ] 23b.A58 — Contribute to bucket → balance up + UI updates
- [ ] 23b.A59 — Round-up rule: set + fire on real spend
- [ ] 23b.A60 — Gift send: create + recipient claims via link
- [ ] 23b.A61 — Gift send: expire + auto-refund

#### Schedule + Allowances
- [ ] 23b.A62 — Schedule recurring send via UI → cron fires it → receipt lands
- [ ] 23b.A63 — Allowance: parent creates → kid receives view
- [ ] 23b.A64 — Allowance: kid spawns kid-card → on-chain
- [ ] 23b.A65 — Allowance: kid spends within cap → ALLOW
- [ ] 23b.A66 — Allowance: kid exceeds daily cap → DENY code 2

#### Split bill
- [ ] 23b.A67 — Create split-bill via UI
- [ ] 23b.A68 — All N payers pay → status flips to settled

#### Notifications
- [ ] 23b.A69 — In-app inbox renders all event types
- [ ] 23b.A70 — Web push: PushManager.subscribe mock → notification fires
- [ ] 23b.A71 — Notification click → opens relevant route

#### Profile
- [ ] 23b.A72 — `/at/[handle]` renders pubkey + stats
- [ ] 23b.A73 — Trust score breakdown panel shows 4 components
- [ ] 23b.A74 — Follow button toggles + count updates
- [ ] 23b.A75 — Follower / following lists paginate

#### Settings
- [ ] 23b.A76 — Profile section: edit display name → saves
- [ ] 23b.A77 — Theme section: toggle (currently W6 light only — verify)
- [ ] 23b.A78 — Privacy section: opt-in / opt-out per-card public-feed
- [ ] 23b.A79 — Notifications section: subscribe / unsubscribe push
- [ ] 23b.A80 — Sessions section: list active sessions
- [ ] 23b.A81 — Sessions section: revoke single session
- [ ] 23b.A82 — Sessions section: revoke all sessions
- [ ] 23b.A83 — Developer section: API key generate / revoke / rotate

### 23b.B — Merchant surface UI

- [ ] 23b.B1 — Generate Pay QR via `/m/[handle]/manage`
- [ ] 23b.B2 — QR is scannable (jsqr decode round-trip)
- [ ] 23b.B3 — Customer pays QR → receipt lands → merchant sees in analytics
- [ ] 23b.B4 — Analytics: revenue, txn count, dispute rate, trust score
- [ ] 23b.B5 — Publish capability via UI → `capability_registry` row
- [ ] 23b.B6 — Capability hash registered + pin-able by buyers
- [ ] 23b.B7 — DNS verify: TXT record set → server validates → flag flips
- [ ] 23b.B8 — Webhook config: secret rotates via UI
- [ ] 23b.B9 — Webhook test event delivers with valid HMAC
- [ ] 23b.B10 — Webhook retries on 5xx (3 attempts with backoff)
- [ ] 23b.B11 — Webhook idempotency dedupes on Settle-Idempotency-Key
- [ ] 23b.B12 — Customer files dispute via UI
- [ ] 23b.B13 — Merchant gets AI dispute draft
- [ ] 23b.B14 — Merchant approves refund → on-chain refund
- [ ] 23b.B15 — Merchant denies dispute → status updates
- [ ] 23b.B16 — Public merchant profile renders pubkey + stats + embed snippet
- [ ] 23b.B17 — Embed snippets: `<settle-pay>` HTML renders correctly
- [ ] 23b.B18 — Embed snippets: `<settle-verify>` HTML renders correctly

### 23b.C — Agent surface UI

- [ ] 23b.C1 — Hire from template wizard → AgentCard created on-chain
- [ ] 23b.C2 — First spend by hired agent → x402 receipt lands
- [ ] 23b.C3 — Publish a template via `/agents/templates/new` → on-chain attestation + DB row
- [ ] 23b.C4 — Browse `/agents/templates` → template list
- [ ] 23b.C5 — Hire-Blink: share link → Phantom unfurls → friend hires
- [ ] 23b.C6 — Per-stream pact controls: pause from `/cards/[id]?tab=pact` → on-chain
- [ ] 23b.C7 — Per-stream resume → on-chain
- [ ] 23b.C8 — Per-stream claim button → on-chain
- [ ] 23b.C9 — Decisions feed (`/audit`) realtime: every decision visible
- [ ] 23b.C10 — Demo agent makes spend via x402 host → receipt indexed
- [ ] 23b.C11 — Per-stream collab: 2 agents share a pact

### 23b.D — Developer surface (SDK + MCP)

#### TypeScript SDK (settle-protocol-sdk on npm — pre-req: publish)
- [ ] 23b.D1 — `npm i settle-protocol-sdk` in fresh dir succeeds
- [ ] 23b.D2 — Import + call `canonicalPurposeHash()` → returns hash
- [ ] 23b.D3 — Import + call `canonicalReasonHash()` → returns hash
- [ ] 23b.D4 — Import + call `canonicalPolicySnapshotHash()` → returns hash
- [ ] 23b.D5 — Import + call `verifyReceipt()` → verdict
- [ ] 23b.D6 — `buildIxData("create_card", …)` → bytes match Anchor
- [ ] 23b.D7 — `buildIxData("spend_via_pact", …)` → bytes match Anchor
- [ ] 23b.D8 — IDL JSON shipped + 14 instructions present

#### Python SDK (settle-protocol-sdk on PyPI — DONE)
- [ ] 23b.D9 — `pip install settle-protocol-sdk` in fresh venv ✓ (verified)
- [ ] 23b.D10 — `from settle_sdk import canonical_purpose_hash` works ✓
- [ ] 23b.D11 — Hash output byte-equal to TS for same input ✓
- [ ] 23b.D12 — All canonical_*_hash functions present
- [ ] 23b.D13 — `build_ix_data` works for all 14 ix
- [ ] 23b.D14 — LangChain integration: `make_langchain_tool()` works

#### Rust SDK (settle-sdk on crates.io — pre-req: cargo publish)
- [ ] 23b.D15 — `cargo add settle-sdk` in fresh crate succeeds
- [ ] 23b.D16 — `cargo run` — first call returns hash
- [ ] 23b.D17 — Hash matches TS + Python on same input
- [ ] 23b.D18 — All 44 cargo tests pass in fresh build

#### MCP middleware
- [ ] 23b.D19 — `wrapWithSettle()` exported
- [ ] 23b.D20 — `requireSettleCredential()` exported
- [ ] 23b.D21 — `makeAnthropicToolRunner()` exported
- [ ] 23b.D22 — `makeOpenAIToolRunner()` exported
- [ ] 23b.D23 — `makeLangChainTool()` exported
- [ ] 23b.D24 — `makeCrewAITool()` exported
- [ ] 23b.D25 — Spawn MCP server subprocess + JSON-RPC `initialize`
- [ ] 23b.D26 — `tools/list` returns ≥6 tools
- [ ] 23b.D27 — `tools/call` for each of 6 tools → real on-chain effect

#### Web components
- [ ] 23b.D28 — `<settle-pay>` from npm install + drop into vanilla HTML
- [ ] 23b.D29 — `<settle-pay>` button click → wallet flow → event fires
- [ ] 23b.D30 — `<settle-verify>` from npm install + drop into vanilla HTML
- [ ] 23b.D31 — `<settle-verify>` paste hash → verdict shown

#### Sandbox / faucet
- [ ] 23b.D32 — `/sandbox` connected → request airdrop → SOL arrives
- [ ] 23b.D33 — `/sandbox` connected → request USDC → arrives

### 23b.E — Operator surface

- [ ] 23b.E1 — `/control-center` health dashboard reflects reality
- [ ] 23b.E2 — `/admin/cron` recent runs list shows phase5-tick + signer
- [ ] 23b.E3 — `/admin/cron` force-fire button works
- [ ] 23b.E4 — `/admin/preflight` all 7 checks visible
- [ ] 23b.E5 — `/admin/federation/origins` lists trusted + untrusted
- [ ] 23b.E6 — Promote origin via UI → trusted=true → ledger reflects
- [ ] 23b.E7 — Demote origin → trusted=false
- [ ] 23b.E8 — `/verify-build` shows current binary hash matches HEAD
- [ ] 23b.E9 — Operator-only routes return 401 without CRON_SECRET

### 23b.F — Public surface (walletless)

- [ ] 23b.F1 — `/verify` paste hash → 3-stage lifecycle visible
- [ ] 23b.F2 — `/leaderboard` capability heatmap renders + cells brighten
- [ ] 23b.F3 — `/leaderboard` all-time ranked table loads
- [ ] 23b.F4 — `/leaderboard` Federation panel shows trusted origins
- [ ] 23b.F5 — `/capabilities` NL discovery: query → NIM ranks → reasoning
- [ ] 23b.F6 — `/feed` public-feed receipts stream live
- [ ] 23b.F7 — `/stats` network counters update
- [ ] 23b.F8 — Public profile (no wallet): `/at/[handle]` renders

### 23b.G — Solana primitive integrations

- [ ] 23b.G1 — SPL TransferChecked encoding round-trip
- [ ] 23b.G2 — ATA derivation deterministic
- [ ] 23b.G3 — Memo program ix encodable
- [ ] 23b.G4 — Solana Pay reference key in URL parses
- [ ] 23b.G5 — ALT (address lookup table) createLookupTable ix builds
- [ ] 23b.G6 — v0 versioned tx compiles + signs
- [ ] 23b.G7 — Bubblegum cNFT mint (where applicable)
- [ ] 23b.G8 — SAS attestation (Solana Attestation Service)
- [ ] 23b.G9 — Squads detection (multisig auth check)
- [ ] 23b.G10 — Lighthouse assertion (post-tx state assertion)
- [ ] 23b.G11 — Jupiter quote fetch (informational)
- [ ] 23b.G12 — Pyth ticker (price oracle live)
- [ ] 23b.G13 — Bonfida SNS lookup
- [ ] 23b.G14 — Helius onLogs subscribe + Sender (Jito bundles)
- [ ] 23b.G15 — Solana Actions (Blink) JSON spec
- [ ] 23b.G16 — VAPID Web Push key generation

### 23b.H — Webhook events (all 13)

- [ ] 23b.H1-H13 — every event in `webhook-events-coverage.ts` fires
  from a real Settle action and lands on the receiver with valid HMAC
  + correct payload shape

### 23b.I — Cron jobs

- [ ] 23b.I1 — `phase5-tick` fires on schedule (or via force-fire)
- [ ] 23b.I2 — `phase5-signer` picks scheduled work
- [ ] 23b.I3 — Compress-cron mints ZK receipt mirrors (when configured)
- [ ] 23b.I4 — Trust-score recalc cron updates `agent_trust_scores`

### 23b.J — Cross-cutting

- [ ] 23b.J1 — Indexer realtime emits within 2s of slot
- [ ] 23b.J2 — Federation ledger view reflects promoted origin
- [ ] 23b.J3 — Trust score recompute cron writes new `last_computed_at`
- [ ] 23b.J4 — All 4 i18n locales render core keys
- [ ] 23b.J5 — Theme toggle (if implemented) doesn't break layout
- [ ] 23b.J6 — Print receipt CSS prints clean (no chrome)
- [ ] 23b.J7 — All OG images render (default + r/[id] + at/[handle])
- [ ] 23b.J8 — Service worker registers (PWA)
- [ ] 23b.J9 — Mobile 390px no horizontal scroll on every authed route
- [ ] 23b.J10 — Lighthouse ≥ 90 on landing
- [ ] 23b.J11 — All 8 deny codes triggered + UI shows reason
- [ ] 23b.J12 — Sentry: any error reaches Sentry without leaking PII

---

## 22 · Final go/no-go checklist

Before declaring "ready":

- [ ] Every route in section 1 returns 200 (or correct 404 for non-existent)
- [ ] No console errors on any happy path
- [ ] No legacy `bg-white/[0.02]` cards rendering as transparent
- [ ] No green primary buttons anywhere
- [ ] No black flashes on navigation
- [ ] Wallet sign prompts cached (no spam)
- [ ] Surface inference correct on every nested route
- [ ] All 7 receipt kinds tested
- [ ] All 9 deny codes triggered + rendered
- [ ] All 3 SDKs tested with one real call each (TS via npm install, Python via pip install, Rust via cargo add)
- [ ] All 6 MCP tools tested via JSON-RPC subprocess
- [ ] All 13 webhook events delivered + HMAC validated
- [ ] All 12 cron jobs fired + side-effects observed
- [ ] All 14 Anchor ix executed on devnet via UI button clicks (Section 23a)
- [ ] All 21c cross-wallet UI sync tests pass (ALICE↔BOB ≤5s)
- [ ] Every row in 23b.A (consumer), 23b.B (merchant), 23b.C (agent), 23b.D (developer), 23b.E (operator), 23b.F (public), 23b.G (Solana primitives), 23b.H (webhooks), 23b.I (cron), 23b.J (cross-cutting) ✓
- [ ] Mobile 390px no horizontal scroll
- [ ] Lighthouse ≥ 90 on landing
- [ ] All cross-wallet flows confirm correct DB + on-chain state on both sides
- [ ] `SettleE2EBurnerAdapter` exists + Playwright globalSetup pre-seeds keypairs into multi-context tests
- [ ] Two consecutive full-suite re-runs both 100% green

---

## Appendix · Quick DB queries for verification

Connect to Supabase SQL editor, paste:

```sql
-- All receipts for ALICE in last 24h
select request_id, receipt_kind, amount_lamports/1e6 as usdc, decision, created_at
from receipts
where (sender_pubkey = '<ALICE_PUBKEY>' or recipient_pubkey = '<ALICE_PUBKEY>')
  and created_at > now() - interval '24 hours'
order by created_at desc;

-- All denies for ALICE's cards
select pd.id, pd.decision, pd.deny_code, pd.amount_lamports/1e6 as usdc, pd.created_at
from policy_decisions pd
join agent_cards ac on ac.card_pubkey = pd.card_pubkey
where ac.authority_pubkey = '<ALICE_PUBKEY>'
  and pd.decision = 'DENY'
order by pd.created_at desc;

-- Group requests awaiting ALICE's vote
select r.request_id, r.amount_lamports/1e6 as usdc, r.dest_pubkey, r.approvals, ga.quorum
from group_spend_requests r
join group_accounts ga on ga.group_id = r.group_id
join group_account_members m on m.group_id = r.group_id and m.member_pubkey = '<ALICE_PUBKEY>'
where r.status = 'pending';

-- Active streaming pacts
select pact_pubkey, scope_label, claimed/1e6 as claimed_usdc, max_total_lamports/1e6 as max_usdc, paused
from pacts
where mode = 'streaming' and not closed;

-- Open delivery escrows past deadline (cron candidates)
select pact_pubkey, escrow_amount/1e6 as usdc, escrow_merchant_pubkey, confirm_deadline_slot
from pacts
where mode = 'delivery_escrow' and not released and not refunded
  and confirm_deadline_slot < (select max(decision_slot) from receipts);
```

---

## 23 · Anchor program — every instruction

The on-chain program at `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD` exposes 14 instructions. Test each one with a real devnet tx + Solscan verification.

### 23.1 — `create_card`

- ALICE signs → new `AgentCard` PDA at `[b"agent-card", authority, label_hash]`
- Verify: `agent_pubkey`, `daily_cap_lamports`, `per_call_max_lamports`, `expiry_slot`, `policy_version = 0`, `revoked = false`, `used_today = 0`

### 23.2 — `update_card_caps`

- ALICE on `/cards/<id>?tab=policy` → adjust caps + sign
- Verify: `policy_version` increments by 1; new caps active immediately

### 23.3 — `revoke_card`

- ALICE slides "Slide to revoke" → sign
- Verify: `revoked = true`. ALL child pacts become unusable (next `spend_pact` rejects).

### 23.4 — `open_pact` (oneshot)

- ALICE → `/cards/new?mode=oneshot` → sign
- Verify: `Pact` PDA, `mode = OneShot`, `cap_lamports` matches, vault USDC ATA created and funded

### 23.5 — `open_pact` (streaming)

- mode = Streaming; verify `rate_lamports_per_slot`, `max_total_lamports`, `start_slot`, `paused = false`, `pause_started_slot = 0`, `pause_accumulated_slots = 0`

### 23.6 — `open_delivery_escrow`

- mode = DeliveryEscrow; verify `escrow_amount`, `escrow_merchant_pubkey` pinned, `confirm_deadline_slot`, `dispute_deadline_slot`, `released = false`, `refunded = false`

### 23.7 — `spend_pact`

- Demo agent makes x402 call within cap + allowlist → `record_spend` fires
- Verify: pact `spent` increments, parent card `used_today` increments
- 4 hashes recorded: `receipt_hash`, `reason_hash`, `policy_snapshot_hash`, `purpose_hash`
- Solscan: tx contains: SPL TransferChecked, Memo (purpose), Settle program ix `spend_pact`

### 23.8 — `claim_streaming`

- After elapsed slots > 0, call → vault USDC partially released
- Verify: `claimed` increments, `last_claim_slot` updates, `pause_accumulated_slots` resets to 0 (tested edge case for paused-during-claim)

### 23.9 — `pause_streaming`

- ALICE clicks Pause → sign
- Verify: `paused = true`, `pause_started_slot = now_slot`

### 23.10 — `resume_streaming`

- ALICE clicks Resume → sign
- Verify: `paused = false`, `pause_accumulated_slots += (now - pause_started_slot)`, `pause_started_slot = 0`

### 23.11 — `release_delivery_escrow` (buyer-confirmed)

- ALICE confirms within window → sign
- Verify: `released = true`, `released_caller_pubkey = ALICE`, `released_is_buyer_confirmed = true`. Merchant ATA receives full `escrow_amount`.

### 23.12 — `release_delivery_escrow` (cron post-deadline)

- After `confirm_deadline_slot`, anyone (relayer cron) calls → sign
- Verify: `released = true`, `released_caller_pubkey = relayer`, `released_is_buyer_confirmed = false`. Worst case = stranger paid the fee for the buyer; merchant always gets pinned funds.
- **Negative**: try to release to a different merchant ATA → tx rejects with `MerchantNotPinned`

### 23.13 — `dispute_delivery_escrow`

- ALICE within `dispute_deadline_slot` → sign
- Verify: `refunded = true`, `refunded_at` set. Buyer receives full `escrow_amount` back.

### 23.14 — `close_pact`

- For an `oneshot` or paused/closed `streaming` pact → sign
- Verify: pact `closed = true`. Vault USDC remainder returned to authority. Pact PDA stays on-chain (history preserved).

### 23.15 — `record_denial`

- Spend rejected by program → `record_denial` writes the denial commit to chain
- Verify: `policy_decisions` row in DB with `decision = DENY`, `deny_code` set
- 8 deny codes (1 RevokedCard, 2 Expired, 3 NotInAllowlist, 4 OverCap, 5 OverPerCallMax, 6 DuplicateOrLoopDetected, 7 CapabilityNotPinned, 8 MerchantNotVerified)

### 23.16 — IDL drift detector (CI gate)

- Run `pnpm test:idl-drift`
- Expected: TS IDL = on-chain IDL byte-for-byte match
- If drift: build fails with diff

---

## 24 · Indexer + webhook worker

### 24.1 — Helius onLogs subscription

- Run `pnpm dev:indexer`
- Verify console logs: `[indexer] Connected to Helius WebSocket onLogs filter=program:HU4...`
- ALICE makes a spend → indexer receives event within 2s → writes to DB

### 24.2 — Receipt event parsing

- For each event type emitted by the program (`SpendOccurred`, `PactOpenedEvent`, `PactClosedEvent`, `StreamingClaimedEvent`, `DeliveryEscrowOpenedEvent`, `DeliveryEscrowReleasedEvent`, `DeliveryEscrowDisputedEvent`, `CardRevokedEvent`, `DenialRecordedEvent`), verify:
  - Event decoded correctly (no "unknown(N)" labels)
  - 4 hashes match what's in the receipt JSON
  - Row inserted in `receipts` or `policy_decisions`

### 24.3 — Indexer crash recovery

- Kill the indexer mid-run
- Restart
- Verify: catches up from last checkpointed slot, no duplicate inserts (idempotent on signature)

### 24.4 — Webhook delivery worker

- BOB has webhook configured
- ALICE sends 5 USDC to BOB
- Verify webhook worker:
  - Picks up `webhook_jobs` row with `status = pending`
  - POSTs to BOB's URL with `Settle-Signature` HMAC
  - On 2xx: marks `delivered`, `delivered_at` set
  - On 5xx: marks `retrying`, schedules with exponential backoff
  - On final fail (after N retries): marks `failed`

### 24.5 — Webhook signature validation

- BOB's endpoint validates: `Settle-Signature: t=<ts>,v1=<hex>` where `v1 = hmac_sha256(secret, t + "." + body)`
- Verify: replay (old timestamp) rejected; bad signature rejected; valid → 200

### 24.6 — Webhook event vocabulary

| Event | Fires on |
|---|---|
| `receipt.allowed` | spend_pact ALLOW |
| `receipt.denied` | record_denial |
| `pact.opened` | open_pact |
| `pact.closed` | close_pact |
| `streaming.claimed` | claim_streaming |
| `streaming.paused` | pause_streaming |
| `streaming.resumed` | resume_streaming |
| `escrow.opened` | open_delivery_escrow |
| `escrow.released` | release_delivery_escrow |
| `escrow.disputed` | dispute_delivery_escrow |
| `card.revoked` | revoke_card |
| `dispute.created` | merchant dispute table insert |
| `dispute.resolved` | merchant approves/denies |

Test each event type fires + delivered to webhook URL.

---

## 25 · Hash kernel parity (TS / Python / Rust must match)

The most security-critical guarantee: **the same canonical input must produce the same 4 BLAKE3 hashes in all 3 languages**.

### 25.1 — Run unit tests

```bash
# TypeScript
cd packages/sdk && pnpm test receipt-kernel.test.ts
# Python
cd packages/python-sdk && pytest tests/test_kernel.py
# Rust
cd packages/rust-sdk && cargo test kernel_test
```

Each test computes `(receipt_hash, reason_hash, policy_snapshot_hash, purpose_hash)` for fixtures in `packages/test-fixtures/kernel-vectors.json`.

### 25.2 — Cross-language parity

- Pick a known fixture
- Run the TS computation, save hashes
- Run the Python computation, save hashes
- Run the Rust computation, save hashes
- Verify: byte-for-byte equality across all 3

### 25.3 — Anchor ix data parity

- TS SDK builds `spend_pact` ix data
- Python SDK builds same args → same byte output
- Rust SDK builds same args → same byte output
- Verify byte-equal

---

## 26 · Every API endpoint

Test each with happy + sad paths. Use `curl` or Postman.

### Public (no auth)
- `GET /api/health` → `{ ok: true, indexer_lag_seconds }`
- `GET /api/stats` → 60s-cached aggregate
- `GET /api/stats/landing` → presentability-gated
- `GET /api/feed?limit=N` → recent decisions
- `GET /api/leaderboard` → top capabilities
- `GET /api/leaderboard/[capabilityHash]` → per-cap detail
- `GET /api/verify/[hash]` → matches receipt
- `GET /api/og?...` → OG image stream
- `GET /api/auth/challenge?pubkey=` → nonce + ts + canonical message

### Auth-required (X-Settle-Auth-* headers)
- `GET /api/cards/list?authority=` → 401 without auth, 200 with
- `POST /api/cards/[id]/revoke` → builds revoke tx
- `POST /api/cards/[id]/bulk-close` → builds bulk close tx
- `POST /api/agents/spawn` → builds open_pact tx
- `POST /api/agents/create-card` → builds create_card tx
- `POST /api/save-for` → create bucket
- `POST /api/scheduled-sends` → create schedule
- `POST /api/scheduled-sends/topup-pact` → renew streaming
- `POST /api/round-up` → save rule
- `POST /api/gift-sends` → create gift
- `POST /api/group-accounts` → create group
- `POST /api/group-accounts/request-spend` → spawn pact + queue request
- `POST /api/group-accounts/approve` → record signed vote
- `POST /api/handles/claim` → claim handle (sig over canonical)
- `POST /api/templates` → publish template
- `POST /api/notifications/subscribe` → register web push
- `POST /api/follows/[handle]` → follow

### Wallet sig (different style)
- `POST /api/import/solana-pay` → import tx as receipt
- `POST /api/payment-links` → create one-shot link
- `POST /api/payment-links/[token]` → claim link
- `POST /api/collabs` → create collab
- `POST /api/collabs/[id]/pay` → pay one share
- `POST /api/escrows/[id]/release` → release escrow
- `POST /api/escrows/[id]/dispute` → dispute
- `POST /api/receipts/[requestId]/refund` → trigger refund
- `POST /api/split-bills` → create split
- `POST /api/swap/quote-and-build` → Jupiter quote + build (mainnet only)

### Operator (CRON_SECRET bearer)
- `POST /api/cron/streaming-claim-sweep`
- `POST /api/cron/streaming-cap-warn`
- `POST /api/cron/escrow-auto-release`
- `POST /api/cron/escrow-dispute-deadline`
- `POST /api/cron/cnft-mint-queue`
- `POST /api/cron/webhook-retry-queue`
- `POST /api/cron/capability-stats-roll`
- `POST /api/cron/scheduled-send-fire`
- `POST /api/cron/round-up-fire`
- `POST /api/cron/gift-expire-refund`
- `POST /api/cron/trust-score-recalc`
- `POST /api/cron/group-spend-fire-quorum-met`
- `GET /api/admin/preflight`
- `POST /api/admin/federation/promote`
- `POST /api/admin/federation/demote`

### Merchant
- `GET /api/merchants/[handle]/profile`
- `GET /api/merchants/[handle]/analytics`
- `GET /api/merchants/[handle]/capabilities`
- `POST /api/merchants/[handle]/capabilities` (auth)
- `GET /api/merchants/[handle]/disputes`
- `POST /api/merchants/[handle]/disputes/[id]/respond`
- `GET /api/merchants/[handle]/verify` → DNS check status
- `POST /api/merchants/[handle]/verify/start` → returns TXT record value
- `POST /api/merchants/[handle]/verify/check` → resolves DNS, validates
- `GET /api/merchants/[handle]/webhook` → config
- `POST /api/merchants/[handle]/webhook` → save config + rotate secret
- `POST /api/merchants/[handle]/webhook/test` → fire test event
- `POST /api/m/[handle]/feedback` → customer feedback

### Solana Actions / Blinks
- `GET /api/actions/hire/[slug]` → ActionGetResponse
- `POST /api/actions/hire/[slug]/spawn` → ActionPostResponse with serialized tx
- `GET /api/actions/request/[slug]` → request blink
- `GET /api/actions/revoke/[card]` → revoke blink
- `GET /api/actions/router/[handle]/[type]` → router

### MCP / dev tools
- `GET /api/capabilities` → registry
- `POST /api/capabilities` → publish
- `GET /api/capabilities/discover?q=` → NL ranker
- `GET /api/pricelist` → capability prices (for x402 hosts)
- `GET /api/templates`
- `GET /api/templates/[slug]`

### Negative paths for every endpoint
- 400: missing required field
- 401: missing/invalid auth
- 403: wrong authority
- 404: not found
- 429: rate-limited (where applicable)
- 503: Supabase unconfigured

---

## 27 · Cron jobs (every scheduled task)

Run each manually via `/admin/cron` AND verify scheduled fire.

| Job | Cadence | Endpoint | Verify |
|---|---|---|---|
| Streaming claim sweep | every 60s | `/api/cron/streaming-claim-sweep` | claim_streaming fires for active streams |
| Streaming cap-warn | every 5m | `/api/cron/streaming-cap-warn` | webhook fires when cap > 80% |
| Escrow auto-release | every 5m | `/api/cron/escrow-auto-release` | post-deadline escrows released |
| Escrow dispute deadline | every 1h | `/api/cron/escrow-dispute-deadline` | open escrows past dispute window auto-released |
| cNFT mint queue | continuous | `/api/cron/cnft-mint-queue` | receipt cNFTs minted |
| Webhook retry queue | every 30s | `/api/cron/webhook-retry-queue` | failed deliveries retried |
| Capability stats roll | every 15m | `/api/cron/capability-stats-roll` | leaderboard refreshed |
| Scheduled send fire | every 1m | `/api/cron/scheduled-send-fire` | due schedules execute |
| Round-up fire | per-receipt | (triggered) | spends round to nearest, diff goes to bucket |
| Gift expire | every 1h | `/api/cron/gift-expire-refund` | unclaimed gifts auto-refund |
| Trust score recalc | every 6h | `/api/cron/trust-score-recalc` | trust scores updated |
| Group quorum fire | every 1m | `/api/cron/group-spend-fire-quorum-met` | quorum_met requests execute |

For each: verify execution row in `phase5_executions` table with status, latency, signature.

---

## 28 · Push notification triggers

### Web Push (RFC 8291/8292)

For each trigger, ALICE subscribed via service worker. Then trigger event → push fires.

- Receipt allowed (sent or received)
- Receipt denied (high-amount or repeated)
- Card cap warning (≥80%)
- Streaming pact about to expire
- Group spend request awaiting your vote
- Group quorum met (you're a member)
- Dispute filed against your receipt
- Dispute resolved (yours)
- Refund window closing (24h before)
- Webhook delivery failure (merchant only)

### Negative
- Subscribe → unsubscribe → trigger → no push fires
- Send malformed VAPID payload → push API returns 400 → handled gracefully

---

## 29 · Empty / loading / error / setup-required states

For every page, force each state:

| State | Trigger | Expected |
|---|---|---|
| Empty | New wallet, no data | Friendly heading + helper copy + CTA |
| Loading | Slow network throttle | W6 spinner OR skeleton, no flash |
| Error | Disconnect Supabase | "Couldn't load" + Retry CTA |
| Setup-required | Missing env (e.g. relayer not configured) | Yellow callout + "Set up …" link |

Pages to test each state on: `/dashboard`, `/cards`, `/ledger`, `/agents`, `/groups`, `/wishes`, `/allowances`, `/activity`, `/notifications`, `/m/me/manage`, `/m/me/disputes`, `/leaderboard`, `/feed`, `/stats`, `/admin/health`, `/admin/cron`.

---

## 30 · Solana primitive integrations

Each one needs a happy-path test.

### 30.1 — SPL Token TransferChecked
- All sends use TransferChecked (not legacy Transfer)
- Verify decimals encoded correctly

### 30.2 — Associated Token Account (ATA)
- Recipient ATA auto-created if missing on first receive
- Verify `getOrCreateAssociatedTokenAccount` flow

### 30.3 — Memo program
- Every send includes Memo with purpose text (≤200 chars)
- Memo decodable on Solscan

### 30.4 — Solana Pay (transfer-request + transaction-request)
- `/request` generates a `solana:` URL
- Phantom scans, prefills correctly
- Reference pubkey encoded
- After pay: `getSignaturesForAddress(reference)` finds the tx

### 30.5 — Address Lookup Tables
- Versioned tx (v0) used for Jupiter swap path
- ALT compresses account list

### 30.6 — Bubblegum V1 cNFT (receipt mint)
- After ALLOW receipt, cron mints a cNFT to the recipient
- Verify in Phantom NFT view

### 30.7 — Solana Attestation Service
- Merchant capability publishes a SAS attestation
- Verify attestation chain via `verified_merchants` table

### 30.8 — Squads V4 detection
- If recipient is a Squads multisig, UI shows "this recipient is a multisig"
- Verify via Squads program account check

### 30.9 — Lighthouse assertions
- Every spend tx includes a Lighthouse assertion (e.g. recipient ATA owner == expected)
- Verify on Solscan

### 30.10 — Jupiter Lite swap quote
- Non-USDC token send on mainnet → quote fetched
- Devnet → quote shown but swap disabled (no DEX liquidity)

### 30.11 — Pyth Hermes pull oracle
- `/dashboard` ticker shows live SOL/USD
- Pyth price updates on signature

### 30.12 — Bonfida SNS handle resolution
- `@elena.sol` resolves to pubkey via SNS
- Verify against Bonfida API

### 30.13 — Helius RPC + WebSocket onLogs
- Indexer connects to Helius WSS
- onLogs filter: `mentions = [program_id]`
- Receives events in <2s

### 30.14 — Helius Sender (Jito-bundle wrapper)
- High-priority sends use Helius Sender
- Verify `confirmed-on-first-try` rate

### 30.15 — Solana Actions / Blinks
- `/blink/research` page renders
- `/api/actions/hire/research` returns ActionGetResponse
- Twitter/X unfurls as a Hire button
- Phantom renders as Action card

### 30.16 — VAPID Web Push
- VAPID keypair generated
- Public key served at `/.well-known/vapid-public-key`
- Subscribe → endpoint stored in `push_subscriptions`
- Push payload encrypted with aes128gcm + ECDH

---

## 31 · Capability registry lifecycle

### 31.1 — Publish capability

BOB publishes a capability:
- domain: `bob.example`
- method: `POST`
- path: `/api/research`
- amount: `0.50`
- version: `v1`
- alias: `research-tier1`

Verify:
- `capability_hash = blake3(canonical(json))` computed correctly
- Stored in `verified_merchants` with all fields
- Sample receipt later commits this exact `capability_hash` in policy_snapshot_hash

### 31.2 — Discover capability via NL search

Query: "fast translation for spanish→english"
Verify NVIDIA NIM ranks results with reasoning.

### 31.3 — Pin capability on a card

ALICE creates an AgentCard with allowlist that includes `{merchant: BOB, capability_hash: <hex>}`.
Verify on-chain `card.allowlist[i].capability_hash = <bytes>`.

### 31.4 — Spend rejected if capability_hash mismatch

Demo agent calls bob.example/api/research but provides wrong capability_hash → DENY with `deny_code = 7 CapabilityNotPinned`.

### 31.5 — Update capability (new version)

BOB publishes `v2` with different canonical → new capability_hash. Old `v1` still pinned on existing cards (immutable on-chain).

---

## 32 · Trust score signals

Every signal that contributes to trust score:

- on-time release rate (escrow)
- dispute rate (lower = better)
- p50 receipt confirm time
- volume tier (calls per day)
- DNS verified
- SAS attestation
- federation membership
- followers count (real social signal)

Test each:
1. Find a merchant with known signals
2. Check breakdown in `/at/<handle>/proof`
3. Trigger one signal change (e.g. resolve a dispute)
4. Wait for `trust_score_recalc` cron
5. Verify trust score updated

---

## 33 · Sandbox / devnet faucet

`/sandbox`:
- Click "Get devnet SOL" → 0.5 SOL airdropped to connected wallet
- Click "Get devnet USDC" → 25 test-USDC airdropped (Circle faucet)
- Rate-limit: max 1 airdrop per wallet per 24h
- Manual fallback links to `faucet.solana.com` and `faucet.circle.com`

---

## 34 · Verifiable build

`/verify-build`:
- Shows on-chain build hash from program account
- Shows committed source-of-truth hash from `BUILD_HASH` env at deploy time
- Verify side-by-side equal

---

## 35 · Privacy / sealed-box encryption

### 35.1 — Voice notes (sealed-box)

Send a receipt with voice note → sealed-box encrypted with sender pubkey + recipient pubkey ECDH.
Verify: only sender can decrypt; server cannot read.

### 35.2 — Public/private receipt toggle

Send with `extras.public = true` → receipt visible in `/feed`.
Send with `extras.public = false` (default) → not in `/feed`, only sender + recipient can view.

### 35.3 — Push payload encryption

Web push payload → aes128gcm. Even Settle server can't read after sending — only the recipient's service worker decrypts.

---

## 36 · Internationalization (i18n)

- Locale switcher visible on `/dashboard`, `/wishes`, `/allowances`, `/groups`, etc
- Switch to `hi` (Hindi)
- Verify: hero text, button labels, table headers translate
- Switch back to `en`
- Verify locale persists via localStorage

---

## 37 · Theme toggle

`/settings/theme`:
- Default: light (Wave 6)
- Click "Dark" → html.dark applied → legacy theme tokens flip
- Reload → persists
- Click "Light" → back to W6 prototype
- Click "Auto" → matches `prefers-color-scheme`

---

## 38 · Print receipt

`/receipts/[id]/print`:
- Strips chrome (no sidebar, no topbar)
- Renders: 4-hash chain, decision, narration, on-chain link, QR for /verify
- Cmd+P → clean print preview

---

## 39 · OG images

Every shareable URL has an og:image:
- `/r/<id>` → receipt OG (4-hash mini + amount + decision)
- `/at/<handle>` → profile OG (handle + trust + followers)
- `/m/<handle>` → merchant OG
- `/blink/<slug>` → Blink unfurl OG
- `/leaderboard/<hash>` → capability OG
- `/` → marketing OG

For each, paste the URL into Twitter/X compose box → verify unfurl preview.

---

## 40 · Service worker / PWA

- Open Settle in Chrome → see "Install" prompt
- Install → opens in standalone PWA window
- Offline mode: opens cached `/dashboard` skeleton
- Receive push notification while offline

---

## 41 · Sessions / API keys

`/settings/sessions`:
- Lists active sessions (browser, device, IP, last seen)
- "Revoke session" → kills the session immediately
- "Revoke all" → kills everything except current

`/settings/developer`:
- Generate API key (live + test)
- Copy
- Use API key in `Authorization: Bearer <key>` header
- Rotate
- Revoke

---

## 42 · Wallet adapter compatibility matrix

Test full happy path (`/onboarding` → send → revoke) with each wallet:

| Wallet | Tested |
|---|---|
| Phantom | ☐ |
| Backpack | ☐ |
| Solflare | ☐ |
| Burner (E2E test mode) | ☐ |
| Glow | ☐ |
| Mobile Wallet Adapter (Solana Mobile) | ☐ |

---

## 43 · Browser compatibility

Run smoke (sections 1 + 3.1 + 5.1 + 9.1) on:
- Chrome latest
- Firefox latest
- Safari latest (macOS + iOS)
- Edge latest

For each: zero console errors, all flows complete.

---

## 44 · Toast messages catalog

Verify every toast renders W6-styled (sonner config in layout.tsx — uses `--background` / `--foreground`):

- ✓ "Sent X USDC to @bob"
- ✓ "Card created on Solana devnet"
- ✓ "Vote recorded · quorum reached"
- ✓ "Pact closed. Vault refunded."
- ✓ "X pacts frozen on-chain in <0.5s"
- ✓ "Receipt imported. The kernel commit is live."
- ✓ "Bill created."
- ✓ "Wish saved."
- ⚠ "Could not resolve: handle_not_found"
- ⚠ "Per-call max must be ≤ daily cap."
- ⚠ "Connect Phantom to send."
- ✕ "Send failed: <message>"
- ℹ "Already imported. Showing existing receipt."

---

## 45 · Modal / dialog catalog

- Wallet connect modal (W6-styled, no broken dark theme)
- Locale switcher dropdown
- Token picker dropdown
- Surface switcher pills (animated via Framer LayoutGroup)
- Cluster badge dropdown
- Disconnect confirmation
- Dispute response modal
- Create-template modal
- Capability publish modal
- Slide-to-confirm (revoke card)

---

## 46 · Keyboard shortcuts

- `⌘K` / `Ctrl+K` → command palette opens
  - Search any page
  - Search any handle
  - Search any receipt id
  - Quick action: Send, Verify, New Pact
- `Esc` → closes any open modal / palette
- `/` → focus search box on `/ledger`, `/activity`, `/notifications`
- Tab order: logical top-to-bottom
- Enter on form submits

---

## 47 · Copy-to-clipboard targets

Every long string has a copy button:
- HandleBadge → `@handle`
- Pubkey rows → full pubkey
- Receipt id → `R-XXXXX`
- Hash rows → 64-char hex
- Webhook secret → bearer
- Agent secret (one-time) → b58
- Payment link → URL with fragment
- Hire-Blink share → URL

For each: click → toast "Copied" + verify `navigator.clipboard` written

---

## 48 · Sentry / error reporting

- Trigger an unhandled rejection in dev
- Verify Sentry captured event with sourcemap-resolved stack
- Verify user is NOT identified by pubkey in payload (privacy)

---

## 49 · CI / typecheck / lint / build / E2E

```bash
pnpm tsc --noEmit       # 0 errors
pnpm lint               # 0 warnings
pnpm test:unit          # all pass (incl. kernel parity)
pnpm test:e2e           # 85+ Playwright tests pass
pnpm build              # all apps build
pnpm test:idl-drift     # IDL = on-chain
```

Each command must pass before submit.

---

## 50 · Database migrations

```bash
pnpm db:migrate
```

Verify in order:
- All 50 migrations apply cleanly
- No errors, no skipped
- `migrations` table reflects all rows
- `pg_dump` → schema matches `infra/supabase/expected-schema.sql`

---

## 51 · Mainnet readiness (informational, not blocking)

Per `MAINNET_MIGRATION.md`:

- [ ] Update USDC mint to mainnet
- [ ] Update merkle-tree authority
- [ ] Switch Helius to mainnet RPC
- [ ] Update VAPID for production domain
- [ ] DNS for `settle.so`
- [ ] Sentry production project
- [ ] Anchor program deployed to mainnet at known address
- [ ] All hardcoded `devnet` strings audited

---

## 52 · Security audit checklist

- [ ] All sensitive endpoints require auth headers
- [ ] All wallet-sig endpoints validate against on-chain pubkey
- [ ] No private keys in client bundles (`pnpm build && grep -r "privkey" .next/`)
- [ ] Cookies HttpOnly + SameSite=Lax
- [ ] CSP headers on all routes
- [ ] No XSS in narration / purpose / handle fields
- [ ] No SQL injection (parameterized everywhere)
- [ ] Rate limit on `/api/auth/challenge` (10/min/IP)
- [ ] CORS configured (only same-origin for auth endpoints)
- [ ] Webhook secrets rotatable + non-recoverable

---

## 53 · Final go/no-go (extended)

Submit-ready when EVERY box below is checked. **The runner cannot declare "done" with even one box unchecked.**

### Visual
- [ ] All ~64 routes render in W6 light palette
- [ ] No green primary buttons
- [ ] No invisible text anywhere
- [ ] No black flash on navigation
- [ ] All loading/error/empty/setup states designed (21b.10 — all 10 surfaces)
- [ ] All toasts/modals/dialogs W6-styled
- [ ] Print receipt clean
- [ ] All OG images render
- [ ] Mobile 390px no horizontal scroll
- [ ] Lighthouse ≥ 90

### User-journey tests (UI-driven, real-user POV — section 21a)
- [ ] 21a.1 — Brand-new user lands on `/`, no wallet
- [ ] 21a.2 — Onboarding wizard end-to-end
- [ ] 21a.3 — Send by @handle full UI flow
- [ ] 21a.4 — Cross-wallet receive within 5s (BOB sees ALICE's send)
- [ ] 21a.5 — Send by QR (image dropzone + decode)
- [ ] 21a.6 — Receive + verify proof (4-hash + walletless verify)
- [ ] 21a.7 — Hire AI agent end-to-end
- [ ] 21a.8 — Group spend with 3 parallel browser contexts
- [ ] 21a.9 — Split bill, all 3 payers
- [ ] 21a.10 — Merchant: pay-QR + analytics
- [ ] 21a.11 — Dispute flow (customer files → merchant resolves)
- [ ] 21a.12 — Save toward goal + round-up
- [ ] 21a.13 — Schedule recurring send + cron fires
- [ ] 21a.14 — Revoke card mid-flight
- [ ] 21a.15 — Walletless verifier
- [ ] 21a.16 — Mobile 390×844 touch flows
- [ ] 21a.17 — Surface switcher (consumer/agent/merchant/dev/operator/public)
- [ ] 21a.18 — Disconnect / reconnect
- [ ] 21a.19 — Multi-tab sync
- [ ] 21a.20 — Browser back/forward
- [ ] 21a.21 — Form validation (every input)
- [ ] 21a.22 — Wallet rejection handling
- [ ] 21a.23 — Slow network handling
- [ ] 21a.24 — Notification denial drawer
- [ ] 21a.25 — Receipt sharing (public proof link)

### UI error/edge cases (section 21b)
- [ ] 21b.1 — Invalid handle URL → 404 W6 page
- [ ] 21b.2 — Invalid receipt id
- [ ] 21b.3 — Expired payment link
- [ ] 21b.4 — Already-claimed link
- [ ] 21b.5 — Connection error banner
- [ ] 21b.6 — On-chain rejection toast
- [ ] 21b.7 — Hover states
- [ ] 21b.8 — Focus rings + keyboard nav
- [ ] 21b.9 — Long content overflow
- [ ] 21b.10 — All 10 empty states

### Developer surfaces (section 14, fresh-dir / subprocess / vanilla HTML)

**TypeScript SDK (14.1):**
- [ ] 14.1.1 — Fresh-dir install + first real call
- [ ] 14.1.2 — Every public method against devnet
- [ ] 14.1.3 — TS types + IntelliSense
- [ ] 14.1.4 — Error handling matrix
- [ ] 14.1.5 — Browser bundle works

**Python SDK (14.2):**
- [ ] 14.2.1 — Fresh venv install + first call
- [ ] 14.2.2 — Every public method
- [ ] 14.2.3 — mypy --strict + pyright clean
- [ ] 14.2.4 — Error handling
- [ ] 14.2.5 — Async variant + 10 parallel calls

**Rust SDK (14.3):**
- [ ] 14.3.1 — Fresh cargo crate + first call
- [ ] 14.3.2 — Every public method
- [ ] 14.3.3 — `cargo build --release` < 5MB
- [ ] 14.3.4 — Error type variants

**Cross-language hash parity (14.4):**
- [ ] 14.4.1 — 100 random tuples, byte-equal `kernel_commit` across TS+Python+Rust+on-chain
- [ ] 14.4.2 — All 4 hashes match across all 4 sources

**MCP server (14.5):**
- [ ] 14.5.1 — Subprocess starts, advertises 6 tools
- [ ] 14.5.2 — Each of 6 tools real-executes end-to-end (pay, verify, list_capabilities, open_pact, close_pact, refund)
- [ ] 14.5.3 — Error handling (missing arg, invalid card, unknown tool)
- [ ] 14.5.4 — Real Claude Desktop / Cursor integration (or simulated equivalent)
- [ ] 14.5.5 — Card-scoped permissions enforced

**`<settle-pay>` web component (14.6):**
- [ ] 14.6.1 — Vanilla HTML embed, `<script src>`, click → wallet flow → event fires
- [ ] 14.6.2 — Every attribute reflects to DOM
- [ ] 14.6.3 — All 3 events fire (settle-paid / settle-error / settle-loading)
- [ ] 14.6.4 — Cross-framework: works in React, Vue, Svelte, Next.js

**`<settle-verify>` web component (14.7):**
- [ ] 14.7.1 — Vanilla HTML embed verifies a hash
- [ ] 14.7.2 — Programmatic `.verify()` API works

**Webhooks (14.8):**
- [ ] 14.8.1 — Real receiver on :4000, configured via UI
- [ ] 14.8.2 — All 13 events deliver with valid HMAC
- [ ] 14.8.3 — Retry on 5xx with exponential backoff
- [ ] 14.8.4 — Signature rotation + 24h grace
- [ ] 14.8.5 — Idempotency dedupe

### Functional
- [ ] All 14 Anchor instructions execute on devnet
- [ ] All 7 receipt kinds tested + verified
- [ ] All 8 deny codes triggered + UI shows correctly
- [ ] All 13 webhook events fire + deliver
- [ ] All 12 cron jobs fire on schedule
- [ ] All 50+ API endpoints tested
- [ ] 3-of-3 group spend executes end-to-end (3 wallets)
- [ ] Streaming pause/resume preserves accounting
- [ ] Escrow auto-release post-deadline routes to pinned merchant only

### Cross-language parity
- [ ] TS / Python / Rust SDKs produce identical 4 hashes
- [ ] All 3 SDK install + first call works
- [ ] IDL drift detector green

### Integration
- [ ] MCP middleware: 6 tools tested
- [ ] `<settle-pay>` and `<settle-verify>` web components work
- [ ] Webhook delivered to external endpoint with HMAC validation
- [ ] Phantom Blink unfurls share link
- [ ] Solana Pay QR scans + pays + indexed

### Wallet
- [ ] Phantom + Backpack + Solflare all complete onboarding → send
- [ ] Sign-message cached (no spam)
- [ ] Disconnect works + clears auth cache

### Data
- [ ] Indexer real-time within 2s of slot
- [ ] Webhook retry queue empties without manual ops
- [ ] Federation promote/demote flips ledger view
- [ ] Trust score recalc cron updates scores

### Security
- [ ] Section 52 fully checked
- [ ] No private keys in browser bundle
- [ ] No PII in Sentry payloads

### Build
- [ ] tsc 0 errors
- [ ] lint 0 warnings
- [ ] All Playwright E2E green
- [ ] All unit tests green
- [ ] Build succeeds for web + indexer + demo-agent + demo-merchants

### UI → on-chain bridge (Section 23a — newly formalized)
- [ ] `SettleE2EBurnerAdapter` exists + reads from `localStorage["settle-e2e-burner-key"]`
- [ ] Playwright globalSetup pre-seeds ALICE/BOB/CAROL keypairs into per-context localStorage
- [ ] All 14 ix from Section 23 are also verified through UI button clicks (Section 23a.1–23a.14)
- [ ] Multi-persona scenarios 23a.M1–23a.M3 (group quorum, QR pay, allowance kid) drive real txs

### Cross-wallet UI sync (Section 21c — newly formalized)
- [ ] 21c.1 ALICE→BOB cross-wallet receive ≤5s without refresh
- [ ] 21c.2 ALICE pact privacy boundary holds in BOB's UI
- [ ] 21c.3 Webhook fires on cross-wallet payment within 5s

### Exhaustive surface matrix (Section 23b — newly formalized)
- [ ] 23b.A consumer (83 rows)
- [ ] 23b.B merchant (18 rows)
- [ ] 23b.C agent (11 rows)
- [ ] 23b.D developer SDK + MCP + web components (33 rows)
- [ ] 23b.E operator (9 rows)
- [ ] 23b.F public (8 rows)
- [ ] 23b.G Solana primitives (16 rows)
- [ ] 23b.H webhooks (13 rows)
- [ ] 23b.I cron (4 rows)
- [ ] 23b.J cross-cutting (12 rows)

### Regression
- [ ] Two consecutive full-suite re-runs both 100% green
- [ ] Re-running any single test produces the same ✓ a second time

When every box is checked: **green to submit**.

---

End of test plan. ~250 distinct tests across UI / on-chain / DB / SDK / MCP / webhooks / cron / push / a11y / browser / wallet / mobile / perf / security / build.
