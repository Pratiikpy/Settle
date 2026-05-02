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

### Test 14.1 — TypeScript SDK install

```bash
npm i settle-protocol-sdk
```

```ts
import { settle } from "settle-protocol-sdk";
const r = await settle.pay({ to: "@bob", amount: 0.05 });
console.log(r.request_id, r.confirmedMs);
```

**Expected**: real on-chain tx submitted.

### Test 14.2 — Python SDK

```bash
pip install settle-protocol-sdk
```

```python
from settle_sdk import Settle
s = Settle(rpc_url="https://api.devnet.solana.com")
r = s.pay(to="@bob", amount=0.05)
```

**Expected**: receipt minted.

### Test 14.3 — Rust SDK

```toml
[dependencies]
settle = { path = "..." }
```

```rust
let r = settle::pay(...).await?;
```

### Test 14.4 — `<settle-pay>` web component

**Steps**:
1. Open `/pay` (developer demo) → live `<settle-pay>` widget
2. Click "Pay" → Phantom prompt
3. Sign → confirmation card with receipt link
4. JS: `document.querySelector('settle-pay').addEventListener('settle-paid', ...)` → event fires

### Test 14.5 — `<settle-verify>` web component

**Steps**:
1. Open `/docs/verify-component` → embed sample
2. Paste a hash → verify recomputes and shows verdict

### Test 14.6 — MCP middleware

```json
{
  "mcpServers": {
    "settle": {
      "command": "npx",
      "args": ["-y", "@settle/mcp"],
      "env": { "SETTLE_CARD": "..." }
    }
  }
}
```

Tools exposed:
- `settle.pay`
- `settle.verify`
- `settle.list_capabilities`
- `settle.open_pact`
- `settle.close_pact`
- `settle.refund`

Test each tool from a Claude/Cursor MCP client.

### Test 14.7 — Webhook delivery

**Pre**: BOB has webhook configured.

**Steps**:
1. ALICE sends 5 USDC to BOB
2. Verify BOB's webhook URL receives POST with:
   - `Settle-Signature: t=<ts>,v1=<hmac>`
   - `Settle-Event: receipt.allowed`
   - JSON body matches schema in `/docs/webhooks`
3. Verify HMAC validates against rotation secret

### Test 14.8 — Webhook retry on 5xx

**Pre**: BOB's endpoint returns 500 first time, 200 second time.

**Expected**: cron retries with exponential backoff, eventually marks delivered.

### Test 14.9 — Idempotency

**Steps**:
1. POST `/api/agents/spawn` with same `Idempotency-Key: abc123` twice

**Expected**: 2nd call returns the same response (transaction + pact_pubkey) without creating duplicate.

### Test 14.10 — API explorer

`/docs/api` (or wherever) → OpenAPI spec for every public endpoint.

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
- [ ] All 3 SDKs tested with one real call each
- [ ] All 6 MCP tools tested
- [ ] At least one webhook delivered + verified
- [ ] Mobile 390px no horizontal scroll
- [ ] Lighthouse ≥ 90 on landing
- [ ] All cross-wallet flows confirm correct DB + on-chain state on both sides

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

Submit-ready when EVERY box below is checked:

### Visual
- [ ] All ~64 routes render in W6 light palette
- [ ] No green primary buttons
- [ ] No invisible text anywhere
- [ ] No black flash on navigation
- [ ] All loading/error/empty/setup states designed
- [ ] All toasts/modals/dialogs W6-styled
- [ ] Print receipt clean
- [ ] All OG images render
- [ ] Mobile 390px no horizontal scroll
- [ ] Lighthouse ≥ 90

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

When every box is checked: **green to submit**.

---

End of test plan. ~250 distinct tests across UI / on-chain / DB / SDK / MCP / webhooks / cron / push / a11y / browser / wallet / mobile / perf / security / build.
