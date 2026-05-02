# Prototype Parity Audit

> Goal: every Settle page matches the prototype JSX 1:1, with two adjustments:
> - **Add** anything we ship in the real backend that the prototype missed (in prototype's design language).
> - **Skip** anything the prototype shows that has no backend support — no fakes.

## Status legend

- ✅ **DONE** — current page matches prototype 1:1 with real data
- 🟡 **PARTIAL** — wraps the right shell but inner layout still off
- 🔴 **TODO** — needs full prototype-port pass
- ➕ **ADD** — backend exists, prototype missed it, render in prototype style
- ➖ **SKIP** — prototype shows it, we don't have backend, do not render

---

## 1. Done (verified visually)

| Route | Prototype source | Status |
|---|---|---|
| `/` | `screen-landing.jsx` | ✅ DONE — confirmed visually by user |
| `/dashboard` | `screen-c-home.jsx` | ✅ DONE — structure matches; cascade fix verified |
| `/send` | `screen-c-send.jsx` | ✅ DONE — Grid 2 composer + summary, method pills, real backend |

---

## 2. Consumer surface — needs port

### `/ledger` ← `screen-c-receipts.jsx` 🔴
**Prototype shape**: PageHeader + filter chips (kind/status/agent) + search + receipt-row list with kind pill, counterparty, purpose, amount, decision dot, ts.
**Current**: source-grouped section cards (kept the layered-trust UX which is real Settle, prototype doesn't have).
**Plan**:
- Adopt prototype's filter chips + search bar at top
- Below filters: keep the source-grouped sections (kernel / imported / federated trusted / federated untrusted) — that's a real Settle feature the prototype missed; render in prototype card style
- Receipt rows in prototype's compact format (mono request_id, kind pill, counterparty, purpose, amount, decision dot, ts)
- ➕ ADD: untrusted-federated toggle (real RLS feature)
- ➕ ADD: hash-mark on native rows (kernel-anchored signal)
- ➖ SKIP: agent filter where we have no agent column data yet

### `/cards` ← `screen-c-pacts.jsx` 🔴
**Prototype shape**: Mode tabs (All / OneShot / Streaming / Escrow) + grid of PactCards showing kind, label, cap, fill bar, expiry, allowlist count, status pill.
**Current**: simple SettleCard grid mixing AgentCards + Pacts with killchain animation.
**Plan**:
- Add prototype mode tabs (All / OneShot / Streaming / Escrow / Closed)
- Render PactCards in prototype style (mode-aware: oneshot shows cap+spent, streaming shows rate+claimed/max, escrow shows release condition)
- AgentCards section above pacts (real distinction: card = parent, pact = child scope)
- Keep killchain freeze animation (real on-chain revoke event)
- ➕ ADD: streaming pause/resume controls (real `pacts` table has `paused` flag)
- ➕ ADD: per-pact sparkline of spend over time (computable from receipts)
- ➖ SKIP: nothing missing in prototype that we can't show

### `/cards/[id]` ← `screen-agent.jsx` (per-agent detail) 🔴
**Prototype shape**: Header (avatar + name + status) → tabs (Overview / Caps / Allowlist / Decisions / Receipts) → tab-specific content (sparkline, cap sliders, merchant chips, decision feed, receipt rows).
**Current**: ad-hoc sections.
**Plan**:
- Adopt tabs: Overview / Policy / Decisions / Receipts
- Overview: spend sparkline, cap fill bars, recent decisions
- Policy: cap sliders + allowlist editor + slide-to-revoke (real `update_card_caps` ix)
- Decisions: realtime feed on `policy_decisions` filtered by card_pubkey
- Receipts: filtered ledger
- ➕ ADD: capability allowlist chips with live verified state (real `verified_merchants` table)
- ➕ ADD: per-pact 4-hash chain anim already exists; surface here

### `/groups` ← part of `screen-c-other.jsx` (Groups section) 🔴
**Prototype shape**: Group list (left) + active group detail (right) with quorum badge, custodian, threshold, pending+history requests.
**Current**: stacked sections per group.
**Plan**:
- Two-column: list + detail
- Member roster with avatars, vote progress
- Pending requests with sign-to-approve action (real wallet-sig attestation)
- ➕ ADD: SECURITY DEFINER `user_group_ids()` already shipped; expose realtime
- ➖ SKIP: nothing fake in prototype Groups

### `/wishes` ← part of `screen-c-other.jsx` (Savings section) 🔴
**Prototype shape**: Savings goals grid; each card has emoji, name, progress bar, $saved/$target, cadence.
**Current**: long list with delegation banner.
**Plan**:
- Adopt prototype goal-card grid
- Keep delegation status banner (real `delegated_cards` requirement) but in prototype card style
- ➖ SKIP: nothing prototype-missing — auto-fund logic via real relayer

### `/allowances` ← part of `screen-c-other.jsx` (Schedule section) 🔴
**Prototype shape**: Schedule list with next run, cadence, amount, recipient avatar; tabs for Sender / Recipient ("I'm paying" / "I'm receiving").
**Current**: tab nav exists, list style is legacy.
**Plan**:
- Adopt prototype card list style
- Keep sender/recipient tabs (matches "paying" / "kid" view)
- ➕ ADD: pause/skip-next controls (real `scheduled_sends.next_run_slot` column)

### `/activity` ← `screen-activity.jsx` 🔴
**Prototype shape**: Filter chips (all / approved / denied / agent) + search + decision rows with policy snapshot, deny code, slot, sig link.
**Current**: hero + simple ActivityRow list.
**Plan**:
- Adopt prototype filter chips
- Activity row in prototype layout (decision pill, agent avatar, merchant, amount, deny code chip, slot, ts)
- Live indicator already in prototype style
- ➕ ADD: per-decision drawer with full reason snapshot (real `policy_decisions.reason_snapshot`)

### `/settings` ← `screen-settings.jsx` 🔴
**Prototype shape**: Left tab list (Workspace / Notifications / Sessions / Privacy / Developer / Billing) + main panel per tab.
**Current**: Top tab pill row + sections.
**Plan**:
- Adopt left vertical tab list in prototype style
- Tabs: Profile / Theme / Privacy / Notifications / Sessions / Developer (existing)
- ➕ ADD: device list with revoke-all (real `sessions` table)
- ➕ ADD: webhook secret rotation (real `webhook_secrets` table)
- ➖ SKIP: prototype Billing tab — we don't bill yet

### `/at/[handle]` ← part of `screen-c-other.jsx` (Profile section) 🟡 mostly done
**Prototype shape**: Profile header + trust score + stats grid + recent activity.
**Current**: already shipped in good shape.
**Plan**:
- Minor align typography to prototype scale
- Verify trust badge style matches prototype dot pill

### `/onboarding` ← `screen-onboarding.jsx` 🔴
**Prototype shape**: 4-step wizard (Connect → Profile → Privacy → Done) with progress bar at top.
**Current**: linear form.
**Plan**:
- Adopt 4-step wizard with progress bar
- Step 1: connect wallet (real wallet adapter)
- Step 2: claim handle (real `/api/handles/claim`)
- Step 3: privacy defaults (real `user_privacy_settings`)
- Step 4: tour CTA → /dashboard
- ➖ SKIP: prototype's "Org name" — we're consumer-first, no team yet

---

## 3. Agent surface

### `/agents` ← `screen-agents.jsx` 🔴
**Prototype shape**: Left agent list + right agent detail (avatar, status, today stats, recent receipts, hire CTA).
**Current**: hire form + preview.
**Plan**:
- Two-column: agent template list + selected detail
- Top: "Hire new" CTA bar
- Detail: agent stats, recent decisions, hire-Blink share link, edit caps button
- ➕ ADD: agent template gallery from real `agent_templates` table (already shipped)
- ➕ ADD: hire-Blink share link (real `/blink/[slug]`)
- ➖ SKIP: prototype's hardcoded merchants — we use real `verified_merchants`

### `/cards/[id]?tab=policy` ← `screen-policies.jsx` 🔴
**Prototype shape**: Sliders for perTx / perDay / perMonth + allowlist tag editor + save bar.
**Current**: ad-hoc form.
**Plan**:
- Render policy editor as prototype's slider+tag-editor combo
- Real `update_card_caps` Anchor ix on save

---

## 4. Merchant surface

### `/m/[handle]` ← `screen-merchant.jsx` (public view) 🟡 partial
**Prototype shape**: hero (handle, capability badge, trust) + stats + recent + embed snippets.
**Current**: matches mostly.
**Plan**:
- Verify embed snippet card matches prototype's monospace style
- ➖ SKIP: prototype's analytics — link to `/m/[handle]/analytics` page

### `/m/me/manage` ← `screen-merchant.jsx` (admin view) 🔴
**Prototype shape**: tabbed merchant admin (Profile / Capabilities / DNS Verify / QR / Webhooks / Disputes / Analytics).
**Current**: separate sub-pages.
**Plan**:
- Single page with prototype's tab-list
- Each tab pulls from real backend (existing routes folded in)
- Setup wizard at `?setup=1` for first-time merchant

### `/m/[handle]/{analytics,capabilities,disputes,verify,webhook}` 🟡
**Plan**: keep as separate subpages but reskin each to prototype's panel style.

---

## 5. Developer surface

### `/docs` ← `screen-platform.jsx` (Developer hub) 🔴
**Prototype shape**: top tab nav (Quickstart / SDK / MCP / Components / Webhooks / API / Sandbox) + content panes.
**Current**: linear docs page.
**Plan**:
- Adopt tab nav in prototype style
- Each tab: real content (we have all docs already)
- ➕ ADD: live SDK version pill from real `package.json`
- ➕ ADD: API key UI (if we have api_keys table; otherwise skip)

### `/docs/{pay-component,verify-component,webhooks,sdks,mcp,api}` 🟡
**Plan**: keep individual pages but match prototype panel/code-block style.

---

## 6. Operator surface

### `/control-center` ← `screen-platform.jsx` (Operator console) 🔴
**Prototype shape**: Health grid (Anchor / RPC / DB / Cron / Indexer) + recent alerts + federation status.
**Current**: probably doesn't exist or is minimal.
**Plan**:
- Build health-grid card layout
- Each cell pulls from real `/api/operator/health` (need to build)
- Federation panel from real `federation_origins` table
- Cron status from real cron table
- ➕ ADD: real preflight check status

### `/admin` 🔴
**Plan**: existing admin tools reskinned to prototype tone.

### `/verify-build` 🟡
**Plan**: keep, match panel style.

---

## 7. Public surface

### `/verify` ← `screen-verifier.jsx` 🔴
**Prototype shape**: paste tx sig → fetching/computing/done lifecycle → 4-hash chain breakdown + proof grid.
**Current**: simple form.
**Plan**:
- Adopt lifecycle stages (idle → fetching → computing → done)
- 4-hash chain inspector with prototype animations
- Proof grid showing each commit step
- Already has real `/api/verify/[hash]`

### `/verify/[hash]` 🟡
**Plan**: same as `/verify` but pre-filled, reuse shape.

### `/leaderboard` ← `screen-capability-heatmap.jsx` 🔴
**Prototype shape**: heatmap grid (capability × time bucket) + top capabilities table + per-cell drawer.
**Current**: simple list.
**Plan**:
- Adopt heatmap grid
- Color cells by call count (real `capability_calls` table)
- Top capabilities list in prototype card style
- ➕ ADD: federation panel (real `federation_origins`)
- Per-cell drawer with sample receipts

### `/leaderboard/[capabilityHash]` 🟡
**Plan**: per-capability detail in prototype card style.

### `/feed` 🔴
**Plan**: public feed in prototype receipt-row style; only opt-in public receipts (real `is_public` flag).

### `/stats` 🔴
**Plan**: stats grid in prototype card style; real `/api/stats/landing` already gates on `is_presentable`.

### `/capabilities/discover` 🟡
**Plan**: capability registry in prototype card style.

### `/import` 🟡 just reskinned with W6AppShell — needs prototype detail
**Plan**: match `screen-platform.jsx` import flow if applicable; otherwise keep current single-input shape but match prototype's `card-flat` patterns.

### `/split-bill`, `/split-bill/[id]` 🟡 just reskinned
**Plan**: minor polish; structure matches prototype's split flow.

### `/collab/[id]` 🔴
**Plan**: collab pay flow needs prototype check; currently legacy.

---

## 8. Specific receipt + receipt-related

### `/receipts/[requestId]` ← `screen-receipt.jsx` 🟡
**Prototype shape**: receipt header + 4-hash inspector + narration paragraph + tags + refund-by-emoji + related receipts + voice note + audience counter + share.
**Current**: 1549 lines, mostly there.
**Plan**:
- Verify each section matches prototype
- ➕ ADD: ZK receipt mode toggle (real `is_zk` flag if exists)
- Per-section detail audit needed

---

## 9. Mobile / responsive

### Mobile views ← `screen-mobile.jsx`
**Plan**: cross-cutting. After per-page port, sweep each at 390px viewport and ensure mobile tab bar, collapsed sidebar, stacked grids work. Already partially done (W6BottomTab exists).

---

## 10. Notifications

### `/notifications` ← `screen-notifications.jsx`
**Status**: route may not exist; current `/activity` partially serves this.
**Plan**:
- Build `/notifications` route OR fold into `/activity` with tabs
- Notification inbox in prototype list style
- Each notif: kind icon, title, body, action (e.g., "approve" for pending group request)
- Realtime subscription to `notifications` or `policy_decisions`
- ➕ ADD: web-push setup (real `push_subscriptions` table)
- ➖ SKIP: prototype's hardcoded "3 unread" badge — show real count or hide

---

## Cross-cutting: features prototype missed that we ship

These need a place in the UI in prototype style:

1. **Federation** — real `federation_origins` table; surface in `/leaderboard` panel + `/control-center`
2. **Group spending (N-of-M)** — real Anchor `group_spend` ix; surface in `/groups` (already done structurally)
3. **Allowance / kid mode (recipient view)** — real `allowances.kid_authority`; surface in `/allowances` tab
4. **Receipt importer** — real `/api/import/solana-pay`; surface as `/import` route + send-page extras
5. **ZK receipts** — real `zk_proofs` table (if shipped); surface as toggle on receipt detail
6. **Capability heatmap** — real `capability_calls`; surface at `/leaderboard`
7. **Streaming pause/resume** — real `pacts.paused` flag; surface in `/cards/[id]`
8. **Trust score breakdown** — real trust-score function; surface as tooltip on `/at/[handle]`
9. **DNS verify** — real `/api/m/[handle]/verify`; surface in `/m/me/manage` Trust tab
10. **Hire-Blink** — real `/api/actions/hire/[slug]`; surface as share link in `/agents`
11. **Sandbox / devnet faucet** — real `/sandbox` route; surface in dev tab
12. **Search** — real `/api/search/receipts`; surface in `/ledger` filter bar

---

## Cross-cutting: things prototype shows that we DON'T have

- **Voice composer's hold-to-speak transcription** — we have `/send/voice` but no real ASR backend → button works, route exists, real ASR integration is future work; show "Beta" pill
- **Gift send (auto-refund if unclaimed)** — no `gift_sends` table → drop from /send extras
- **Collab pay UI** — only API exists, no full UI → drop from /send extras (already done)
- **Schedule monthly recurring with retry** — only basic schedule exists → mark cadence options as available
- **Live audience counter on receipts** — no view-tracking → drop
- **Voice note attached to receipt** — no audio storage → drop

---

## Execution plan

Order by traffic + visibility:

1. **`/cards`** ← `screen-c-pacts.jsx` (consumer pacts list)
2. **`/ledger`** ← `screen-c-receipts.jsx` (receipts list)
3. **`/cards/[id]`** ← `screen-agent.jsx` (pact/agent detail)
4. **`/agents`** ← `screen-agents.jsx`
5. **`/groups`** ← group section of `screen-c-other.jsx`
6. **`/wishes`** ← savings section
7. **`/allowances`** ← schedule section
8. **`/activity`** ← `screen-activity.jsx`
9. **`/settings`** ← `screen-settings.jsx`
10. **`/onboarding`** ← `screen-onboarding.jsx`
11. **`/receipts/[requestId]`** ← `screen-receipt.jsx`
12. **`/verify`** ← `screen-verifier.jsx`
13. **`/leaderboard`** ← `screen-capability-heatmap.jsx`
14. **`/m/[handle]`** + **`/m/me/manage`** ← `screen-merchant.jsx`
15. **`/docs`** ← `screen-platform.jsx` (dev hub)
16. **`/control-center`** ← `screen-platform.jsx` (operator)
17. **Mobile sweep** ← `screen-mobile.jsx`
18. **`/notifications`** ← `screen-notifications.jsx` (build new)
19. Polish remaining sub-routes (`/m/[handle]/*`, `/docs/*`, `/feed`, `/stats`, etc.)

Each page: read prototype → diff current → rewrite JSX 1:1 → wire real backend → user verifies visually.
