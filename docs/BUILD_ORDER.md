# Settle — Build Order (daily execution)

> **Purpose.** The week-by-week, deliverable-by-deliverable plan for *what to build next*. STRATEGY.md tells you what every feature is. This file tells you when each one ships.
>
> **Update cadence.** Reviewed every Friday. Items that slip → re-scheduled, not silently dropped.
>
> **Status legend** (matches STRATEGY.md):
> ✅ SHIPPED · 🟡 PARTIAL · ⏳ PLANNED · 🟦 SIMULATED · 🌐 MAINNET_ONLY · 💰 FUNDED_FUTURE

---

## ⚡ This week (May 1–11, 2026 — hackathon submission)

**Goal:** ship submission-ready devnet build. Don't start Phase 1 work; consolidate Phase 0.

**Critical path:**

| Day | Task | Owner | Status |
|---|---|---|---|
| May 1 | Smoke test full flow in browser (Phantom on devnet, real USDC, real send → ZK card appears → badge unlocks) | founder | ⏳ |
| May 2 | Fix any bugs surfaced by smoke test | engineer | ⏳ |
| May 3 | Write demo video script (3–5 min, walks killchain → heatmap → badges → ZK mirror) | founder | ⏳ |
| May 4–5 | Record + edit demo video | founder | ⏳ |
| May 6 | Vercel deploy (production URL for submission) | engineer | ⏳ |
| May 7 | Colosseum project page draft | founder | ⏳ |
| May 8 | Final integration audit re-run | engineer | ⏳ |
| May 9–10 | Buffer for surprises; final polish | both | ⏳ |
| May 11 | Submit | founder | ⏳ |

**What we are NOT doing this week:** any new feature work. Phase 0 is in lockdown.

---

## Phase 1 (May 12 – mid-July, 2026 · 6–10 weeks)

**Goal:** make the wedge universal. Make the personal surface unmistakably finished.

### Week 1 — Universal Receipt Kernel (Path B: off-chain shim)
- [ ] Define `ReceiptInput` canonical struct in `@settle/sdk` (TS types + JSON schema)
- [ ] Implement `kernelCommit(input)` — computes 4 hashes, signs with operator key, packs to Memo
- [ ] Patch `/api/send/build` to route through kernel
- [ ] Patch `/api/send/link/build` similarly
- [ ] Patch streaming-claim endpoint
- [ ] Patch escrow release/dispute endpoints
- [ ] Patch refund endpoint
- [ ] Update `verifyReceipt()` to recognize the 4 hashes regardless of payment `kind`
- [ ] Database migration: add `receipt_kind` + `context_hash` columns; backfill existing rows with `kind=x402_spend`
- [ ] Update receipts API to return `kind` + `context_hash`
- [ ] Update receipt page UI to show all 4 hashes for every payment kind
- **Done when:** every payment flow emits all 4 hashes; verifier returns OK with 4 green checks for any kind.

### Week 2 — Home dashboard (F1.1) + Settings page (F1.3)
- [ ] Build `/dashboard` route (the 3-card layout)
- [ ] Move marketing landing copy to `/welcome` (or fold into the dashboard's empty state)
- [ ] Build `/settings` with all 5 sections (Profile / Privacy / Notifications / Sessions / Developer)
- [ ] Wire existing endpoints (handle update, push subscribe, privacy toggle) into Settings UI
- [ ] Sealed-box pubkey row in Settings → Developer
- **Done when:** new wallet → dashboard renders; user can update every setting and see it persist.

### Week 3 — Refund-by-emoji (F2.8) + Receipt-as-story (F2.3)
- [ ] Refund modal: replace generic "dispute" button with emoji row (😞 🤔 😡 + free-text)
- [ ] Mode-route emoji → correct on-chain ix (close_pact / dispute_delivery_escrow / refund through kernel)
- [ ] Build `/api/receipts/[id]/narrate` (Kimi K2 primary, Claude fallback)
- [ ] Cache narration to `receipts.narration_text`
- [ ] Receipt page: render narration above hero
- [ ] Fallback to deterministic template if LLM fails
- **Done when:** click emoji → tx confirms; every receipt page shows a paragraph narration.

### Week 4 — Killchain animation (F3.8) + Hash-chain animation (F2.7)
- [ ] Frost shader (CSS `filter` + SVG mask) on Pact tiles
- [ ] Slide-to-confirm modal on Card revoke action
- [ ] Sound effect (whoom + ice crackle, optional)
- [ ] Shatter-on-confirm animation (Framer Motion + particles)
- [ ] SVG chain-link animation on receipt page first-view
- [ ] `prefers-reduced-motion` skips both animations
- **Done when:** revoke a card → frost + shatter plays; open any receipt → chain animation plays once per session.

### Week 5 — Trust score (F3.12) + 9 emotional moments design pass
- [ ] Compute `trust_score` from receipts (formula: `log(unique_counterparties) × allow_rate × inverse_dispute_rate`)
- [ ] Cache to `agent_trust_scores`; refresh every 5 min
- [ ] Show on agent profiles + with formula breakdown on hover
- [ ] Design pass on M1 (Pact creation) — wax-seal animation, paragraph rendering
- [ ] Design pass on M2 (AgentCard funding) — vault graphic + rules ring
- [ ] Design pass on M3 (Payment confirm) — already partial, polish
- [ ] Design pass on M4 (Receipt) — covered by F2.7 chain animation + F2.3 narration
- [ ] Design pass on M5 (Revoke) — covered by F3.8 killchain
- [ ] Design pass on M6 (Trust score) — covered by F3.12 above
- [ ] Design pass on M7 (Merchant page) — capability grid + activity feed
- [ ] Design pass on M8 (Public proof page) — F2.5 polish
- [ ] Design pass on M9 (Dev integration) — `/docs` opens with a 30s gif
- **Done when:** all 9 moments have a designed visual + motion + sound + copy spec.

### Week 6 — UX disciplines audit (D1–D14)
- [ ] Walk every existing screen against all 14 disciplines
- [ ] Fix every D1–D14 violation
- [ ] D2 (mobile-first): test every screen on iPhone SE, Pixel 5, iPhone 14 Pro Max, Phantom in-app browser
- [ ] D3 (every screen has obvious next action): audit every empty + populated state
- [ ] D4 (microcopy): editorial pass on every label/button/error
- [ ] D11 (every number actionable): every dashboard number drills into detail
- [ ] D12 (Solana-native imagination): kill any "this could be Stripe + Postgres" pattern
- **Done when:** discipline audit passes on every existing screen.

### Week 7 — Receipt search + tagging + drag-to-share
- [ ] F2.10 receipt search (Postgres FTS + tsvector index)
- [ ] F2.11 receipt tagging (autocomplete + filter chips)
- [ ] F2.9 receipt drag-to-share (drag affordance + drop targets)

### Week 8 — Onboarding refinement + empty states + Cmd+K + dark mode
- [ ] F1.4 onboarding: replace failing sandbox airdrop with Circle faucet copy + I-send-you-SOL pattern
- [ ] F1.5 every route has a teaching empty state
- [ ] F1.6 Cmd+K command palette (search + actions + recent)
- [ ] F1.7 dark/light/auto theme toggle (HSL color tokens, FOUC prevention)

### Week 9–10 — Buffer + Universal Receipt Kernel Path A (program upgrade)
- [ ] Anchor program v0.4: add `record_receipt` instruction
- [ ] Existing ixs CPI into it
- [ ] Program audit-equivalent self-review
- [ ] Re-deploy + IDL drift check
- [ ] Phase 1 final integration test

**Phase 1 Done when:**
- Every payment flow emits all 4 hashes via Universal Receipt Kernel.
- 9 emotional moments designed + shipped.
- 14 disciplines audit-pass on every Phase 1 screen.
- New user goes from "Connect" to "I just experienced 3 things no other crypto app does" within 3 minutes.

---

## Phase 2 (mid-July – mid-September, 2026 · 6–8 weeks)

**Goal:** turn Settle from "an app" into "infrastructure."

### Week 11–12 — `<settle-verify>` web component + receipt importer
- [ ] F5.5 `<settle-verify>` web component (no signup, no API key, embeddable on any site)
- [ ] F5.11 receipt importer for Solana Pay
- [ ] F5.11 receipt importer for Helio (where APIs allow)
- [ ] Receipt importer for Sphere (where APIs allow)

### Week 13–14 — Verifiable build + capability registry
- [ ] F9.1 Verifiable build deploy (CI publishes hash, settle.so/verify displays match)
- [ ] F9.2 capability registry as contributable repo (first 50 hashes)
- [ ] F3.4 capability registry with human aliases (full UI surface)

### Week 15–16 — Stripe-vocab webhooks + idempotency + MCP middleware
- [ ] F5.6 webhook event vocabulary (`receipt.allowed`, `pact.opened`, `pact.disputed`)
- [ ] F5.9 idempotency keys on every payment endpoint
- [ ] F5.7 MCP middleware adapter (1-line wrap)

### Week 17–18 — `<settle-pay>` + public stats + transparency
- [ ] F5.4 `<settle-pay>` web component
- [ ] F9.4 public stats / transparency reports

**Phase 2 Done when:**
- 3 independent Solana apps have embedded `<settle-verify>`.
- Capability registry has 50+ first-class entries.
- Verifiable build badge live on homepage.
- MCP server template downloaded ≥100 times.

---

## Phase 3 (mid-September – mid-December, 2026 · 8–12 weeks)

**Goal:** ship Settle Business as a real product.

(Detailed weekly breakdown to be written after Phase 2 done — same template as Phase 1/2.)

High-level deliverables:
- F4.1 Merchant onboarding CLI (`npx create-settle-merchant`)
- F4.2 Merchant profile page
- F4.4 Merchant analytics dashboard
- F4.5 Refund-from-merchant-side
- F4.6 Dispute resolution flow
- F5.10 Public API + GraphQL
- F5.2/5.3 Python + Rust SDKs
- F5.8 Agent framework adapters (LangChain, CrewAI, OpenAI Agents, Anthropic)
- F29.3 AI bookkeeper
- F29.4 AI fraud detection
- F29.7 AI dispute drafter
- F33.3 Spend forecasting + burn-rate alerts
- F33.4 Auto-refill rules

---

## Phase 4 (Dec 2026 – Feb 2027 · 4–8 weeks)

**Goal:** Treasury / org surface.
(Detail TBD)

Deliverables: F6.1 Squads-native AgentCards, F6.2 per-employee cards, F6.3 approval workflows, F6.4 compliance exports, F33.1 net settlement, F33.2 per-merchant credit lines, F33.6 multilateral netting.

---

## Phase 5 (Feb – Apr 2027 · 4–8 weeks)

**Goal:** consumer breadth.
(Detail TBD)

Deliverables: F7.3 schedule, F7.5 save-for-X, F7.6 round-up, F7.8 group accounts, F7.9 allowance, F7.10 send-as-gift, F7.12 voice/NLP, F8.11 i18n in 10+ languages.

---

## Phase 6 (ongoing, post-Apr 2027)

**Goal:** Settle as the canonical Solana payments protocol.
(Detail TBD)

Deliverables: F28.3 Token-2022 confidential 🌐 MAINNET_ONLY, F28.4 private leaderboards, F28.5 anonymous-but-verified mode, F33.5 sealed-bid pacts 🌐, F35.3 trust score ML model, F9.3 receipt federation, F9.5 Settle Index, F9.8 receipt-based governance.

---

## What we are NOT doing in any phase (without funding)

- 💰 Banking partner integration
- 💰 Card issuing (Visa BIN sponsor)
- 💰 KYC vendor contracts (Sumsub / Persona)
- 💰 SOC 2 / ISO audits
- 💰 Insurance underwriting capital
- 💰 24/7 support staff
- 💰 Real-world ad spend
- 💰 Physical merchant POS hardware
- ❌ Solana Mobile-native features (can't test end-to-end without device)

These move into Phase 7+ only after capital is raised (per STRATEGY.md §34 on the investor lens).

---

## Updating this doc

Every Friday: review what shipped this week. Mark checkboxes. Re-schedule what slipped. Don't silently drop work.

When a feature in this doc lands, also update its STRATEGY.md tag (✅ SHIPPED) so the atlas stays truthful.
