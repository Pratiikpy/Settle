# Settle — Product Strategy & Specification

> **What this document is.** The long-term **product atlas** — every feature, principle, surface, layer, user type, discipline, and decision filter. ~150 feature specs, 14 disciplines, 8 lenses, 7 user types, 9 layers. This is the source of truth for *what* Settle is.
>
> **What this document is not.** The daily execution plan. That lives in `docs/BUILD_ORDER.md` (week-by-week sequencing). This atlas is too long to read every morning.
>
> **Who reads this.** Read end-to-end once. Refer back to it when proposing anything new. The execution summary below answers most "what should I work on next?" questions in 60 seconds.
>
> **The bar.** If another serious team gets a year, uses AI agents, and builds aggressively, Settle should still feel more useful, more polished, more ambitious, more coherent, and more startup-worthy.

---

## ⚡ Execution summary (read this first)

**Mantra (the emotional success metric):** *"This is not just another crypto app. This is a new financial layer."*

**Spine:** Settle lets humans and agents move money through programmable rules, verifiable receipts, and trust-building reputation on Solana.

**Current state:** Phase 0 done — 14-instruction Anchor program on devnet, 4-hash receipt commit chain on the x402 spend path, indexer + 4 background workers, 25 user-visible features (F1–F25), MPL Core soulbound badges, ZK-compressed receipt mirrors, capability heatmap.

**Critical truth-check finding (codex review):** the wedge claim "every payment proves itself" is currently TRUE for the x402 proxy path only. Direct sends, streaming claims, escrow releases, refunds, send-by-link, and imported receipts all bypass the 4-hash kernel. **First Phase 1 priority is the Universal Receipt Kernel** (F2.0) — every payment flow routes through one shared hash-commit primitive so the wedge is universally true, not selectively true.

**Next 6 priorities (Phase 1, in order):**
1. **F2.0 Universal Receipt Kernel** — hash-commit kernel every payment routes through (the wedge becomes universal).
2. **F2.8 Refund-by-emoji** — the demo-defining moment that already has primitives ready.
3. **§30 9 emotional moments** — design specs for Pact creation / killchain / receipt-as-proof / etc.
4. **§31 D1–D14 cross-cutting disciplines audit** — every existing screen passes all 14.
5. **F2.3 Receipt-as-story narration** — LLM-rendered plain-English on every receipt.
6. **§27 Phantom integration depth** — in-app browser optimization, deep-links, mobile-first.

**Status legend** (applied to every feature in Part II):

| Tag | Meaning |
|---|---|
| ✅ **SHIPPED** | Implemented + verified on devnet end-to-end |
| 🟡 **PARTIAL** | On-chain primitive exists; UI partial / integration incomplete |
| ⏳ **PLANNED** | Designed in this doc, not yet built |
| 🟦 **SIMULATED** | UI/flow exists with mocked underlying integration; honestly labeled in-app |
| 🌐 **MAINNET_ONLY** | Genuinely requires mainnet (e.g., Jupiter swap on real DEX, Token-2022 confidential transfers on real USDC) |
| 💰 **FUNDED_FUTURE** | Requires money (banking partners, audits, KYC, etc.) — explicitly out of code-only roadmap |

When the "Devnet status" line on a feature spec says "Real now," verify it matches `✅ SHIPPED`. If it doesn't, the doc is overclaiming and should be re-tagged in the next audit.

**The 6-criteria minimum-bar filter (master rule):** **Big is allowed. Random is not.** Every feature must satisfy at least one of: (1) programmable rules, (2) verifiable proof, (3) trust/risk reduction, (4) real user utility, (5) Solana-native advantage, (6) clear UX. Zero-of-six = reject. See §37 for full filter + examples.

---

## Table of contents

- **Part I — Foundations**
  - §1. Mission & spine
  - §2. The pitch sentence (use everywhere)
  - §3. Product principles (the ten commandments)
  - §4. The user types (who Settle serves)
  - §5. The nine layers (how Settle is organized)
- **Part II — Feature catalog**
  - §6. Core product surface
  - §7. Trust & receipt layer
  - §8. Agent economy layer
  - §9. Merchant layer
  - §10. Developer layer
  - §11. Treasury & organization layer
  - §12. Consumer payment layer
  - §13. UX polish layer
  - §14. Protocol & future layer
- **Part III — Build sequence**
  - §15. What's already shipped
  - §16. Build phases (1 through 6)
  - §17. The "deepen vs expand" decision rule
- **Part IV — Guardrails**
  - §18. The code-heavy / money-light filter
  - §19. The testability filter
  - §20. The Devnet-honesty filter
  - §21. The coherence filter
  - §22. What we deliberately do not do
- **Part V — Win narrative**
  - §23. The startup story
  - §24. The "why now" answer
  - §25. The "why us" answer
  - §26. How Settle survives narrative cycles

---

# PART I — FOUNDATIONS

## §1. Mission & spine

**Mission:** make money on Solana programmable, verifiable, and beautiful for everyone — humans, agents, merchants, creators, teams, and protocols.

**The mantra (the single emotional success metric):**

> *"This is not just another crypto app. This is a new financial layer."*

If a first-time user finishes onboarding and doesn't feel that, we lost — regardless of how many features we shipped.

**Spine** (one sentence; every feature attaches here):

> *Settle lets humans and agents move money through programmable rules, verifiable receipts, and trust-building reputation on Solana.*

If a feature does not deepen one of those four nouns — **rules**, **receipts**, **reputation**, **money** — it does not ship.

The spine is not a positioning statement. It is a structural rule. It is how we keep the product coherent as it grows wide.

---

## §2. The pitch sentence (use everywhere)

For VCs, judges, and engineers:

> **Settle is the PayFi rail for the agent economy on Solana. Programmable USDC budgets. Cryptographic receipts. Sub-second settlement.**

For normal users (landing page, app store):

> **Pay anyone — humans or AI agents. Every receipt is a cryptographic proof, not a database row. Money moves in 0.4 seconds.**

For developers:

> **Programmable money for the agent economy: bounded budgets that replace API keys, capability-priced merchant rails, receipts you can verify with four lines of code.**

These three sentences are the same product told in three voices. The first lands judges and capital. The second lands users. The third lands engineers. Use the right one for the right surface; never invent a fourth.

---

## §3. Product principles (the ten commandments)

These are non-negotiable. Every feature, screen, and decision must satisfy all ten.

1. **Money is programmable.** Spend rules are a property of the money itself, enforced on-chain. Not a backend promise.
2. **Receipts are verifiable.** Every payment leaves a four-hash cryptographic commit chain that anyone can verify with zero trust in Settle.
3. **Agents have bounded authority.** No agent ever holds an unbounded credential. Every spend has a cap, an allowlist, and an expiry.
4. **Users understand every rule before signing.** Plain-English rule sentences on every Pact, every Card, every authorization screen.
5. **Trust is earned through behavior, never bought.** Reputation is computed from on-chain activity. Soulbound. Non-purchasable.
6. **Privacy is available when needed.** Sealed-box for receipt context. Token-2022 confidential transfers (post-mainnet). Default visibility off.
7. **Fast settlement is felt, not stated.** Sub-400ms confirm with haptic + visual + audible (optional) feedback. The number on the page is the time you watched go by.
8. **Crypto jargon is hidden behind plain language.** "Programmable budget," not "Pact." "Capability hash," not "BLAKE3 of canonical input." "Refund," not "dispute_delivery_escrow."
9. **Beautiful without being gimmicky.** Every animation has a reason. Every emoji is purposeful. No tier cosmetic NFTs, no playful copy that betrays seriousness.
10. **Broad without being incoherent.** Every feature attaches to the spine. If it doesn't, it's a different product.

When two principles conflict, the higher-numbered one yields. (Verifiability beats privacy when they collide; programmability beats jargon when they collide.)

---

## §4. The user types (who Settle serves)

Seven primary users. Each gets a distinct UX surface but pays into the same on-chain primitive layer.

### 4.1 Consumers
**Who.** Humans paying humans. Friends, family, gig workers.
**What they want.** Send money fast. Get receipts that don't disappear. Express why they sent (note, voice, photo). Recover gracefully (refund, dispute, recall).
**Settle's promise.** Sub-second confirm. Receipts that prove themselves. Refunds that don't need support tickets.

### 4.2 Agents
**Who.** AI agents (LLM-driven, autonomous, scripted). Customer-support bots, research assistants, content pipelines, on-chain trading agents.
**What they want.** Pay APIs/services bounded by budget. Spend rules that protect the principal. Cryptographic receipts that prove the agent's behavior was authorized.
**Settle's promise.** Pact-as-API-key — bounded, allowlisted, expirable. Capability hash so the agent knows exactly what it's paying for. Receipt chain proves authorized vs unauthorized spends.

### 4.3 Merchants
**Who.** API providers, freelancers, agencies, developers who want to monetize a service.
**What they want.** Accept Solana payments without a custodian. Manage refunds and disputes. Build reputation on a public leaderboard. Expose their capability with a stable hash.
**Settle's promise.** Capability registry with human aliases. Reputation visible per-capability, not just globally. Refund/dispute primitives that don't require Settle to mediate.

### 4.4 Creators (writers, artists, streamers, educators, podcasters)
**Who.** Individuals who produce content + want supporters to fund their work. Different from merchants because the *relationship is many-to-one* (many supporters → one creator), the value is *content not capability*, and the primitive is *recurring tip / subscription* not *one-shot purchase*.
**What they want.** A handle others can pay/subscribe to in one tap. A public earnings page that doubles as a portfolio. Soulbound badges that show genuine fan loyalty (not bought followers). A no-platform-fee alternative to Patreon/Substack.
**Settle's promise.** /at/[handle] is the Web3 link-in-bio. Streaming Pact = subscription tier. Public proof page = portable bio. Soulbound supporter badges (earned by actually paying, not bought). Recurring tip with a single signature.
**Why a separate user type.** Creators are NOT a sub-set of consumers (they receive money primarily) or merchants (they aren't selling capability). They have their own surface in §10 (merchant layer extensions) and §12 (consumer payment layer).

### 4.5 Developers
**Who.** Solana devs, agent framework devs, Web3 product builders. Cursor / Claude Desktop / Replit / Vercel users.
**What they want.** Drop-in payment + receipt verification. Stable typed SDK. Stripe-style webhook vocabulary. Composable pieces.
**Settle's promise.** `@settle/sdk` (TS, Python, Rust). `<settle-pay>` and `<settle-verify>` web components. MCP middleware. Stripe-shaped events. One-line install.

### 4.6 Teams (DAOs, startups, agencies)
**Who.** Multi-person orgs that need shared spend authority + audit-grade tracking.
**What they want.** Per-employee Settle cards with their own caps. Approval workflows. Cost-center tagging. Compliance export.
**Settle's promise.** Squads-native AgentCards. Multi-tier guardian approvals. Treasury dashboards. Per-cost-center rollups.

### 4.7 The Solana ecosystem (other apps + protocols)
**Who.** Other wallets (Phantom, Backpack), other payment apps (Helio, Sphere, Solana Pay), other protocols.
**What they want.** A receipt verification standard. A capability hash registry. A reputation primitive.
**Settle's promise.** Open-source Anchor program with verifiable build. Receipt importer for non-Settle Solana payments. Capability registry as a contributable public good. Reputation queryable by any app.

---

## §5. The nine layers (how Settle is organized)

A layer is a coherent feature group sharing a user-flow surface and a data model. Each feature in the catalog (Part II) belongs to exactly one layer. Layers can depend on each other downward (#9 → #1) but never sideways at the same level.

| # | Layer | Owns | Depends on |
|---|---|---|---|
| 1 | **Core product surface** | Home dashboard, navigation, settings, onboarding | — |
| 2 | **Trust & receipt** | Receipts, hash chain, verifier SDK, voice notes, ZK mirror, public proof pages | 1 |
| 3 | **Agent economy** | AgentCards, Pacts (3 modes), capability registry, agent profiles, leaderboards | 1, 2 |
| 4 | **Merchant + Creator** | Merchant profiles, accept-payment endpoints, refund/dispute UI, merchant analytics, creator subscription tiers, public earnings page, supporter badges | 1, 2, 3 |
| 5 | **Developer** | SDK, API, webhooks, web components, MCP adapter, templates | 1, 2, 3, 4 |
| 6 | **Treasury & org** | Multi-employee cards, approval workflows, cost centers, exports | 1, 2, 3 |
| 7 | **Consumer payment** | Send, schedule, recurring, save, split, gift, group accounts, creator tip / subscribe | 1, 2 |
| 8 | **UX polish** | Animations, copy, error states, sound, mobile, accessibility, i18n | All others |
| 9 | **Protocol & future** | Verifiable build, receipt federation, governance, capability registry as public good | All others |

The layer ordering is also the build-priority ordering at any given phase. Lower-numbered layers must be solid before higher-numbered layers can fully expand. We don't ship Treasury (Layer 6) without Trust & receipt (Layer 2) being airtight first.

---

# PART II — FEATURE CATALOG

Every feature below uses the same spec template:

> **F#.# — Feature name**
>
> **What.** One sentence describing what it is.
> **Who.** Which user types use it (from §4).
> **Why care.** Why the user types from §4 want this.
> **Why startup.** Why this makes Settle more startup-worthy (defensibility, breadth, depth).
> **UI.** Where it lives in the app, what the user sees.
> **Flow.** Step-by-step user interaction.
> **Data model.** Tables, columns, on-chain accounts touched.
> **On-chain piece.** Anchor instructions used (or new ix needed).
> **Devnet status.** Real now / Real after build / Honestly simulated.
> **Test plan.** How we know it works.
> **Failure modes.** What could go wrong.
> **Polish details.** Animation, copy, edge cases that make it feel finished.

---

## §6. Core product surface (Layer 1)

The shell. Everything else lives inside it.

### F1.1 — Home dashboard — ⏳ PLANNED (current `/` is a marketing page; the integrated 3-card dashboard is unbuilt)
**What.** The first screen after wallet connect. Shows the user's balances, active Pacts, recent receipts, suggested next actions, public stats.
**Who.** Consumers, agents (their human principals), merchants, teams.
**Why care.** First-time users need orientation. Returning users need to act fast.
**Why startup.** A real app has a dashboard. A weekend project has a single page.
**UI.** Three columns on desktop, single-column on mobile: (1) Money (USDC balance, SOL gas balance, recent in/out), (2) Programs (Pacts active, AgentCards, streaming pacts running), (3) Activity (most recent 10 receipts, badge unlocks, follower notifications). At the bottom, a "Public capability heatmap" mini-widget linking to /leaderboard.
**Flow.** Connect wallet → page renders within 200ms with cached supabase data → each card has a primary action (Send, New Pact, View receipts).
**Data model.** Reads `agent_cards` (authority=user), `pacts` (authority=user), `receipts` (card_pubkey IN cards), `reputation_badges` (user_pubkey=user). Writes nothing.
**On-chain piece.** None. Pure read.
**Devnet status.** ⏳ PLANNED. Today the post-connect home is the marketing landing page. The integrated 3-card dashboard is a Phase 1 deliverable.
**Test plan.** Connect a fresh wallet → empty states render with onboarding CTAs. Connect a wallet with activity → all 3 cards populate with real data.
**Failure modes.** RLS misconfig → user sees other users' data. RPC slow → blank page. Mitigation: Supabase RLS audit, skeleton placeholders.
**Polish details.** Numbers count up from 0 on first render (motion). Click any number → drills into the relevant detail view. Mobile-first responsive.

### F1.2 — Universal nav (top bar)
**What.** Sticky header: Settle wordmark, primary nav (Send / Agents / Cards / Activity), wallet button (right).
**Who.** All user types.
**Why care.** Wayfinding. Same nav on every page.
**Why startup.** Generic apps hide nav inside hamburgers. Real apps surface action.
**UI.** Glass-morph background with subtle border. Wordmark left, links center on desktop / collapse on mobile, wallet button right.
**Flow.** Active route gets a subtle underline. Hovering a link shows a 1-line tooltip describing what's there.
**Data model.** None.
**On-chain piece.** None.
**Devnet status.** ✅ SHIPPED — `apps/web/components/header.tsx` renders on every route; wallet button hydration-safe via dynamic import.
**Test plan.** Every route renders the header. Active highlight matches current route.
**Failure modes.** Hydration mismatch on wallet button (already fixed via dynamic import).
**Polish details.** Smooth color transition on dark/light toggle. Wordmark itself is a discreet click → home.

### F1.3 — Settings & profile — 🟡 PARTIAL (notification subscribe + handle claim work; integrated /settings page unbuilt)
**What.** A single page where the user manages their handle, avatar, public_feed default, push notifications, sealed-box pubkey, language.
**Who.** All user types.
**Why care.** Account hygiene; user agency.
**Why startup.** Real apps have a real settings page. Without one, the product feels demo-only.
**UI.** Left rail with sections (Profile / Privacy / Notifications / Sessions / Developer), right pane is the active section.
**Flow.** Each section is a small form with explicit save buttons (no auto-save; users want to know when their state changed).
**Data model.** `handles` (display_name, avatar_url, sns_domain), `agent_cards.public_feed_default`, `push_subscriptions`, sealed-box keys.
**On-chain piece.** None directly; some settings (avatar) could later mint a profile NFT (post-Phase 4).
**Devnet status.** 🟡 PARTIAL. The push-subscribe endpoint, handle-claim, and privacy-toggle API all work; the unified `/settings` page that exposes them is a Phase 1 deliverable.
**Test plan.** Update each setting → reload → setting persists.
**Failure modes.** Wallet sig auth on save fails silently. Mitigation: explicit "saving..." state + toast on error.
**Polish details.** Avatar upload has a preview crop. Language picker shows native script (English, हिन्दी, 한국어, Português). Notification toggle reads "Notify me when I get paid" not "Enable push subscription."

### F1.4 — Onboarding (≤60s)
**What.** Guided first-time flow: connect wallet → claim handle → fund a starter Pact → make first payment.
**Who.** First-time consumers and agents (their principals).
**Why care.** Reduces TTFV (time to first value) from "5 minutes of confusion" to "60 seconds and you've sent your first receipt."
**Why startup.** Onboarding is a startup signal. Hackathon projects don't have it.
**UI.** Full-screen, single-column, progress dots top. Each step has plain-English copy + visual + one primary action.
**Flow.**
1. Welcome ("Hi. Settle is the wallet where every payment proves itself. 60 seconds.")
2. Connect Phantom (button → wallet popup).
3. Claim a handle (`@yourname`) — Solana Name Service compatible.
4. Sandbox airdrop (0.5 SOL + 25 test USDC, devnet only).
5. Send a test $0.01 to `@settle/welcome` — first receipt earned, confetti, 🏁 First Payer badge unlocks.
6. Tour 4 surfaces in 10 seconds each (cards on dashboard).
**Data model.** `handles` insert, `agent_cards` first card auto-created, `receipts` first row from the test send.
**On-chain piece.** `create_card` (first card), `spend` (first payment via x402 proxy).
**Devnet status.** 🟡 PARTIAL — onboarding flow exists end-to-end on devnet, but sandbox SOL airdrop fails on public Solana faucet rate limits; current workaround is the Circle USDC faucet + manual SOL send. Phase 1 ships our own test-USDC mint to fully close this.
**Test plan.** Run the flow on a brand-new browser profile, no extension state. Should reach step 5 without errors.
**Failure modes.** Faucet rate-limited. Mitigation: detect 429 → switch to Circle faucet copy + manual SOL send instruction.
**Polish details.** Each step's copy ends with what's about to happen, not what's happened. Confetti on step 5 scales with the $0.01 (a "puff," not a takeover). Badge unlock has its own brief reveal animation.

### F1.5 — Empty states
**What.** Dedicated visual + copy for every "no data yet" screen.
**Who.** All user types, especially new ones.
**Why care.** Empty states are the product's first impression for half of all sessions.
**Why startup.** Hackathon projects have generic "no data" gray boxes. Real products have empty states that teach.
**UI.** Each empty state is a small SVG + 2-line copy + primary CTA.
**Flow.** No data → render empty state with an action that fixes the empty (e.g., "No receipts yet — send your first payment").
**Data model.** None (purely UI).
**On-chain piece.** None.
**Devnet status.** 🟡 PARTIAL — many empty states exist, full route-by-route coverage incomplete. Phase 1 D3 audit closes the gap.
**Test plan.** Visit every route with a brand-new wallet → every empty state has an action, copy, illustration.
**Failure modes.** Stale empty state shows after data loads. Mitigation: empty state lives behind a `loading || data.length === 0` predicate.
**Polish details.** SVGs follow brand color palette. Copy never says "you have no X" — it says "send your first X" or "set up your first X."

### F1.6 — Universal command palette (Cmd+K)
**What.** Keyboard-driven action launcher: search receipts, jump to pages, run commands ("revoke card X," "pay @alice $5").
**Who.** Power users (developers, traders, busy operators).
**Why care.** Speed. Real apps have command palettes.
**Why startup.** Linear, Notion, Vercel all ship Cmd+K. It's a startup-quality signal.
**UI.** Modal overlay with input + grouped results (Pages / Receipts / Actions / People).
**Flow.** Cmd+K → modal opens → type "pay alice 5" → option pre-fills /send with values → Enter to confirm.
**Data model.** Searches receipts via Postgres FTS, agents/cards via owned-by-user query, handles via fuzzy match.
**On-chain piece.** None directly; preselects ix builders.
**Devnet status.** Real after build (1 week effort).
**Test plan.** Cmd+K opens / closes via shortcut. Typing returns results. Hitting Enter performs the action.
**Failure modes.** Slow search blocks UI. Mitigation: debounced query + `useDeferredValue`.
**Polish details.** Each action shows its keyboard shortcut next to it. Recent commands sticky at top. Native macOS-style modal.

### F1.7 — Dark / light mode (system + manual) — ⏳ PLANNED (current site uses one theme)
**What.** Three-option theme switcher: Auto (follow OS), Light, Dark.
**Who.** All users.
**Why care.** Default-OS-preference is the modern expectation. Users get cranky when forced into a theme.
**Why startup.** Stripe, Linear, Notion all ship this.
**UI.** Settings page → Theme section. Also a quick toggle in the wallet dropdown.
**Flow.** User picks → instant transition with a 200ms color crossfade → persists to localStorage + `handles.theme_pref` for cross-device sync.
**Data model.** `handles.theme_pref` ('auto' | 'light' | 'dark').
**On-chain piece.** None.
**Devnet status.** ⏳ PLANNED. Tailwind tokens not yet HSL-based; theme toggle UI doesn't exist.
**Test plan.** Toggle, reload, verify persistence.
**Failure modes.** FOUC (flash of unstyled content) on first load. Mitigation: inline `<script>` in `<head>` reads localStorage before React hydrates.
**Polish details.** Color tokens are HSL-based so animations smooth between modes. Charts re-color appropriately.

---

## §7. Trust & receipt layer (Layer 2)

The product's defining surface. This is where Settle's wedge — verifiable money — actually lives.

### F2.0 — Universal Receipt Kernel (the wedge made universal) — ⏳ PLANNED · Phase 1 priority #1
**What.** A single shared primitive every Settle payment routes through that commits a 4-component hash chain (`receipt_hash`, `reason_hash`, `policy_snapshot_hash`, `context_hash`) on chain. Today's reality: only the x402 proxy spend path commits all four. Direct sends, streaming claims, escrow releases, refunds, send-by-link, and imported receipts bypass the kernel — meaning *most* Settle payments don't prove themselves the way our pitch claims.
**Who.** Every user type. This is the wedge.
**Why care.** Without this, "every payment proves itself" is a half-truth. With this, it's a literal property of every Settle payment.
**Why startup.** Codex's review (truth-discipline finding) flagged this as the single biggest gap between what the doc claims and what the code does. Closing it is what turns the wedge from selective to universal — the real defensible primitive.
**UI.** Invisible to users; surfaces through the existing receipt page (F2.1) which now displays *all four hashes verifiable for any payment kind*.
**Flow.**
1. Define a `ReceiptInput` canonical struct that's the same shape regardless of payment kind: `{kind, request_id, payer, payee, amount, capability_hash | null, context_hash, slot, policy_version}`.
2. `kind ∈ {x402_spend, direct_send, streaming_claim, escrow_release, refund, send_link_claim, imported}`.
3. Each kind has its own `compute_context_hash(...)` that adapts what "context" means: HTTP method+path for x402, payer→payee+memo for direct send, slot range for streaming, deadline metadata for escrow, original_request_id for refund, source-app metadata for imports.
4. `policy_snapshot_hash` is BLAKE3 over the relevant policy state at the time (cap+allowlist+expiry for cards; stream rate for streaming; escrow params for escrow; sentinel for direct sends with no policy).
5. `reason_hash` is BLAKE3 over the canonical decision (`decision`, `deny_code`, `actor_pubkey`, kind-specific fields).
6. `receipt_hash = BLAKE3(canonical(ReceiptInput))` — the canonical commitment.
7. Every Anchor instruction that produces a payment OR every off-chain payment-recording path produces all four hashes and commits them (on-chain ix or signed event with on-chain anchor).
**Data model.** New columns on `receipts`: `receipt_kind text not null check (receipt_kind in (...))`, `context_hash bytea not null`. Migrate existing rows: backfill `kind = x402_spend` and compute `context_hash` from existing `purpose_hash`.
**On-chain piece.** Two paths.
- **Path A (preferred, requires program upgrade):** New `record_receipt` instruction that any Settle path can CPI into. Takes `ReceiptInput`, emits `UniversalReceiptEvent` with all four hashes. Existing ixs (`spend`, `spend_via_pact`, `claim_streaming`, `release_delivery_escrow`, `dispute_delivery_escrow`) call this internally instead of emitting their own event.
- **Path B (interim, no program upgrade):** Off-chain shim. Every API endpoint that produces a payment routes through `kernelCommit(receipt_input)` in `@settle/sdk` which computes the four hashes, signs them with the operator's keypair, and emits a Memo on the existing payment tx with the four hashes packed. Verifier checks both the operator signature AND the on-chain Memo. Less elegant than Path A; ships faster.
**Devnet status.** ⏳ **PLANNED**. Path B can ship in 1 week (off-chain shim + verifier update + UI label). Path A requires program upgrade — 3-4 weeks including audit-equivalent review.
**Test plan.** For each `kind`, originate a payment via that flow → verify all four hashes commit → verify `verifyReceipt()` returns OK with all four green checks.
**Failure modes.** Migration of historical receipts to backfill `kind`/`context_hash`. Mitigation: backfill only what we can compute; older rows show "partial verification" honestly.
**Polish details.** Receipt page hash inspector (F2.2) displays the `kind` badge alongside the four hashes. Pitch sentence ("every payment proves itself") becomes literal truth.

> **This is the most important feature in the entire doc.** Without F2.0, half the Trust & Receipt layer is aspirational. With F2.0, the wedge is universal and every other feature in §7 (story narration, hash inspector, refund-by-emoji, public proof page, ZK mirror) operates on a real, uniform substrate.

### F2.1 — The receipt object (live, updating) — 🟡 PARTIAL (live for x402 path; F2.0 makes universal)
**What.** A receipt page that updates after the payment lands: refund timer counts down, voice notes attach, ZK mirror appears, dispute window visible.
**Who.** All who pay or get paid.
**Why care.** A receipt isn't a static PDF — it's a living object representing the payment's full state.
**Why startup.** Stripe's receipts don't update. Venmo's evaporate. This is differentiated.
**UI.** /receipts/[requestId] page. Hero (amount + decision badge + relative time). Forensic timeline section (collapsible). Hash chain inspector (collapsible). Voice note section (recordable + playable). ZK mirror card (when populated). Refund + dispute buttons (mode-aware). Solscan link.
**Flow.** Page loads → Realtime subscription opens on `request_id` → updates merge in (ZK mirror appears, attachments arrive, refund window counts down).
**Data model.** `receipts` (live row), `receipt_attachments` (voice notes), `pacts` (mode-aware actions).
**On-chain piece.** Reads (none on render). Writes via refund (`close_pact` for oneshot, `dispute_delivery_escrow` for escrow).
**Devnet status.** 🟡 PARTIAL — receipt page is live, ZK mirror integration verified end-to-end. Live-update bytea-pollution bug fixed in audit. Per F2.0, the page currently shows full 4-hash data only for x402-path receipts; other payment kinds will get full hash display once Universal Receipt Kernel ships.
**Test plan.** Make payment → page renders within 1s. compress-cron writes ZK sig within 30s → ZK card appears live.
**Failure modes.** Realtime fires UPDATE with raw bytea → old code re-pollutes hash columns (FIXED with whitelisted-fields merge).
**Polish details.** Refund timer is a literal countdown clock with slot-anchored ticks. Hash inspector has a "verify in your browser" button that runs `verifyReceipt()` client-side and shows green checks per hash.

### F2.2 — Hash chain inspector
**What.** Click any receipt → expand → see all four hashes (`receipt_hash`, `reason_hash`, `policy_snapshot_hash`, `purpose_hash`) recompute live from the canonical inputs in your browser.
**Who.** Engineers and skeptics. Every receipt has this surface.
**Why care.** Verifiability has to be touchable, not theoretical. The user (or their auditor) must be able to *prove* the receipt without trusting Settle.
**Why startup.** This is the wedge made visible. Every other Solana wallet is a database; we are commitments. This screen is the proof.
**UI.** Each hash gets its own collapsible row: input fields (in canonical JSON), a recomputed hash, and a status (✓ matches on-chain / ✗ mismatch).
**Flow.** Click a hash row → expand → live recompute via `@settle/sdk verifyReceipt` happens in the browser → renders `green check` if matches.
**Data model.** Reads `receipts.canonical_*_json` columns (filled at insert time by the proxy).
**On-chain piece.** None for the inspector itself; data is the on-chain commitment.
**Devnet status.** 🟡 PARTIAL — verifier exists in `@settle/sdk` (✅ SHIPPED). Live in-browser recompute UI on receipt page is not yet wired; planned for Phase 1.
**Test plan.** Open any ALLOW receipt → all 4 hashes go green within 100ms.
**Failure modes.** Receipts inserted before migration 0006 have NULL `canonical_*_json` columns → inspector shows "partial verification" honestly.
**Polish details.** Hashes pulse-glow when they verify. Show the BLAKE3 byte stream in mono with selectable text.

### F2.3 — Receipt-as-story (LLM-narrated)
**What.** Above the technical receipt, a 2-3 sentence plain-English paragraph: "On May 5, you paid @zoro $5 for 'pizza tonight'. Settled in 0.42s via Helius Sender. Disputable until May 12."
**Who.** Consumers (the human in the loop). Also useful for compliance review.
**Why care.** Hashes don't read in human language. Stories do.
**Why startup.** No one else does this. It's a memorable moment.
**UI.** Top of the receipt page, before the hero. White card with the paragraph in a serif typeface (visual contrast vs the rest of the UI).
**Flow.** On first render, request the narration from `/api/receipts/[id]/narrate`. Server uses NVIDIA NIM (Kimi K2 instruct, primary) or Claude (fallback) with a deterministic prompt. Cache to `receipts.narration_text` so it's instant on subsequent renders.
**Data model.** Add `narration_text TEXT` column to `receipts`.
**On-chain piece.** None.
**Devnet status.** Real after build (4-6 hours).
**Test plan.** Open receipt → narration appears within 2s on first view, instantly on subsequent.
**Failure modes.** LLM API rate-limited or down → fall back to a deterministic template. Mitigation: 100% template fallback.
**Polish details.** Narration mentions all the meaningful state changes since insert (refunds, ZK mirror, voice note attached). Read aloud (TTS) on click — accessibility win.

### F2.4 — Voice note attachment (sealed-box encrypted)
**What.** Sender records up to 30s of audio; client-side encrypts via X25519+XChaCha20-Poly1305 sealed to the receipt recipient's pubkey; uploads ciphertext to Supabase Storage; recipient decrypts with their wallet sig auth.
**Who.** Consumers. Also useful for merchants who want to attach an "explanation" to a refund.
**Why care.** Adds humanity to a payment without leaking on chain.
**Why startup.** The privacy primitive proves Settle takes user data seriously. Telegram-grade.
**UI.** On every receipt page (sender side or recipient side, depending on perspective): a "Record voice note" button → record overlay → confirm. Recipient side: "Play voice note" with a waveform render.
**Flow.** Record → 30s WebRTC capture → audio Blob → sealed-box encrypt (`@settle/sdk` exports the helper) → upload ciphertext + metadata. Recipient: wallet-sig-authed `/play` endpoint → server returns ciphertext → client decrypts.
**Data model.** `receipt_attachments` (id, request_id, kind=voice_note, ciphertext_url, mime, duration_ms, created_by_pubkey, sealed_box_for_pubkey, ...).
**On-chain piece.** None on the message itself; the receipt the message attaches to is on-chain.
**Devnet status.** ✅ SHIPPED — sealed-box helper, recording, upload, play UI all work end-to-end.
**Test plan.** Sender records, uploads, recipient plays back. Third party tries to play → 401 (RLS).
**Failure modes.** Mic permission denied. Mitigation: explicit pre-check + fallback to text note.
**Polish details.** Waveform is rendered from the ciphertext's metadata, not the audio (privacy-preserving). Playback button has a tactile spring animation.

### F2.5 — Public proof page (`settle.so/at/<handle>/proof`)
**What.** A user's verifiable lifetime activity: badges, receipts (public_feed only), capability usage breakdown, dispute history, on-time confirmation rate.
**Who.** Anyone (public). Builds reputation portability.
**Why care.** Becomes a portable bio for agents, freelancers, creators.
**Why startup.** Replaces "trust me" with "here's the math."
**UI.** Hero (name, handle, avatar, joined-date, badges). Three sections: (1) capability usage breakdown bar chart, (2) public receipts feed, (3) reputation graph (who they've paid, who's paid them — opt-in).
**Flow.** Public URL. No auth. Renders cached aggregates.
**Data model.** Reads `handles`, `receipts`, `reputation_badges`, `follows`. New view: `public_proof_stats` aggregating per-user metrics.
**On-chain piece.** None on render. Optional: mint a "Proof page minted at slot X" badge for users who have it (later phase).
**Devnet status.** Partial now (`/at/[handle]` exists; `/proof` sub-page is the more verifiable surface).
**Test plan.** Visit `/at/<handle>/proof` for a wallet with activity → all three sections populate. Visit for a fresh wallet → graceful empty states.
**Failure modes.** Reputation graph could leak unwanted relationships. Mitigation: opt-in toggle in settings.
**Polish details.** OG image dynamically generated showing badges + lifetime spend total + capability breakdown — when a user shares their /proof URL on X, it renders a beautiful card.

### F2.6 — ZK-compressed receipt mirror display
**What.** Each ALLOW receipt has a violet card showing: mint address, mint tx Solscan link, "indexable via Photon RPC" + cost ("~$0.001/account").
**Who.** Engineers, technical buyers, technical judges.
**Why care.** Proves Settle's economics scale. A million-receipt scale costs ~$1000.
**Why startup.** This is a serious infrastructure move that 99% of payment apps don't ship.
**UI.** Below the submission_method badge on `/receipts/[id]`. Violet color scheme to differentiate from the on-chain receipt block.
**Flow.** compress-cron polls every 30s for `compressed_sig IS NULL AND decision='ALLOW'` → mints → updates row → Realtime push lands the card on the open receipt page.
**Data model.** `receipts.compressed_sig`, `receipts.compressed_addr`.
**On-chain piece.** Light Protocol `mintTo` of `SETTLE_RECEIPT` mint to recipient.
**Devnet status.** ✅ SHIPPED — verified end-to-end during integration audit (synthetic receipt → mint succeeds within 30s of insert).
**Test plan.** Make ALLOW payment → within 30s, ZK card materializes on receipt page.
**Failure modes.** Mint fails on chain → log, skip-this-tick, retry next tick. Mint succeeds + DB update fails → in-memory orphan set + manual UPDATE statement printed.
**Polish details.** Card has a subtle gradient mimicking Light Protocol's branding. Tagline: "Every Settle receipt is also a Light Protocol compressed account. ~$0.001 per receipt at scale."

### F2.7 — Hash-chain animation (visual chain link)
**What.** When the receipt page loads, the four hashes visualize as literal chain links connecting receipt → reason → policy → purpose. A small motion animation shows them locking together.
**Who.** All viewers.
**Why care.** Makes "hash chain" a thing you can see.
**Why startup.** Makes the wedge sticky. Memorable demo moment.
**UI.** Embedded above the hash inspector. SVG animation, ~3s, plays on first view per session.
**Flow.** Page enters → animation plays → settles into static state with the 4 hash labels.
**Data model.** None.
**On-chain piece.** None.
**Devnet status.** Real after build (1-2 days; framer-motion + custom SVG).
**Test plan.** Open receipt page → animation plays once per session, then static.
**Failure modes.** Reduced-motion preference. Mitigation: `prefers-reduced-motion` CSS query → static state only.
**Polish details.** Chain colors derive from a hash-of-hash function so the same receipt always has the same colors (deterministic identity).

### F2.8 — Refund-by-emoji
**What.** Sender sees their receipt → if within the dispute window, taps a 😞 emoji → confirmation modal → wallet sig → refund executes on-chain.
**Who.** Consumers (and merchants who want to proactively refund).
**Why care.** No support tickets. The dispute primitive is on-chain; the UI is just a click.
**Why startup.** Removes operations from the loop. This is what makes Settle scalable as a startup.
**UI.** On the receipt page, in the refund/dispute area: instead of a button "dispute," a row of emoji choices: 😞 (didn't deliver), 😡 (scam), 🤔 (changed my mind), other (free-text). Tapping fires a confirmation modal with the on-chain action.
**Flow.** Tap emoji → modal: "Refund $5 from @zoro? Money returns to your wallet in ~0.4s." → wallet sig → tx broadcast → confirmation animation (frost + refund-confetti).
**Data model.** `refund_requests` table tracks the emoji + free-text reason for analytics, even though the refund itself is on-chain.
**On-chain piece.** `close_pact` (oneshot) or `dispute_delivery_escrow` (escrow), routed via `/api/receipts/[id]/refund/build`.
**Devnet status.** Partial now (refund endpoint works; emoji UI not yet built).
**Test plan.** Make payment via delivery_escrow Pact → tap 😞 within window → refund tx confirms → balance returns.
**Failure modes.** Mode mismatch (oneshot tries dispute_delivery_escrow). Mitigation: route by `pact.mode`.
**Polish details.** Each emoji has a hover tooltip explaining what it means. Refund confetti is reverse-direction (particles fly inward).

### F2.9 — Receipt drag-to-share
**What.** Drag any receipt card onto a contact in the contacts panel → forwards a verifiable copy (text + Solscan link + verification widget).
**Who.** Consumers, agents (forwarding to a manager).
**Why care.** Receipts as social objects, not dead artifacts.
**Why startup.** The "drag a receipt" gesture is a moment that proves the product is built with care.
**UI.** Receipt card has a draggable affordance. Drop targets: contacts list, group chats (Settle native or via deep-link to Telegram/Phantom), email field.
**Flow.** Drag starts → ghost preview follows cursor → drop on contact → confirmation: "Send a verified copy of this receipt to @junho?" → confirm → recipient sees the shared receipt in their Settle inbox.
**Data model.** `shared_receipts` (sender_pubkey, recipient_pubkey, request_id, message, created_at).
**On-chain piece.** None (the receipt itself is already on chain; we're just sharing the URL + doing access control).
**Devnet status.** Real after build (1 week).
**Test plan.** Drag, drop, recipient sees in their inbox.
**Failure modes.** Touch on mobile doesn't have drag. Mitigation: long-press → context menu with "Share" option.
**Polish details.** The dragged ghost is a smaller version of the receipt card with a soft shadow. On drop, the receiving contact's avatar pulses.

### F2.10 — Receipt search & filtering
**What.** A search bar on the activity feed: full-text search across receipt notes + filter by capability, date range, amount range, decision, public/private.
**Who.** Consumers and merchants.
**Why care.** Real apps have search. Without it, history is unusable past 50 entries.
**Why startup.** Stripe / Mercury both ship this. Hackathon projects don't.
**UI.** Activity page has a search bar at top + filter chips below. Results stream in.
**Flow.** Type query → debounced search hits `/api/receipts/search?q=...&filter=...` → server uses Postgres FTS + index lookups.
**Data model.** Add `tsvector` index on `receipts(canonical_reason_json + purpose_text_decoded)`. `receipts.amount_lamports` already indexed.
**On-chain piece.** None.
**Devnet status.** Real after build (3-5 days).
**Test plan.** Search "pizza" → returns receipts with "pizza" in any of the searchable fields. Filter by date → results constrained.
**Failure modes.** Search is slow on large dataset. Mitigation: GIN index on tsvector, limit 100 results.
**Polish details.** Highlight matched terms in results. Filter chips collapse into a "+3 filters" pill on mobile.

### F2.11 — Receipt collections / tagging
**What.** User adds tags to receipts ("client-a-project", "tax-2026", "dinner with parents"). Tags become filterable.
**Who.** Power users, freelancers, accountants.
**Why care.** Bookkeeping. Without tags, receipts pile up untagged.
**Why startup.** Brex, Mercury, Ramp all ship per-receipt categorization. It's table stakes for a financial product.
**UI.** Receipt page → "Tags" pill row, click to add. Activity page → filter by tag.
**Flow.** On receipt page, click "+Tag" → autocomplete from user's existing tags + freeform.
**Data model.** `receipt_tags` (request_id, tag_text, added_by_pubkey, added_at).
**On-chain piece.** None (private metadata).
**Devnet status.** Real after build (2-3 days).
**Test plan.** Add tag → filter activity by tag → only tagged receipts show.
**Failure modes.** Inconsistent tag spelling. Mitigation: autocomplete + "merge tags" UI in settings.
**Polish details.** Auto-suggested tags based on capability hash + amount + time pattern (LLM-assisted, optional).

### F2.12 — Compliance-grade receipt export
**What.** "Download all my receipts" button: PDF + CSV with hash-chain proofs, formatted as US Schedule C / EU VAT / India GST.
**Who.** Power users, freelancers, agencies, accountants.
**Why care.** Tax season. Audit response.
**Why startup.** Stripe Atlas ships this. So does Mercury. Without it, you're not a real financial product.
**UI.** Settings → Exports → "Download tax export" with year + jurisdiction picker.
**Flow.** Click → backend generates PDF + CSV with all receipts, hash-chain proofs, currency conversion to user's locale → email link or direct download.
**Data model.** Reads `receipts` filtered by user-owned cards + date range.
**On-chain piece.** None on export; the receipts themselves are already on-chain.
**Devnet status.** Real after build (1 week — PDF generation + jurisdiction templates).
**Test plan.** Generate export for a wallet with 100 receipts → PDF opens → all 100 listed with hashes.
**Failure modes.** Currency conversion fails for old receipts (no historical FX data). Mitigation: store FX-at-time-of-payment in `receipts.fx_snapshot`.
**Polish details.** The PDF cover page includes a QR code linking to a verification URL that re-runs all hashes server-side as a public sanity check.

---

## §8. Agent economy layer (Layer 3)

This is where bounded credentials, capability hashes, and on-chain spend rules live.

### F3.1 — AgentCard (the credential)
**What.** A PDA storing an agent's spend rules: `daily_cap_lamports`, `per_call_max_lamports`, `allowlist`, `expiry_slot`, `revoked`, `usdc_mint`, `agent_pubkey`.
**Who.** Anyone who wants to grant bounded spend authority to a third party (an AI agent, a contractor, a child, an employee).
**Why care.** Replace API keys. Replace approve/spend mental load.
**Why startup.** Pact-as-API-key is *the* primitive. This is what investors invest in.
**UI.** /cards page lists user's cards. /cards/[id] shows the rules in plain English ("This agent can spend up to $50/day, max $5/call, only with translate.com and arxiv.org, until June 5") + revoke button + activity feed.
**Flow.** Create: /cards/new → form → "Build tx" → wallet signs `create_card` → card live. Modify: revoke or close (via `revoke` ix). Use: agent presents card via x402 proxy when paying.
**Data model.** `agent_cards` table mirrors on-chain state.
**On-chain piece.** `create_card`, `revoke`, `record_denial` (when an attempted spend exceeds rules).
**Devnet status.** ✅ SHIPPED.
**Test plan.** Create card with $10 cap → agent spends $5 → success. Agent tries to spend $15 → on-chain rejects → `record_denial` event.
**Failure modes.** Wrong USDC mint at create → all spends reject. Mitigation: pin mint at create time, hide from UI.
**Polish details.** Plain-English rule sentence regenerates whenever a rule changes. The "expiry" countdown is a slot-anchored ticking clock.

### F3.2 — Pact (programmable budget)
**What.** A child of an AgentCard with one of three modes: `OneShot` (capped budget for one task), `Streaming` (per-slot rate), `DeliveryEscrow` (held until release/dispute).
**Who.** Same as AgentCard.
**Why care.** Three distinct money primitives sharing one custody mechanism.
**Why startup.** No other Solana product offers all three modes via one program. This is the architectural moat.
**UI.** Each Pact has its own page. Mode badge prominent. Mode-aware actions visible (claim for streaming, release/dispute for escrow, close for oneshot).
**Flow.** Create via /agents/new (oneshot), /streaming-pacts/open (streaming), /escrows/open (delivery_escrow). Vault PDA owns the USDC ATA; program signs spends.
**Data model.** `pacts` (pact_pubkey, mode, parent_card, mode-specific fields, expiry_slot, closed).
**On-chain piece.** `open_pact`, `open_streaming_pact`, `open_delivery_escrow`. Spend ixs: `spend_via_pact`, `claim_streaming`, `release_delivery_escrow`. State changes: `close_pact`, `pause_streaming`, `resume_streaming`, `dispute_delivery_escrow`.
**Devnet status.** ✅ SHIPPED — all 14 ixs deployed; 3 modes (oneshot/streaming/escrow) working end-to-end.
**Test plan.** Each mode end-to-end: create → spend → close. Plus error paths: over-cap, expired, wrong allowlist.
**Failure modes.** Vault PDA derivation mismatch between program + indexer. Mitigation: shared seeds in `@settle/sdk`.
**Polish details.** Pact pages show a per-mode visualization: oneshot = budget bar, streaming = live spend rate dial, escrow = release/dispute timeline with countdown clocks.

### F3.3 — Capability hash (the universal API price tag)
**What.** BLAKE3 over canonical `{domain, method, path, amount_lamports, version}`. Pins what an agent is paying for.
**Who.** Agents (need to verify they're paying the right thing). Merchants (need to expose a stable identifier).
**Why care.** Without a capability hash, "I paid $5 for translation" is ambiguous. With it, the merchant + capability are cryptographically bound.
**Why startup.** This is the registry / standard primitive. Owning the registry = owning the schema.
**UI.** Every receipt shows the capability hash short (`abc123…`). Hover → expand to show canonical inputs. Click → /leaderboard/[capabilityHash].
**Flow.** Merchant exposes endpoint with `WWW-Authenticate: x402` header containing the capability hash. Agent reads, computes its own hash, compares, pays.
**Data model.** `receipts.capability_hash` (bytea), `merchant_capabilities` table mapping hash → human alias.
**On-chain piece.** Spend ixs include capability_hash in the hash chain.
**Devnet status.** ✅ SHIPPED — all 3 ixs deployed, mirror tables in Postgres.
**Test plan.** Merchant exposes capability → agent computes hash → matches → pays → receipt commits hash.
**Failure modes.** Capability spec drift (merchant updates path; old hash reject). Mitigation: version field; merchants must bump.
**Polish details.** The hash on the receipt has a hover-card showing the canonical inputs decoded ("POST /api/translate, $5.00, v1").

### F3.4 — Capability registry with human aliases
**What.** A curated registry mapping BLAKE3 hashes to human-readable strings (`translation/en→es/v1`).
**Who.** Anyone reading a receipt or comparing merchants.
**Why care.** Hashes are unreadable. Aliases turn "abc123…" into "translation/en→es/v1."
**Why startup.** Settle owns the schema → Settle owns the standard.
**UI.** /capabilities page lists curated capabilities by alias. Each has a description, schema, and merchants offering it.
**Flow.** Settle team curates first 50. Community submits more via PR to a public repo. Merchants register their hash + claim an alias.
**Data model.** `capability_registry` table (hash, alias, description, schema_jsonld, version, registered_by, registered_at).
**On-chain piece.** None directly; later, registered capabilities can mint a token to certify they're in the registry.
**Devnet status.** Real after build (1-2 weeks for first 50 + UI).
**Test plan.** Register an alias → it appears on receipts using that hash → leaderboard groups by alias.
**Failure modes.** Squatting (someone registers `translation/en→es/v1` for spam). Mitigation: PR review by Settle team initially; later, governance.
**Polish details.** Each capability page has its own hero — top merchants for that capability, latency stats, dispute rate, "How to integrate this capability" code snippet.

### F3.5 — Public capability leaderboard
**What.** Per-capability ranking of merchants by total volume, completed jobs, latency, dispute rate.
**Who.** Buyers (agents + humans) selecting which merchant to use. Merchants competing.
**Why care.** Public, immutable competition. Best merchant wins by behavior, not marketing.
**Why startup.** Audit data is the marketing surface. Garrett Harper / Lily Liu both score on this.
**UI.** /leaderboard with index of capabilities. /leaderboard/[capabilityHash] with per-capability ranking.
**Flow.** Aggregates from `receipts` filtered to public_feed=true ALLOW. View `capability_leaderboard`.
**Data model.** Postgres view aggregating receipts.
**On-chain piece.** None on render; the receipts are on chain.
**Devnet status.** ✅ SHIPPED — committed in spend ixs; receipt page displays.
**Test plan.** Public_feed receipts accumulate → leaderboard shows ranked merchants.
**Failure modes.** Sybil: one buyer self-pays via 100 sock-puppet wallets. Mitigation: rank by *unique buyers* not just volume.
**Polish details.** Live heatmap above the all-time leaderboard (already shipped F23 as ?simulate=1). Each merchant row has a sparkline of their last 30-day volume.

### F3.6 — Capability heatmap (live market view)
**What.** Real-time grid on /leaderboard showing the last 60s of public_feed ALLOW receipts pulsing per capability.
**Who.** Anyone visiting the page.
**Why care.** Proves activity. Sells "internet capital markets" feel.
**Why startup.** Without it, the leaderboard looks dead on a fresh devnet.
**UI.** Above the all-time leaderboard. Each cell is a capability hash; pulses on every new ALLOW. Tab title shows live count.
**Flow.** Client subscribes to Realtime on `receipts WHERE decision='ALLOW' AND public_feed=true`. Sliding 60s window aggregates per-capability counts in browser memory.
**Data model.** Realtime subscription only.
**On-chain piece.** None.
**Devnet status.** ✅ SHIPPED — F23 in PRODUCT_SPEC; `?simulate=1` affordance for empty-cluster demos.
**Test plan.** ?simulate=1 fires synthetic events. Real receipts also pulse cells.
**Failure modes.** Empty cluster looks dead → ?simulate=1 affordance prevents that.
**Polish details.** Cell color derived from hash. Pulse animation has slight depth (3D-ish via Framer Motion shadow).

### F3.7 — Agent profile page
**What.** /agents/[agentPubkey] showing the agent's lifetime activity: capabilities used, average latency, dispute rate, total spend, soulbound badges, parent cards.
**Who.** Buyers evaluating an agent's track record.
**Why care.** Reputation as a portable bio.
**Why startup.** Agent reputation is what makes them tradable. This page makes them tradable.
**UI.** Hero (agent name, principal handle, total lifetime spend). Capability breakdown chart. Recent receipts feed. Trust score (computed from activity). Soulbound badges.
**Flow.** Public URL. No auth.
**Data model.** Reads `agent_cards`, `pacts`, `receipts`, `reputation_badges`.
**On-chain piece.** None on render.
**Devnet status.** Real after build (1 week).
**Test plan.** Visit a real agent's profile → all sections populate.
**Failure modes.** Same Sybil concern as leaderboard. Mitigation: same fix.
**Polish details.** OG image renders the agent's badges + total spend as a shareable card. "Hire This Agent" Blink CTA.

### F3.8 — Killchain animation (revocation)
**What.** Click "Revoke card" → all child Pacts visually freeze with a frost shader → revocation tx fires → all spend ixs from this card now reject.
**Who.** Anyone who needs to nuke an agent. Critical-incident UX.
**Why care.** Agents misbehaving need to be killed instantly. The visual is the trust signal.
**Why startup.** Demo moment that judges remember.
**UI.** /cards/[id] page → "Revoke" button (large, red). Click → confirmation modal with slide-to-confirm. Confirm → all child Pact tiles on screen freeze with a frost overlay (CSS filter + svg mask). Audible alarm (optional). Wallet signs → tx confirms → tiles visually shatter into ice particles.
**Flow.** Slide-to-confirm → wallet sig → `revoke` ix → frost-then-shatter animation in 3-5 seconds total.
**Data model.** `agent_cards.revoked = true` (mirrored from chain).
**On-chain piece.** `revoke` ix.
**Devnet status.** Partial now (revoke ix works; frost animation not built).
**Test plan.** Revoke card → all child Pacts immediately visually frozen → next spend attempt fails on chain.
**Failure modes.** Animation drops frames. Mitigation: GPU-accelerated CSS filter.
**Polish details.** Frost shader uses an SVG mask. Sound effect is a single deep "whoom" + ice crackle, ~600ms total. After shatter, tiles fade to grayscale.

### F3.9 — One-tap "hire this agent" Blink
**What.** Agent profile has a Blink URL → pasting in X renders as a "Hire This Agent" card → one-tap funds a Pact + spawns an agent run.
**Who.** Anyone who reads X. Distribution channel.
**Why care.** Discovery without leaving X. Distribution-as-product.
**Why startup.** Tony Plasencia (Solana Foundation) lives for Blinks. This is the agent-economy equivalent of "subscribe."
**UI.** "Share as Blink" button on every agent profile. Clicking copies the Blink URL (settle.so/agent/<pubkey>?blink=hire). Pasting it on X auto-renders the card.
**Flow.** Buyer clicks Blink card on X → Phantom opens → spawns Pact funded with default amount → success → returns to X.
**Data model.** Solana Actions endpoint at `/api/actions/router/agent/[pubkey]/hire`.
**On-chain piece.** Builds `open_pact` ix.
**Devnet status.** Partial now (router exists; agent-specific Blink action not built).
**Test plan.** Generate Blink → paste in X → renders → click → hire flow completes.
**Failure modes.** Domain not registered with Dialect Actions Registry. Mitigation: register domain.
**Polish details.** Blink card OG image shows the agent's badge + capabilities + latency + price. Auto-refreshes every 60s.

### F3.10 — Pact-as-API-key SDK pattern
**What.** `@settle/agent` SDK exports `createPactKey({card, allowlist, cap, expiry})` → returns a typed credential that any HTTP client can present (replacing OpenAI / Anthropic API keys).
**Who.** Developers building agents or paying APIs from agents.
**Why care.** API key compromise = unbounded loss. Pact key = bounded.
**Why startup.** This single primitive replaces a $1B/year revenue category (API key management).
**UI.** Code snippet, not visual UI. But the SDK is itself a product.
**Flow.** Developer initializes Pact via SDK → SDK returns a credential object that wraps the on-chain Pact. They pass it to any function expecting an API key. The function presents it to the merchant via x402; merchant verifies on chain.
**Data model.** No new server tables; this is on-chain via Pact.
**On-chain piece.** Uses existing `open_pact` + `spend_via_pact`.
**Devnet status.** Real after build (1-2 weeks for SDK polish).
**Test plan.** Create Pact key → use in mock fetch → succeeds within bounds → fails outside bounds.
**Failure modes.** Developers expect API key shape (string); we return an object. Mitigation: SDK exposes `.toBearer()` for compatibility.
**Polish details.** SDK README has a side-by-side comparison: "OpenAI key (unbounded loss)" vs "Settle Pact key (bounded by cap, allowlist, expiry)." Real diff.

### F3.11 — Capability discovery via natural-language query
**What.** /capabilities/discover with input box: "Find me a cheap, fast translation merchant" → AI ranks the leaderboard → returns top 5 with reasoning.
**Who.** Buyers (humans + agents).
**Why care.** Reduces friction; turns the leaderboard into a tool, not just a chart.
**Why startup.** AI-native discovery layer. No competitor ships this.
**UI.** Search input on /capabilities page. Below: ranked merchants with reasoning.
**Flow.** User types → backend queries leaderboard view + AI summarization (Kimi K2 or Claude) → ranked list rendered.
**Data model.** Reads `capability_leaderboard` view.
**On-chain piece.** None directly.
**Devnet status.** Real after build (3-4 days).
**Test plan.** Query "cheap and fast translation" → top 5 merchants returned with stated reasoning.
**Failure modes.** AI hallucinates merchants. Mitigation: AI reasons over server-fetched leaderboard data only; no free-form generation.
**Polish details.** Loading state shows the AI thinking ("Filtering by latency... ranking by dispute rate..."). Each result has a "Why this match" expandable.

### F3.12 — Trust score (per-agent, per-capability)
**What.** Single number computed from receipt history: `trust_score = log(unique_counterparties) × allow_rate × inverse_dispute_rate`.
**Who.** Buyers evaluating agents. Anyone visiting an agent profile.
**Why care.** Single-glance trust signal.
**Why startup.** Single number = ratable agent. Agents become tradable.
**UI.** Big number on agent profile (out of 100). Hover → see formula breakdown.
**Flow.** Computed server-side periodically. Cached. Updates within 5min of new receipts.
**Data model.** New table: `agent_trust_scores` (agent_pubkey, score, last_computed, formula_inputs_json).
**On-chain piece.** None.
**Devnet status.** Real after build (1 week).
**Test plan.** Agent with 100 receipts, 0 disputes → high score. Agent with 100 receipts, 50 disputes → low score.
**Failure modes.** Score gameable by self-paying with sock puppets. Mitigation: only count receipts to *paying* counterparties (the agent's principal can't pay themselves).
**Polish details.** Formula visualizable as a tree breakdown ("100 receipts × 95% allow × 0.3 dispute factor = 28.5"). Score animates to its value when first viewed.

---

## §9. Merchant layer (Layer 4)

The supply side. Where API providers, freelancers, and agencies live.

### F4.1 — Merchant onboarding (`npx create-settle-merchant`)
**What.** A CLI that scaffolds a paid endpoint: HTTP server with x402 middleware, Solana Pay link, capability hash registered, receipt webhooks wired.
**Who.** API providers, hackers, freelancers.
**Why care.** From "I have an API" to "my API accepts USDC" in 60 seconds.
**Why startup.** Stripe's `npx create-stripe-app` is the closest parallel. We need this.
**UI.** CLI output streams. Final result is a deployable repo.
**Flow.** `npx create-settle-merchant my-translator` → prompts for: capability name, USDC price, target endpoint URL → generates: Express server with x402 + Solana Pay + receipt verification + Vercel deploy config.
**Data model.** Generates code, no Settle-side data.
**On-chain piece.** None at scaffold time; the generated app uses our existing on-chain primitives.
**Devnet status.** Real after build (1 week).
**Test plan.** Run CLI → deploy to Vercel → POST to the endpoint → x402 challenge → pay → receipt arrives in webhook.
**Failure modes.** Vercel deploy hiccup. Mitigation: also support Cloudflare Workers + Render templates.
**Polish details.** CLI shows ASCII art Settle logo on completion. README in the generated repo includes a "what you just got" section explaining each file.

### F4.2 — Merchant profile page (`/m/<merchant>`)
**What.** Public storefront for a merchant: capabilities offered, prices, latency stats, dispute history, lifetime volume, recent reviews.
**Who.** Buyers comparison-shopping. Search engines (SEO).
**Why care.** Discovery surface. The 1B query "best Solana translation API" lands here.
**Why startup.** Merchants need a place to send buyers. Without it, Settle is just rails — no marketplace value.
**UI.** Hero (merchant name, logo, joined-date). Capabilities grid (each is a card with price + latency + "Try it now" Blink). Stats sidebar. Recent receipts feed.
**Flow.** Public. No auth.
**Data model.** Reads `merchant_capabilities`, `receipts`, `merchant_pricelist`.
**On-chain piece.** None on render.
**Devnet status.** Partial now (`/at/[handle]` exists for handles; merchants need a separate or unified surface — design call).
**Test plan.** Merchant lists 3 capabilities → all 3 render with prices + latency.
**Failure modes.** Stale latency stats. Mitigation: rolling 30-day window, cached for 5min.
**Polish details.** Merchant can customize hero color + tagline. OG image renders dynamically with their stats.

### F4.3 — Subscription / recurring receivables
**What.** Merchant exposes a "subscribe" action that creates a Streaming Pact from the buyer to them at $X/month.
**Who.** SaaS providers, content creators, recurring service vendors.
**Why care.** Recurring revenue is a different beast than one-shot payments.
**Why startup.** Stripe's recurring billing is half their TAM. We need it on Solana.
**UI.** Merchant profile has a "Subscribe" CTA → modal: "Pay @merchant $10/month? You can cancel anytime." → wallet sig → streaming pact opened.
**Flow.** Buyer subscribes via `open_streaming_pact` (rate = $X / 30 days in slots). Merchant claims periodically via `claim_streaming`. Buyer can pause or close anytime.
**Data model.** Already covered by `pacts` (mode=streaming).
**On-chain piece.** Existing streaming pact ixs.
**Devnet status.** 🟡 PARTIAL — the on-chain streaming-pact primitive is ✅ SHIPPED, but a merchant-facing "Subscribe" CTA + flow is ⏳ PLANNED for Phase 3 Business surface.
**Test plan.** Subscribe → 30 days pass (simulated via slot manipulation in a test) → merchant has claimable balance → claims → balance settles.
**Failure modes.** Buyer's balance hits zero mid-month. Mitigation: pause-on-low-balance + email notification.
**Polish details.** Subscriber sees a live counter: "$2.34 streaming to @merchant • Cancel anytime."

### F4.4 — Merchant analytics dashboard
**What.** A merchant's-eye view of their volume, latency p50/p95/p99, dispute rate, top buyers, refunds, capability breakdown.
**Who.** Merchants.
**Why care.** Operations. Without analytics, merchants run blind.
**Why startup.** Stripe Dashboard is the comparison. Don't ship a worse one.
**UI.** /m/[merchant]/dashboard (auth-gated). Tabs: Overview, Capabilities, Buyers, Refunds, Subscriptions.
**Flow.** Merchant logs in via wallet sig → dashboard renders aggregates.
**Data model.** Reads `receipts`, `pacts`, `refund_requests`, `merchant_capabilities`.
**On-chain piece.** None.
**Devnet status.** Real after build (2 weeks).
**Test plan.** A merchant with real activity sees real data. New merchant sees onboarding empty states.
**Failure modes.** Slow aggregate queries. Mitigation: materialized views refreshed every 5min.
**Polish details.** Each chart has a "compare to last period" overlay. Export to CSV per chart.

### F4.5 — Refund-from-merchant-side
**What.** Merchant sees their inbound receipts → can proactively refund any → tx fires → buyer's wallet sees the refund.
**Who.** Merchants who want to be polite (or comply with chargeback policies).
**Why care.** Proactive refunds reduce dispute escalations.
**Why startup.** Stripe lets merchants refund. So should Settle.
**UI.** /m/[merchant]/dashboard → Receipts tab → each receipt has a "Refund" button (only available within window).
**Flow.** Click "Refund" → modal: "Refund $X to @buyer?" → wallet sig → tx fires → buyer's wallet sees the credit.
**Data model.** `refund_requests` mirrors merchant-initiated refunds.
**On-chain piece.** New ix? Or use existing dispute_delivery_escrow with merchant as caller? *Decision: extend existing ix to allow merchant-side voluntary refund.*
**Devnet status.** Real after build (1-2 weeks; needs new ix).
**Test plan.** Merchant refunds a receipt → buyer's wallet balance increases by refund amount.
**Failure modes.** Merchant refunds after dispute window. Mitigation: check on chain.
**Polish details.** Refund reason dropdown (similar to F2.8). Merchant can leave a voice note explaining the refund.

### F4.6 — Dispute resolution flow
**What.** When a buyer disputes, the merchant sees a notification → can respond with: accept refund / counter-evidence / escalate to community arbiter.
**Who.** Merchants.
**Why care.** Disputes need a structured response, not a free-text email thread.
**Why startup.** PayPal made $30B from dispute fees. We don't take fees, but we need the workflow.
**UI.** Merchant dashboard has a "Disputes" tab. Each dispute shows: receipt, buyer's reason, deadline countdown, response options.
**Flow.** Buyer disputes → merchant gets push notification + email → opens dispute → chooses response → resolution.
**Data model.** Extend `refund_requests` with merchant_response, evidence_attachments, resolved_at.
**On-chain piece.** Resolution paths: voluntary refund (merchant signs), expired (auto-refund via cron), escalation (future, post-Phase 4).
**Devnet status.** Partial now (escrow-cron handles auto-release; merchant-side response UI not built).
**Test plan.** Buyer disputes → merchant responds → state machine resolves correctly.
**Failure modes.** Merchant doesn't respond in time. Mitigation: auto-refund after deadline (already implemented via escrow-cron).
**Polish details.** Each dispute has its own page with full timeline. Merchant can attach voice note explanation.

---

## §10. Developer layer (Layer 5)

The platform surface. What others build on top of.

### F5.1 — `@settle/sdk` (TypeScript)
**What.** Single import for: building all 14 Anchor instructions, verifying receipts (`verifyReceipt()`), computing capability hashes, sealed-box encryption, hash builders.
**Who.** Web frontend devs, backend devs.
**Why care.** Stable API. No need to learn Anchor IDL drift.
**Why startup.** SDK is the moat for adoption. Stripe's SDK is half of why they won.
**UI.** Code, not screen. But the npm page is the storefront.
**Flow.** `npm install @settle/sdk`. `import { verifyReceipt, openPactIx, ... } from '@settle/sdk'`.
**Data model.** None server-side.
**On-chain piece.** Wraps all 14 ixs.
**Devnet status.** ✅ SHIPPED — verifier + ix builders + 83/83 unit tests green.
**Test plan.** 83 unit tests pass on every change. Integration test: full flow via SDK.
**Failure modes.** IDL drift between Anchor program + SDK constants. Mitigation: IDL drift detector script in CI.
**Polish details.** TypeScript types are perfect. JSDoc on every export. Auto-generated reference site at /sdk-docs.

### F5.2 — `@settle/sdk-py` (Python)
**What.** Same surface, Python.
**Who.** Python devs (huge agent framework community: LangChain, LlamaIndex, AutoGPT).
**Why care.** Reach. The Python world is 50% of agent dev.
**Why startup.** Multi-language SDK is what separates a real project from a TS-only hackathon entry.
**UI.** Code.
**Flow.** `pip install settle-sdk`. `from settle import verify_receipt, open_pact_ix`.
**Data model.** None.
**On-chain piece.** Wraps the same 14 ixs.
**Devnet status.** Real after build (3-4 weeks; need to port hash builders + ix builders).
**Test plan.** Mirror TS test suite in Python. CI runs both.
**Failure modes.** Solana web3.py library quirks. Mitigation: thin wrapper, leverage `solders`.
**Polish details.** README has Python code mirror of TS examples. Type hints throughout.

### F5.3 — `@settle/sdk-rs` (Rust)
**What.** Same surface, Rust.
**Who.** Rust devs (Solana program authors, agent frameworks like ai/llm-rs).
**Why care.** Native Solana language. Performance.
**Why startup.** Three-language SDK = professional grade.
**UI.** Code.
**Flow.** `cargo add settle-sdk`. `use settle_sdk::verify_receipt;`.
**Data model.** None.
**On-chain piece.** Same.
**Devnet status.** Real after build (4-6 weeks).
**Test plan.** Mirror tests.
**Failure modes.** Rust async story still maturing. Mitigation: support both blocking + async.
**Polish details.** Crate-level docs, example crates demonstrating each pattern.

### F5.4 — `<settle-pay>` web component
**What.** A drop-in `<settle-pay merchant="..." amount="...">` that any website embeds without React/Next.
**Who.** Any web dev.
**Why care.** Lowest-friction integration. No npm install. No framework lock-in.
**Why startup.** Stripe's "drop in checkout" was their viral growth. Settle needs the same.
**UI.** The component renders a clean checkout button that, when clicked, opens a Settle modal in an iframe and handles the payment flow.
**Flow.** Drop tag → Settle handles wallet connect, payment, receipt → emits a `settle-pay-complete` custom event with the receipt URL.
**Data model.** None Settle-side.
**On-chain piece.** Uses existing send + receipt flow.
**Devnet status.** Real after build (1-2 weeks).
**Test plan.** Drop on a vanilla HTML page → click → flow completes.
**Failure modes.** iframe X-Frame-Options on hosts. Mitigation: use a popup window not iframe; postMessage events back.
**Polish details.** Themable via CSS custom properties. Mobile responsive. Accessible (ARIA).

### F5.5 — `<settle-verify>` web component
**What.** `<settle-verify receipt="...">` renders a green-check or red-X for any Settle receipt, recomputes hashes client-side.
**Who.** Anyone wanting to display verified receipts on their site.
**Why care.** Receipts as embeddable proofs.
**Why startup.** Turns Settle into infrastructure.
**UI.** Tiny widget: ✓ Verified Settle Receipt | $X | @merchant | timestamp. Hover for details.
**Flow.** Component fetches receipt → recomputes 4 hashes via `verifyReceipt()` → renders verdict.
**Data model.** Reads receipt via public `/api/receipts/[id]`.
**On-chain piece.** None at runtime; the receipt's commitments are already on chain.
**Devnet status.** Real after build (1 week).
**Test plan.** Embed on test page → verify → ✓ green check.
**Failure modes.** Receipt API rate-limited. Mitigation: aggressive cache + permissive CORS.
**Polish details.** Click the widget → modal showing the full hash chain inspector.

### F5.6 — Stripe-vocabulary webhooks
**What.** Webhook events fire on receipt + pact lifecycle: `receipt.allowed`, `receipt.denied`, `pact.opened`, `pact.closed`, `pact.disputed`. HMAC-signed body.
**Who.** Backend devs integrating Settle.
**Why care.** Familiar shape. They already know how to verify Stripe webhooks.
**Why startup.** Vocabulary alignment = trust signal.
**UI.** Settings → Developer → Webhooks tab. List of endpoints. Signing secrets.
**Flow.** Dev creates endpoint → adds URL + secret → events fire → dev verifies HMAC server-side.
**Data model.** `webhook_endpoints` table. `webhook_deliveries` audit table.
**On-chain piece.** None directly; events fire from indexer's existing event-decoder.
**Devnet status.** 🟡 PARTIAL — webhook delivery worker is ✅ SHIPPED; canonical Stripe-shape event vocabulary (`receipt.allowed`, `pact.opened`, etc.) and HMAC verification SDK helper are ⏳ PLANNED for Phase 2.
**Test plan.** Register endpoint → make a payment → endpoint receives `receipt.allowed` with correct signature.
**Failure modes.** Endpoint slow → retry storms. Mitigation: exponential backoff, max 5 retries.
**Polish details.** Test fire button in dashboard. Replay any past event.

### F5.7 — MCP middleware adapter
**What.** A wrapper that turns any MCP server into a paid MCP server in 1 line: `mcpServer.use(settleMCPAuth({ pricePerCall: '$0.01', merchant: ... }))`.
**Who.** Anyone running an MCP server (the rapidly-growing community).
**Why care.** Solves "how do I monetize an MCP server" — the #1 question in MCP communities.
**Why startup.** Owning MCP-payment is owning a category.
**UI.** Code.
**Flow.** Dev wraps server → on each MCP call, middleware intercepts with x402 challenge → client pays → call proceeds with capability hash + receipt.
**Data model.** None new.
**On-chain piece.** Uses existing x402 + Pact spend flow.
**Devnet status.** Real after build (1-2 weeks).
**Test plan.** Wrap an example MCP server → call from Claude Desktop → flow completes with receipt.
**Failure modes.** MCP spec evolves. Mitigation: pin to a tested SDK version + bump quarterly.
**Polish details.** Demo: a paid MCP server inside Claude Desktop showing live receipts + balance.

### F5.8 — OpenAI Agents / Anthropic / LangChain / CrewAI adapters
**What.** First-class plugins for each agent framework: declare a Pact, all framework tool calls auto-route through Settle's x402 + receipt commitment.
**Who.** Agent framework users.
**Why care.** Where the agent dev community lives.
**Why startup.** Be in their default toolchain.
**UI.** Each framework has an example notebook.
**Flow.** `from settle.langchain import SettlePactTool; agent.add_tool(SettlePactTool(pact_id=...))`. Auto-handles paid HTTP.
**Data model.** None new.
**On-chain piece.** Existing.
**Devnet status.** Real after build (each adapter is 3-5 days; need 4-5 of them).
**Test plan.** End-to-end notebook for each framework runs to green.
**Failure modes.** Framework API churn. Mitigation: pin SDK versions.
**Polish details.** Each adapter ships with a README showing exactly the diff (5 lines) needed to make an agent paid.

### F5.9 — Idempotency keys on every payment endpoint
**What.** Every `/api/send/build`, `/api/spawn`, `/api/escrows/open` accepts an `Idempotency-Key` header. Same key + same body → returns the same response.
**Who.** Backend devs (especially in serverless contexts where retries happen).
**Why care.** Prevents double-spend on retry.
**Why startup.** Stripe's signature engineering practice. Nate Levine sees this and nods.
**UI.** Header documented. Same response on retry.
**Flow.** Server hashes (key + body) → if seen recently, return cached response. If new, process and cache.
**Data model.** `idempotency_cache` table (key_hash, body_hash, response_cache, expires_at).
**On-chain piece.** None directly.
**Devnet status.** Real after build (3-5 days).
**Test plan.** POST same body twice with same key → same response (no duplicate tx). Different key → fresh process.
**Failure modes.** Cache eviction races. Mitigation: 24h TTL, distributed lock on first write.
**Polish details.** SDK includes a UUID generator helper for idempotency keys.

### F5.10 — Public API & GraphQL endpoint
**What.** REST + GraphQL surface for: receipts, leaderboard, capabilities, agents, profiles. Read-only public; write-paths require wallet sig.
**Who.** Third-party devs building on Settle.
**Why care.** Composability. Without an API, Settle is a closed app.
**Why startup.** APIs are the protocol layer.
**UI.** /api/v1 docs + GraphQL playground at /graphql.
**Flow.** Dev queries → server returns. Rate-limited per IP for unauth; per-key for authed.
**Data model.** Wraps existing Postgres + on-chain reads.
**On-chain piece.** None on read; writes route through existing ixs.
**Devnet status.** Real after build (3-4 weeks).
**Test plan.** Query examples in docs all return expected shapes.
**Failure modes.** Rate limit too tight → devs frustrated. Mitigation: generous default + transparent quotas.
**Polish details.** OpenAPI spec auto-generated. Postman collection downloadable.

### F5.11 — Receipt importer for non-Settle Solana payments
**What.** Pull in Solana Pay receipts, Helio receipts, Sphere receipts → verify them under our hash chain.
**Who.** Anyone holding non-Settle Solana payment history.
**Why care.** History portability.
**Why startup.** **The audacious move.** Settle becomes the verification layer for ALL Solana payments. From "another wallet" to "the standard."
**UI.** Settings → Imports → "Import receipts from..." with adapters for Solana Pay, Helio, Sphere, Phantom direct sends.
**Flow.** User pastes URL or signs a "import this signature" challenge → server fetches the on-chain tx → extracts the relevant fields → constructs Settle-shape canonical input → computes our hashes → stores as an "imported" receipt.
**Data model.** `receipts.source` column ('settle' | 'imported_solana_pay' | 'imported_helio' | etc).
**On-chain piece.** Read-only on-chain inspection.
**Devnet status.** Real after build (3-4 weeks per adapter).
**Test plan.** Import a known Helio payment → verify under our hash chain → green check.
**Failure modes.** Other apps' receipts don't have our 4 inputs (purpose hash). Mitigation: partial verification — show what we *can* verify, honest about what we can't.
**Polish details.** Each imported receipt shows its source with a small badge. "Imported from Helio" vs "Native Settle." Both verifiable; the latter has more depth.

### F5.12 — Vercel + Replit + Cursor templates
**What.** One-click deploy templates that scaffold a paid agent or merchant on each platform.
**Who.** Devs in those ecosystems.
**Why care.** Distribution.
**Why startup.** Templates ARE distribution. Free traffic from each platform's marketplace.
**UI.** Template page on each platform's marketplace + redirect to a Settle onboarding URL.
**Flow.** Click template → fork → configure env → deploy.
**Data model.** None.
**On-chain piece.** Generated app uses existing primitives.
**Devnet status.** Real after build (1 week per template).
**Test plan.** Click template → deploy succeeds → first payment works.
**Failure modes.** Each platform's deploy infra differs. Mitigation: separate template per platform with platform-specific README.
**Polish details.** Each template README has a "What you just shipped" summary.

---

## §11. Treasury & organization layer (Layer 6)

For multi-person orgs (DAOs, startups, agencies). Squads-native.

### F6.1 — Squads-native AgentCards
**What.** When `card.authority` is a Squads PDA, the spend proposals route into Squads UI for multisig approval.
**Who.** DAOs, startups using Squads.
**Why care.** Existing Solana orgs use Squads. Don't make them switch.
**Why startup.** Becoming "Squads-friendly" is how we land enterprise.
**UI.** Card creation flow detects Squads multisig as authority → shows "Team-managed card" badge → spend ixs route through Squads.
**Flow.** Spend proposal goes to Squads UI → N-of-M sign → ix executes.
**Data model.** `agent_cards.is_squads_managed` (computed).
**On-chain piece.** Existing ixs work; Squads is just the signer.
**Devnet status.** Partial now (detection works; Squads-flow integration not yet end-to-end).
**Test plan.** Create card with Squads authority → propose spend → all M sign → tx confirms.
**Failure modes.** Squads SDK changes. Mitigation: pin version + integration test.
**Polish details.** Card badge shows "X-of-Y signers." Each signer's avatar shown.

### F6.2 — Per-employee AgentCards with cost-center tagging
**What.** Org admins create cards on behalf of employees. Each card tagged with cost center (e.g., "engineering," "marketing"). Reports roll up by tag.
**Who.** Startup CFOs, DAO treasurers, agency operators.
**Why care.** Brex / Ramp's exact use case. Visible spend per team.
**Why startup.** This is recurring B2B revenue category.
**UI.** Org dashboard → Employees tab → "Create card" wizard with cost center, cap, allowlist.
**Flow.** Admin creates card → employee gets onboarding link → employee accepts (transfers authority via on-chain heir cert? or wraps in Squads). Spend stays under admin's eye.
**Data model.** `org_employees` (org_pubkey, employee_pubkey, role, cost_center). `agent_cards.cost_center_id`.
**On-chain piece.** Existing ixs + future "transfer authority" ix (post-Phase 3).
**Devnet status.** Real after build (3-4 weeks for the org dashboard + transfer flow).
**Test plan.** Org has 3 cards in 3 cost centers → reports show $X / center.
**Failure modes.** Authority transfer must be irreversible from admin's side; need careful auth UX. Mitigation: 2FA + 24h delay on authority changes.
**Polish details.** Each cost center has a chart of monthly spend. Animation on chart load.

### F6.3 — Approval workflows (multi-tier)
**What.** Spend > $X requires approval from a manager. Spend > $Y requires CFO. Encoded as multi-tier guardian set.
**Who.** Larger orgs.
**Why care.** Real budget controls beyond Squads' single-tier.
**Why startup.** Brex / Ramp ship this.
**UI.** Card config → "Approval rules" section → drag-drop tier builder.
**Flow.** Spend proposed → routes to lowest-tier eligible approver → approves → if higher tier needed, escalates.
**Data model.** `approval_rules` (card_pubkey, tier_index, threshold_lamports, approver_pubkey, requires_approval_from).
**On-chain piece.** Approval check happens via Squads on-chain (or new program for multi-tier — design call).
**Devnet status.** Real after build (4-6 weeks; needs program work).
**Test plan.** $5 spend auto-approves. $5K requires manager. $50K requires CFO.
**Failure modes.** Approver unavailable → spend stuck. Mitigation: fallback rules (e.g., "any 2 of [list] can approve").
**Polish details.** Pending approvals dashboard with one-tap approve from email/push.

### F6.4 — Compliance export (Schedule C / VAT / GST)
**What.** "Export for tax" button generates jurisdiction-specific PDF + CSV with hash-chain proofs.
**Who.** Power users + orgs.
**Why care.** Tax season annual ritual.
**Why startup.** Stripe Atlas / Mercury both ship this.
**UI.** Settings → Compliance → "Export" with jurisdiction picker + year.
**Flow.** Click → backend generates files → email link or direct download.
**Data model.** Reads receipts + pacts.
**On-chain piece.** None on export.
**Devnet status.** Real after build (1 week per jurisdiction template; need 3-5 templates).
**Test plan.** Generate for each jurisdiction → opens in jurisdiction's tax software.
**Failure modes.** Jurisdiction template drift (rules change yearly). Mitigation: version templates by year.
**Polish details.** Cover page has QR to verify all hashes server-side.

### F6.5 — Treasury yield-while-idle
**What.** Pact funds that aren't yet spent earn 4-6% via Kamino/Drift integrations until claimed.
**Who.** Orgs with large parked Pacts.
**Why care.** Capital efficiency.
**Why startup.** Lily Liu / Garrett Harper's exact PayFi vision.
**UI.** Pact page → "Yield: $0.27 earned (4.8% APY)" displayed.
**Flow.** On Pact creation, opt-in to yield → idle USDC routes to Kamino vault → on spend, withdraw + spend → on close, full claimable balance returns to authority.
**Data model.** `pact_yield_positions` (pact_pubkey, vault, deposited_at, accrued_lamports).
**On-chain piece.** New ix or CPI to Kamino's deposit/withdraw program.
**Devnet status.** Real after build (3-4 weeks; Kamino devnet support varies).
**Test plan.** Open Pact with yield → idle for 1 week (sim) → balance grew. Close → recovers.
**Failure modes.** Kamino downtime. Mitigation: opt-in only, fallback to plain Pact.
**Polish details.** Yield rate displayed live, sourced from Kamino API. "Compare to Stripe (no yield)" sidebar.

---

## §12. Consumer payment layer (Layer 7)

For humans paying humans. The mass market.

### F7.1 — Send (one-tap pay)
**What.** /send page: pick recipient, enter amount, confirm. Default to USDC; option for SOL.
**Who.** Consumers. The simplest flow in the product.
**Why care.** This is the "Venmo for Solana" surface.
**Why startup.** Without a clean Send, Settle isn't a wallet.
**UI.** Single-column. Recipient input (handle / address / contact). Amount field with USD ↔ USDC ↔ SOL toggle. Note (text, voice, or photo). "Pay" button.
**Flow.** Type recipient → autocomplete from contacts/handles. Type amount → confirm. Wallet sig → confetti + receipt page.
**Data model.** Inserts into `receipts`.
**On-chain piece.** Solana Pay USDC TransferChecked + reference pubkey.
**Devnet status.** ✅ SHIPPED — `capability_leaderboard` view in Postgres aggregating ALLOW + public_feed receipts.
**Test plan.** Send $1 → confirms within 1s → receipt page renders.
**Failure modes.** Recipient has no USDC ATA. Mitigation: tx includes `createAssociatedTokenAccountIdempotent`.
**Polish details.** Amount field has a tactile spring on focus. Confetti tier scales with amount ($1=puff, $50=takeover).

### F7.2 — Send link (email / SMS / share)
**What.** Send money to someone who doesn't have a wallet yet. URL fragment carries an escrow keypair; recipient claims via wallet connect.
**Who.** Consumers paying recipients new to Solana.
**Why care.** Onboarding bridge. Removes "do you have a wallet?" friction.
**Why startup.** PayPal nailed this 20 years ago. Solana needs it now.
**UI.** /send → "Send by link" toggle → generates settle.so/pay/<token>.
**Flow.** Sender funds escrow → URL emailed/messaged → recipient opens → connects wallet → claims (one click).
**Data model.** `payment_links` (token, escrow_keypair_encrypted, sender, amount, expires_at).
**On-chain piece.** Escrow keypair holds the funds; recipient's claim tx transfers.
**Devnet status.** ✅ SHIPPED — direct USDC TransferChecked with Solana Pay reference. (Note: per F2.0 Universal Receipt Kernel, this path does NOT yet emit all 4 hashes; that's Phase 1 priority #1.)
**Test plan.** Generate link → claim from a different browser/wallet → balance arrives.
**Failure modes.** Link compromised. Mitigation: URL fragment never sent to server; encrypted at rest.
**Polish details.** Link claim page is rich preview-friendly (OG image with amount + sender).

### F7.3 — Schedule a payment (one-time, future)
**What.** "Pay @alice $20 on the 15th of next month."
**Who.** Consumers (rent, recurring chores).
**Why care.** Calendar-shaped tasks.
**Why startup.** Real wallets ship scheduled payments.
**UI.** /send → "Schedule" toggle → date picker → confirm.
**Flow.** Funds locked in a single-use scheduled-payment account → cron at scheduled date sends it.
**Data model.** `scheduled_payments` table.
**On-chain piece.** Either: (a) cron signs from a custodial keypair (worse), or (b) user prefunds a time-locked account (better, on-chain primitive).
**Devnet status.** Real after build (2-3 weeks for the on-chain primitive).
**Test plan.** Schedule → wait → fires.
**Failure modes.** Scheduled date passes during system downtime. Mitigation: catch-up window.
**Polish details.** Scheduled payments visible in a calendar view. Cancel anytime before fire.

### F7.4 — Recurring payment / "salary" mode
**What.** Streaming Pact dressed up as "Pay @alice $X every week, automatically."
**Who.** Consumers paying recurring (rent, contractors, kids' allowance).
**Why care.** Set-and-forget.
**Why startup.** Streaming + recurring are the same primitive; we already have it.
**UI.** /send → "Recurring" toggle → cadence picker + amount.
**Flow.** Opens streaming pact at correct rate. Recipient claims periodically.
**Data model.** Existing streaming pact.
**On-chain piece.** Existing.
**Devnet status.** 🟡 PARTIAL — streaming-pact primitive is ✅ SHIPPED. "Recurring salary" framing + UX (cadence picker, calendar of next-claim dates) is ⏳ PLANNED.
**Test plan.** Set up weekly → simulate slot advance → recipient can claim accumulated.
**Failure modes.** Sender's balance hits zero. Mitigation: pause + email.
**Polish details.** Calendar showing next-claim dates. Recipient sees a counter.

### F7.5 — Save for X (goal vault)
**What.** Lock USDC into a goal-bound vault that earns yield until target is met.
**Who.** Consumers saving for a purchase / trip / rainy day.
**Why care.** Behavioral nudge to save.
**Why startup.** Savings-goal apps are a $100M category.
**UI.** /save page → "New goal" → name + target + deadline → fund → progress bar.
**Flow.** Funds go to Kamino-yielding vault → lockable until target hit. Withdraw early possible (with confirmation).
**Data model.** `savings_goals` table.
**On-chain piece.** Same yield primitive as F6.5.
**Devnet status.** Real after build (2-3 weeks; depends on Kamino integration).
**Test plan.** Create goal → fund → balance grows.
**Failure modes.** Same as F6.5.
**Polish details.** Confetti when goal hit. Sharing a goal generates an OG image showing progress.

### F7.6 — Round-up savings
**What.** Every payment rounds up to nearest dollar; difference auto-saved into a yield vault.
**Who.** Consumers.
**Why care.** Painless saving.
**Why startup.** Acorns built a $1.5B company on this single feature.
**UI.** Settings → "Round-up savings" toggle.
**Flow.** Each payment's tx includes a second transfer of the round-up to the user's savings vault.
**Data model.** Reuse `savings_goals`.
**On-chain piece.** Single tx with two transfers.
**Devnet status.** Real after build (1 week).
**Test plan.** Pay $4.30 → savings vault grew by $0.70.
**Failure modes.** None significant.
**Polish details.** "$3.42 saved this month" metric on dashboard.

### F7.7 — Split bill (group)
**What.** /split-bill page: enter total + select group of friends → each pays their share via individual Pacts → atomic settle.
**Who.** Friends splitting dinner / trip / rent.
**Why care.** Splitwise on Solana, with cryptographic receipts.
**Why startup.** Splitwise has 10M+ users; this is the Solana-native version.
**UI.** /split-bill → form → invite handles → each invitee gets a payment link → all settled or all refunded.
**Flow.** Create split → all members fund → server-side aggregation → atomic settle (all or none).
**Data model.** `split_bills` table.
**On-chain piece.** Existing collab/split-bill primitives.
**Devnet status.** ✅ SHIPPED — collab + split-bill ixs + UI live.
**Test plan.** 3-person split → all 3 pay → recipient gets full amount in one tx.
**Failure modes.** Any one member fails to pay. Mitigation: deadline + auto-refund partials.
**Polish details.** Group chat per split. "Who's paid" tracker. Notify when everyone's done.

### F7.8 — Group accounts (shared wallet)
**What.** Roommates' rent fund. Trip fund. Squads-backed shared wallet with permissions.
**Who.** Multi-person households.
**Why care.** Joint money management.
**Why startup.** Major mainstream use case (multi-person households are 60% of US adults).
**UI.** /groups page → "New group" → invite handles → set permissions per member.
**Flow.** Group account = Squads PDA. Each member gets a per-member spend cap.
**Data model.** `groups` table mirroring Squads state.
**On-chain piece.** Squads V4.
**Devnet status.** Real after build (2-3 weeks for the UI on top of Squads).
**Test plan.** 3 roommates create group → each contributes → rent paid from group → audit trail.
**Failure modes.** Squads quirks. Mitigation: integration tests against devnet Squads.
**Polish details.** Group spending dashboard with per-member breakdown.

### F7.9 — Allowance mode (parent → child, boss → employee)
**What.** Recurring transfer to a sub-account with rules ("kid can spend at gaming sites, max $5/day, can't buy gift cards").
**Who.** Parents, employers, anyone wanting controlled subordinate spending.
**Why care.** Real demand. Crypto-curious parents want to teach kids.
**Why startup.** Greenlight + custodial cards are a $1B category.
**UI.** /allowance page → set up sub-account → cap, allowlist, expiry.
**Flow.** Same as AgentCard but framed for human use.
**Data model.** Same as F3.1.
**On-chain piece.** Existing.
**Devnet status.** 🟡 PARTIAL — AgentCard primitive is ✅ SHIPPED. "Allowance" UX framing (parent→child copy, request-increase flow) is ⏳ PLANNED for Phase 5.
**Test plan.** Set up allowance → child spends within bounds → over-cap rejects.
**Failure modes.** Child needs more than allowed. Mitigation: "request increase" flow.
**Polish details.** Plain-English copy throughout. Notification when child requests increase.

### F7.10 — Send-as-gift (with wrapping)
**What.** Wrap any payment as a gift with reveal animation. Recipient sees confetti before amount.
**Who.** Consumers.
**Why care.** Emotional payment.
**Why startup.** Cash App's $cashtag birthdays were a viral moment. We can do better.
**UI.** /send → "Send as gift" toggle → message + theme (birthday, congrats, sympathy).
**Flow.** Recipient gets a special URL → open → animation plays before revealing amount.
**Data model.** `gift_metadata` table.
**On-chain piece.** Same as send.
**Devnet status.** Real after build (1 week).
**Test plan.** Send gift → recipient opens → animation runs → amount revealed.
**Failure modes.** Reduced motion. Mitigation: skip animation if `prefers-reduced-motion`.
**Polish details.** 5+ themes. Each has its own confetti palette + sound.

### F7.11 — Pay-by-photo / QR
**What.** Snap a photo of a Solana Pay QR or invoice → app reads + pre-fills.
**Who.** Consumers in physical-world contexts.
**Why care.** Bridges digital + physical.
**Why startup.** Apple Pay-shape ergonomics.
**UI.** /send → camera button → opens camera → reads QR → fills form.
**Flow.** Capture → jsQR decode → parse Solana Pay URL → render confirmation.
**Data model.** None new.
**On-chain piece.** Solana Pay parse.
**Devnet status.** ✅ SHIPPED — F19 in PRODUCT_SPEC.
**Test plan.** Photograph a QR → form pre-fills.
**Failure modes.** QR not Solana Pay format. Mitigation: graceful "not recognized" message.
**Polish details.** Drop-zone for screenshot drag-and-drop too.

### F7.12 — Pay-by-voice / NLP
**What.** "Send Alice 20 dollars for the pizza" via voice → app drafts the tx.
**Who.** Consumers, especially mobile.
**Why care.** Hands-free payment.
**Why startup.** Voice is the next interface.
**UI.** Microphone button on dashboard → speak → confirmation.
**Flow.** WebRTC capture → transcribe (browser STT or server) → LLM parses intent → drafts tx → user confirms.
**Data model.** None new.
**On-chain piece.** Same as F7.1.
**Devnet status.** Real after build (2-3 weeks).
**Test plan.** Speak → recipient + amount + note correctly extracted.
**Failure modes.** Misheard amount. Mitigation: explicit confirmation step.
**Polish details.** Live transcription visible during speech.

---

## §13. UX polish layer (Layer 8)

Every detail that makes the product feel *alive*. Not features — sensibilities.

### F8.1 — Sub-400ms confirm with haptic + visual + audible feedback
**What.** Every payment confirm is a multi-modal moment.
**Why.** "Fast" must be felt.
**How.** Visual: 4-state animation strip (idle → signing → confirming → success). Haptic: navigator.vibrate on mobile (200ms cue). Audible: optional "ka-ching" sound (off by default; toggle in settings). Sub-400ms target. Time elapsed displayed in ms.

### F8.2 — Confetti tiered by amount
**What.** $0.01–$0.99 = puff, $1–$4.99 = standard, $5–$49.99 = mid, $50+ = takeover with full-screen burst + haptic pattern.
**Why.** Money should feel different at different magnitudes.
**How.** canvas-confetti with tier-specific particle counts.

### F8.3 — All copy passed through "explain like I'm not a crypto dev" filter
**What.** Every label, button, error message, modal copy hand-edited for clarity.
**Why.** Crypto jargon kills consumer adoption.
**How.** Style guide: "Programmable budget" not "Pact." "Refund" not "dispute_delivery_escrow." "Card balance" not "vault_lamports." Editorial pass on every screen.

### F8.4 — Loading states are real, not gray boxes
**What.** Every async UI shows a meaningful skeleton, not a generic spinner.
**Why.** Skeletons match the layout of the eventually-loaded content.
**How.** Per-screen skeleton component matching the data shape.

### F8.5 — Error states are actionable
**What.** No "Something went wrong." Every error explains: what happened, why, what the user can do, with a primary action.
**Why.** Errors are part of the product, not a failure of the product.
**How.** Per-error-code copy + action. "Insufficient USDC. You have $3.20; this payment is $5.00. [Get devnet USDC] [Cancel]."

### F8.6 — Empty states teach
**What.** Every empty state has a small SVG, plain copy, and a primary action.
**Why.** First-impression for half of all sessions.
**How.** F1.5 spec.

### F8.7 — Sound design (subtle, optional, off by default)
**What.** UI sounds for confirm, refund, badge unlock, error. Tasteful, not gimmicky.
**Why.** Audio is a memory channel.
**How.** 5-7 short sounds (each <500ms). Toggle in settings. Default off.

### F8.8 — Plain-English explanations on every complex screen
**What.** "Explain this" button → modal with plain-English summary of what the user is looking at.
**Why.** Accessibility + comprehension.
**How.** Per-screen helper text. Some auto-generated by LLM.

### F8.9 — Mobile-responsive everywhere
**What.** Every screen tested on iPhone SE (smallest current device) up.
**Why.** Half of demos are on phones.
**How.** Tailwind responsive utilities + manual testing.

### F8.10 — Accessibility: keyboard, ARIA, screen reader
**What.** Full keyboard navigation, ARIA labels, screen-reader optimized.
**Why.** Real product responsibility.
**How.** WCAG 2.1 AA target. axe-core in CI.

### F8.11 — i18n in 10+ languages
**What.** English, Hindi, Korean, Portuguese, Spanish, Mandarin, Japanese, Vietnamese, German, French, Arabic.
**Why.** Superteam regional appeal + reality (most users aren't English-first).
**How.** next-intl. Translation pass on every visible string.

### F8.12 — Dark mode + high-contrast mode
**What.** Theme toggle (auto/light/dark) + high-contrast option.
**Why.** Accessibility + macOS user expectation.
**How.** F1.7 spec.

### F8.13 — Reduced-motion respect
**What.** All animations disabled if user has `prefers-reduced-motion`.
**Why.** Accessibility.
**How.** CSS media query throughout.

### F8.14 — Tooltips on every complex element
**What.** Hover any unclear element → 1-line tooltip with explanation.
**Why.** Discoverable depth without cluttering UI.
**How.** Radix tooltip. 200ms delay.

### F8.15 — Custom OG images per share-able URL
**What.** Receipts, agent profiles, merchant pages, /at/[handle] all have dynamic OG images.
**Why.** When shared, the link looks beautiful.
**How.** @vercel/og at edge.

### F8.16 — Sound + visual sync (anti-glitch)
**What.** When a sound and animation are bound, they fire together (within 16ms).
**Why.** Glitchy feels broken.
**How.** Single requestAnimationFrame trigger.

### F8.17 — Brand visual identity refinement
**What.** Color palette, typography, logo, mascot (optional), iconography all consistent.
**Why.** Polished products have consistent visual identity.
**How.** Design pass with a designer or AI-tool-assisted iteration.

### F8.18 — Microcopy as a discipline
**What.** Every button, every confirmation, every empty state hand-edited.
**Why.** Words are UX.
**How.** Editorial pass per screen.

### F8.19 — Page transitions
**What.** Smooth transitions between routes (subtle fade or slide).
**Why.** Continuity.
**How.** Next.js view transitions API or framer-motion.

### F8.20 — Power-user shortcuts
**What.** Cmd+K palette, Cmd+P pay, Cmd+R refund, Cmd+/ help.
**Why.** Power users speed-run the app.
**How.** Custom hook on each shortcut.

---

## §14. Protocol & future layer (Layer 9)

Settle as infrastructure. The endgame.

### F9.1 — Verifiable build
**What.** Anchor program bytecode on devnet/mainnet provably matches GitHub source.
**Who.** Anyone evaluating Settle's trustworthiness. Anatoly directly.
**Why care.** Decentralization. No "trust us, this is what we deployed."
**Why startup.** Credible neutrality is a moat.
**UI.** A page on settle.so/verify showing the deployed bytecode hash + GitHub commit + build instructions.
**Flow.** CI builds → publishes hash to a public registry → settle.so fetches + displays.
**Data model.** None on app side; uses Solana's Verifiable Build registry.
**On-chain piece.** Anchor program build with `--verifiable`.
**Devnet status.** Real after build (1-2 weeks; depends on Anchor verifiable build maturity).
**Test plan.** Bytecode hash matches between deployed program + GitHub Actions build artifact.
**Failure modes.** Build env drift. Mitigation: pinned Docker image for builds.
**Polish details.** "Verified ✓" badge on the home page header.

### F9.2 — Public capability hash registry as a contributable repo
**What.** GitHub repo of canonical capability hashes. Community PRs to add new ones.
**Who.** Merchants registering new capabilities. Buyers searching for canonical hashes.
**Why care.** Settle owns the standard.
**Why startup.** Owning the registry = owning the schema.
**UI.** github.com/settle/capability-registry + settle.so/capabilities surface.
**Flow.** Merchant submits PR with capability spec → Settle team reviews + merges → registry table updates → display on settle.so.
**Data model.** `capability_registry` synced from GitHub.
**On-chain piece.** Optional: registered capabilities can mint a "registered" badge.
**Devnet status.** Real after build (3-4 weeks for first 50 + UI).
**Test plan.** Submit PR → merge → registry updates → visible.
**Failure modes.** Spam PRs. Mitigation: PR review gate.
**Polish details.** Each capability page has its own URL with full schema.

### F9.3 — Receipt federation (cross-Settle deployments)
**What.** Multiple Settle deployments (mainnet, testnet, custom) can verify each other's receipts via shared signing protocol.
**Who.** Multi-deployment orgs (e.g., a fintech using Settle + their own fork).
**Why care.** Trust portability.
**Why startup.** This is what makes Settle a protocol, not a product.
**UI.** Verify any receipt regardless of deployment origin.
**Flow.** Cross-deployment signed attestations.
**Data model.** `federation_signers` table.
**On-chain piece.** Possibly an attestation registry program.
**Devnet status.** Real after build (research project; 6-8 weeks).
**Test plan.** Deploy two Settle instances → verify across.
**Failure modes.** Trust assumptions in federation. Mitigation: explicit trust model docs.
**Polish details.** Cross-deployment receipts show "Federation: trusted by [X, Y, Z]" badge.

### F9.4 — Public stats / transparency reports
**What.** Daily volume, dispute rate, refund latency, capability indices. Public, immutable, queryable.
**Who.** Anyone evaluating Settle's health.
**Why care.** Openness builds trust.
**Why startup.** Stripe Atlas, Mercury, every serious fintech publishes this.
**UI.** /stats page with live charts.
**Flow.** Aggregates from `receipts` + `pacts`. Daily update.
**Data model.** Materialized views.
**On-chain piece.** None.
**Devnet status.** Real after build (1 week).
**Test plan.** Charts populate. CSV downloadable.
**Failure modes.** Privacy leak. Mitigation: aggregate-only, no per-user data.
**Polish details.** Each chart has multiple time scales (1d, 7d, 30d, all-time).

### F9.5 — Settle Index (capability category indices)
**What.** S&P 500-style indices for AI service capabilities. "AI Translation Index up 4.2% this week."
**Who.** Traders. Researchers. Capability buyers benchmarking.
**Why care.** Real markets, real benchmarks.
**Why startup.** Lily Liu's "real markets, not narratives." Be the Bloomberg of AI services.
**UI.** /index page. Each index has price chart, constituents, methodology.
**Flow.** Compute weighted price/latency by capability cluster.
**Data model.** Materialized views over `receipts` + `capability_registry`.
**On-chain piece.** Could mint an index token (post-Phase 5).
**Devnet status.** Real after build (3-4 weeks).
**Test plan.** Index updates daily. Components rebalance monthly.
**Failure modes.** Sybil-game-able. Mitigation: weight by unique-buyer count + time on rail.
**Polish details.** Each index gets an OG card. Embed widget for media.

### F9.6 — Open-source roadmap with voting
**What.** /roadmap page. Users propose + vote on what ships next.
**Who.** Power users, devs, ecosystem.
**Why care.** Bottom-up product input.
**Why startup.** Linear / Vercel / Discord all do this.
**UI.** /roadmap with cards per proposal. Vote button.
**Flow.** Submit → community votes → top items shipped (with Settle team's discretion).
**Data model.** `roadmap_proposals` table. `roadmap_votes` table.
**On-chain piece.** None initially. Long-term: vote weight by reputation badge.
**Devnet status.** Real after build (1-2 weeks).
**Test plan.** Submit, vote, see ranking.
**Failure modes.** Vote brigading. Mitigation: 1-vote-per-handle + reputation weight.
**Polish details.** Each proposal has its own discussion thread.

### F9.7 — Bug bounty + responsible disclosure
**What.** "Found a bug? Email security@settle.so. We pay bounties." Hall-of-fame + payout history.
**Who.** Security researchers.
**Why care.** Maturity signal. Real products get audited.
**Why startup.** Cred-builder.
**UI.** /security page.
**Flow.** Researcher emails → triage → payout (via Settle, of course).
**Data model.** `disclosed_vulnerabilities` table.
**On-chain piece.** Bounty payments via Settle.
**Devnet status.** Real after build (1 week).
**Test plan.** Submit a fake bug → triaged → payout flow.
**Failure modes.** Bounty hunting cost > value. Mitigation: explicit scope + tier-by-severity.
**Polish details.** Hall-of-fame page with researcher avatars.

### F9.8 — Receipt-based governance
**What.** On-chain governance for protocol changes. Vote weight = function of receipt activity per capability.
**Who.** Active participants in the ecosystem.
**Why care.** First plausibly Sybil-resistant on-chain governance without ZK passports.
**Why startup.** Genuinely novel governance primitive.
**UI.** /governance page. Proposal list. Vote buttons for accounts with sufficient activity.
**Flow.** Proposal → discussion → on-chain vote → execution.
**Data model.** `governance_proposals` + `governance_votes`.
**On-chain piece.** Realms / Squads governance integration.
**Devnet status.** Real after build (4-6 weeks).
**Test plan.** Propose → vote → execute.
**Failure modes.** Whale dominance. Mitigation: capped weight per address.
**Polish details.** Vote weight visible per voter. Decay over inactivity.

### F9.9 — Anonymous-but-verified mode (ZK)
**What.** Prove "I have >50 ALLOW receipts and 0 disputes" without revealing pubkey.
**Who.** Privacy-respecting reputation users.
**Why care.** Privacy + trust.
**Why startup.** Forward-looking primitive.
**UI.** "Anonymous proof" button on profile.
**Flow.** Generate ZK proof of activity meets threshold without revealing identity.
**Data model.** Off-chain proof storage.
**On-chain piece.** Public verifier circuit.
**Devnet status.** Real after build (research project; 8-12 weeks).
**Test plan.** Generate proof, verify, no leak.
**Failure modes.** ZK circuit complexity. Mitigation: well-tested library (e.g., RiscZero, SP1).
**Polish details.** Use cases page (whistleblowers, marketplace bidders, voting).

### F9.10 — Cross-chain receipt mirrors
**What.** Bridge Settle receipts to Ethereum/Base/Arbitrum as light proofs.
**Who.** Cross-chain users.
**Why care.** Settle as the verification layer for ALL payments, not just Solana.
**Why startup.** Audacious, big-vision move.
**UI.** /receipts/[id] → "Mirror to Ethereum" toggle.
**Flow.** Compute proof → bridge → other chain stores it.
**Data model.** `cross_chain_mirrors` table.
**On-chain piece.** Bridge contract on Ethereum-side.
**Devnet status.** Real after build (research; 8-10 weeks).
**Test plan.** Mirror receipt → verify on Ethereum.
**Failure modes.** Bridge security. Mitigation: light-client verification only.
**Polish details.** Cross-chain badge on mirrored receipts.

---

# PART III — BUILD SEQUENCE

## §15. What's already shipped (Phase 0)

> ⚠️ **Phase 0 is "code-shipped" but not yet "verified-shipped."** Compile-clean ≠ user-tested. Codex's review correctly flagged that we don't have a real browser/wallet smoke test confirming end-to-end on devnet for every shipped feature. **Phase 0 does not officially close until the May 1–11 hackathon-week verification gate (see `docs/BUILD_ORDER.md`):**
>
> - [ ] Real Phantom wallet on devnet, real USDC, full payment flow → receipt → ZK card appears within 30s → 🏁 First Payer badge mints within 5min.
> - [ ] All 4 background workers running for 24h continuous on devnet without error logs.
> - [ ] All 14 Anchor ixs have a localnet runtime test that actually invokes the ix and reads the resulting state.
> - [ ] IDL drift detector green on every commit.
> - [ ] Web app deploys to Vercel without build errors and the deployed URL renders the dashboard end-to-end.
>
> Until each ✅ below has its corresponding verification gate green, treat the tag as "code-shipped, not yet verified."

As of code-shipped state on devnet:

✅ Anchor program: 14 instructions, 3 Pact modes, 4-hash receipt commit chain (only on x402 path — F2.0 makes universal)
✅ @settle/sdk with verifyReceipt + ix builders + 83 unit tests
✅ Indexer + 4 background workers (escrow-cron, badge-cron, compress-cron, webhook-worker)
✅ Web app skeleton: home, send, agents, cards, feed, leaderboard, /at/[handle], receipts, docs, onboarding, sandbox
✅ 25 user-visible features (F1–F25 in PRODUCT_SPEC.md)
✅ MPL Core soulbound badges (6 kinds)
✅ Light Protocol ZK-compressed receipt mirrors
✅ Capability heatmap on /leaderboard with ?simulate=1
✅ Realtime subscriptions: receipts, attachments, follows
✅ Sealed-box voice notes
✅ Webhook delivery worker
✅ Helius RPC + Sender (Jito Bundles)
✅ Pyth Hermes price ticker
✅ SAS verified-merchant integration
✅ Squads V4 detection
✅ Solana Pay + Blinks + actions.json
✅ Bonfida SNS resolver
✅ Lighthouse asserts

**Caveats acknowledged (Codex truth pass):**
- ⚠️ The "every payment proves itself" claim is currently true only for the x402 spend path. Direct sends, streaming claims, escrow releases, refunds, send-by-link, and imported receipts bypass the 4-hash kernel. **F2.0 Universal Receipt Kernel (Phase 1 priority #1) closes this gap.**
- ⚠️ No browser/wallet smoke-test has confirmed the full flow end-to-end with a real human signing — that's the hackathon-week task in BUILD_ORDER.md.
- ⚠️ No localnet runtime test suite for the 14 ixs beyond unit tests — adding that to BUILD_ORDER.md Phase 1 work.

This is enough for a hackathon submission that wins **provided the May 1–11 verification gate clears**. It is not enough for a startup. The next phases turn it into one.

> **Working rule going forward (per Codex's verdict):**
> 1. STRATEGY.md = what Settle becomes (atlas).
> 2. BUILD_ORDER.md = what we build next (tracker).
> 3. First real build priority = Universal Receipt Kernel (F2.0).
> 4. No feature ships unless it connects to programmable / verifiable / trusted money movement (§37 6-criteria filter).

## §16. Build phases (1 through 6)

### Phase 1: Universal Receipt Kernel + Personal surface depth (6-10 weeks)

**Goal:** make the wedge — *every payment proves itself* — universally true (not just on the x402 path), AND make the consumer surface feel unmistakably finished.

**Build order (priority sequence — do not parallelize past #1):**

1. **F2.0 Universal Receipt Kernel** — *priority #1, blocks everything else.* Without this, the wedge is selectively true. Every other Trust & Receipt feature operates on a uniform substrate after this lands. Path B (off-chain shim) ships in 1 week; Path A (program upgrade) in 3-4 weeks. Start with Path B; promote to Path A as part of program v0.4 upgrade.
2. **F1.1 Home dashboard** — replace the marketing landing page with the real 3-card dashboard. Without this, returning users have nowhere to land.
3. **F1.3 Settings page** — the unified `/settings` page exposing handle / privacy / notifications / sealed-box / theme.
4. **F2.8 Refund-by-emoji** — primitive already exists; this is the demo-defining UX moment.
5. **F2.3 Receipt-as-story narration** — LLM-rendered plain-English on every receipt.
6. **F3.8 Killchain animation** — frost shader on revoke. Demo-defining.
7. **F2.7 Hash-chain animation** — chain-link visualization on receipt page.
8. **F3.12 Trust score** — earned-from-activity, single number on agent profiles.
9. **§30 9 emotional moments** — design pass on each (M1 Pact creation through M9 dev integration).
10. **§31 D1–D14 cross-cutting disciplines audit** — every existing screen passes all 14.
11. **F1.4 Onboarding refined** — fix the sandbox airdrop quirks (Circle faucet fallback).
12. **F1.5 Empty states everywhere** — every route has a teaching empty state.
13. **F2.10 Receipt search** — keyword search on activity feed.
14. **F2.11 Receipt collections / tagging**.
15. **F2.9 Receipt drag-to-share**.
16. **F1.6 Cmd+K command palette**.
17. **F1.7 Dark / light mode toggle**.
18. **§13 / §31 D2 mobile-first audit** — F8.9 + §27.2 mobile responsive pass.

**Done when:**
- Every existing payment flow on devnet emits all four hashes via the kernel; `verifyReceipt()` returns OK with all 4 green checks for any payment kind.
- A new user opens the app, hits "Connect," gets through onboarding in 60s, and within 3 minutes has experienced *at least three "this is different" moments* (kill chain, receipt-as-story, refund-by-emoji are the strongest candidates).
- All 14 disciplines (D1–D14) audit-pass on every Phase 1 screen.

### Phase 2: Protocol moats (4-8 weeks)

**Goal:** turn Settle from "an app" into "infrastructure." This is the move that creates a moat no incumbent can ship around.

**Builds:**

- F5.5 `<settle-verify>` web component
- F5.4 `<settle-pay>` web component
- F5.11 Receipt importer for non-Settle Solana payments (Solana Pay + Helio)
- F9.1 Verifiable build deploy
- F9.2 Capability hash registry as contributable repo (first 50 hashes)
- F5.7 MCP middleware adapter
- F5.6 Stripe-vocabulary webhooks
- F5.9 Idempotency keys
- F9.4 Public stats / transparency reports

**Done when:** Three independent Solana apps have embedded `<settle-verify>` on their site. The capability registry has 50 first-class entries. The verifiable-build badge is live on the homepage.

### Phase 3: Business surface (8-12 weeks)

**Goal:** make Settle Business shippable as a real product for paying merchants.

**Builds:**

- F4.1 Merchant onboarding CLI
- F4.2 Merchant profile page
- F4.3 Subscription / recurring receivables UI
- F4.4 Merchant analytics dashboard
- F4.5 Refund-from-merchant-side
- F4.6 Dispute resolution flow
- F3.4 Capability registry with human aliases (full surface)
- F5.10 Public API + GraphQL
- F5.2/5.3 Python + Rust SDKs
- F5.8 Agent framework adapters (LangChain, CrewAI, OpenAI Agents, Anthropic)
- F5.12 Vercel + Replit + Cursor templates

**Done when:** 10 paying merchants on devnet. SDK in 3 languages. 5+ adapter integrations.

### Phase 4: Treasury / org (4-8 weeks)

**Goal:** B2B revenue. Brex / Mercury parallel.

**Builds:**

- F6.1 Squads-native AgentCards
- F6.2 Per-employee cards with cost-center tagging
- F6.3 Approval workflows
- F6.4 Compliance exports (Schedule C / VAT / GST)
- F2.12 Compliance-grade receipt export

**Done when:** 5 orgs (DAOs, startups) using Settle for their treasury.

### Phase 5: Consumer breadth (4-8 weeks)

**Goal:** mass-market consumer surfaces.

**Builds:**

- F7.3 Schedule a payment
- F7.4 Recurring payment / salary mode (UX polish)
- F7.5 Save for X
- F7.6 Round-up savings
- F7.8 Group accounts (shared wallet)
- F7.9 Allowance mode
- F7.10 Send-as-gift
- F7.12 Pay-by-voice / NLP
- F8.11 i18n in 10+ languages

**Done when:** 10K consumers use Settle weekly.

### Phase 6: Protocol future (ongoing, 6+ months)

**Goal:** Settle as the canonical Solana payments protocol.

**Builds:**

- F6.5 Treasury yield-while-idle
- F9.3 Receipt federation
- F9.5 Settle Index (capability indices)
- F9.6 Open-source roadmap with voting
- F9.8 Receipt-based governance
- F9.9 Anonymous-but-verified mode (ZK)
- F9.10 Cross-chain receipt mirrors

**Done when:** Settle is the standard cited by every Solana payments paper.

## §17. The "deepen vs expand" decision rule

At any point during a phase, when deciding what to build next:

1. **Does the current phase have any incomplete must-have features?** If yes → finish them. Don't move on.
2. **Is the current phase's "Done when" criterion met?** If no → keep building this phase.
3. **Is there a feature in a later phase that radically deepens the current phase's wedge?** If yes → consider pulling it forward.
4. **Does building two adjacent features in two different phases save shared work?** If yes → ship both, count as cross-phase.

The rule is **deepen first, expand second**. Don't add a new layer until the current one is unmistakably finished.

---

# PART IV — GUARDRAILS

## §18. The code-heavy / money-light filter

For every feature proposal, ask:

| Question | If "yes," ship | If "no," defer |
|---|---|---|
| Can it be built mostly with code, open-source tools, free-tier infra? | Ship | Defer |
| Can devnet/localnet/mock simulation prove it works? | Ship | Defer |
| Does it require a banking partner, KYC vendor, audit firm, hardware? | Defer | Ship |

**Specifically defer:**
- Card issuing (needs BIN sponsor)
- ACH on/off-ramp (needs banking partner)
- KYC product flow (needs Sumsub / Persona contracts)
- SOC 2 (needs audit firm)
- 24/7 support (needs humans)
- Insurance (needs underwriting capital)

## §19. The testability filter

Every feature must be testable by:
- The founder, on devnet, in a browser
- A subagent, via E2E script
- An automated test, deterministically

**Defer features that require:**
- Physical Solana mobile devices
- Specific bank accounts
- Live-only-on-mainnet dependencies
- Real-world legal contracts

## §20. The Devnet-honesty filter

Every feature ships with explicit labels:

- ✅ **Devnet-real** — works end-to-end on devnet today
- ⏳ **Devnet-real after build** — will work on devnet after we build it
- 🟡 **Honestly simulated** — UI shows the flow, but the underlying integration is mocked (e.g., Jupiter swap on devnet shows quote-only)
- ❌ **Mainnet-only** — features that genuinely require mainnet (e.g., real Jupiter swap)

Never claim a feature is mainnet-ready if it's devnet-only. The PRODUCT_SPEC.md §8 table is the authoritative honesty surface.

## §21. The coherence filter

Every feature must answer:

1. **Spine:** does this deepen *programmable rules*, *verifiable receipts*, *trust-building reputation*, or *money movement*?
2. **Layer:** which of the 9 layers does this belong to?
3. **User type:** who from §4 uses this?

If any of those is "I don't know" or "kind of all of them," it's a wrong-shaped feature. Reject and reshape.

## §22. What we deliberately do not do

Settle is not:

- A general-purpose AMM (Jupiter, Orca won)
- A liquid staking protocol (Marinade, Jito won)
- A DEX aggregator (Jupiter)
- A creator commerce platform (Whop, Patreon — we integrate, not replace)
- An NFT marketplace (Magic Eden, Tensor)
- A general-purpose multisig (Squads — we integrate, not replace)
- A bridging protocol (Wormhole, deBridge)
- An L2 (Solana doesn't need one)
- A privacy coin (Wakanda)
- A perp DEX (Drift, Kamino)
- A blockchain (it runs on Solana)

This list is non-negotiable. When asked "do you also do X?", the answer is "no, X is what others use Settle to build."

---

# PART V — WIN NARRATIVE

## §23. The startup story

When someone asks "what is Settle":

> *"Stripe records payments in a database. We commit them to Solana. Every receipt is a four-hash cryptographic proof you can verify on your phone with no internet connection to our servers. Humans pay humans. Agents pay APIs. Merchants serve both. Money moves in 0.4 seconds and proves itself forever. We're the PayFi rail for the agent economy on Solana."*

Three sentences for VCs. One sentence for users. One phrase for the agent crowd.

## §24. The "why now" answer

- **AI agents need bounded credentials.** Existing API keys are catastrophic on leak. Pact-as-API-key fixes this. The agent economy is exploding. Without bounded credentials, every leak is an existential incident.
- **Solana sub-second confirm makes time a unit.** Streaming salaries / per-second pricing weren't possible before. They are now.
- **Light Protocol ZK Compression makes per-receipt cost ~$0.001.** Receipts at scale are now economical. A million-receipt year costs ~$1,000.
- **Stablecoin volume on Solana surpassed $200B/month.** The rail is real. The receipts are missing.
- **MPL Core PermanentFreezeDelegate just shipped.** Reputation primitives that *can't be sold* didn't exist on Solana before. Now they do.

## §25. The "why us" answer

- **We shipped the wedge before raising.** The four-hash chain, three-pact-modes-on-one-vault, MPL Core soulbound badges, ZK-compressed receipt mirrors — all live on devnet during a hackathon.
- **Open-source program with verifiable build.** Anyone can audit. Credible neutrality.
- **Three-language SDK roadmap.** Multi-language reach from day one.
- **Capability registry as a public good.** Settle owns the schema, not because we hoard it but because we curate it.
- **Code-heavy / money-light strategy.** We build everything that doesn't cost money, in parallel, indefinitely. The over-buildness is the moat.

## §26. How Settle survives narrative cycles

The wedge — verifiable money — is independent of:

- Whether AI agents are hot this quarter (they're a *user type*; verifiable money serves them + others)
- Whether DeFi is in or out of favor (Settle is consumer + business + agents — orthogonal to TVL)
- Whether Solana itself is hyped or quiet (we'd port to any L1 with sub-second finality if needed)
- Whether stablecoins hit a regulatory bump (we settle in whatever's stable; today USDC, tomorrow whatever's the leader)

Crypto narratives shift every 18 months. Verifiable money is forever. Build the primitive, not the narrative.

---

# PART VI — GAP-FILL: cross-cutting disciplines, depth additions, novel primitives

> *Why this part exists.* Parts I–V defined the wedge, the layers, the user types, the principles, ~80 features, the build sequence, and the win narrative. After re-auditing against the full master intent prompt, ten gaps became visible — most of them *cross-cutting disciplines* that don't fit cleanly inside a single layer. Part VI captures them. Read this *with* Parts I–V; nothing here replaces those, it deepens them.
>
> Sections in Part VI follow the same authority as Parts I–V. When a feature in Part II conflicts with a discipline in Part VI, the discipline wins.

## §27. Phantom integration depth (cross-Layer, primarily 1 + 8)

**Why a dedicated section.** The master intent says explicitly: *"I do not want Phantom flows to feel secondary."* Phantom is the dominant Solana wallet (>3M MAU). Settle's mobile reach lives or dies on Phantom integration quality. Treating it as one CSS line in F8.9 was a miss.

### F27.1 — Phantom in-app browser optimization
**What.** When settle.so opens inside Phantom's in-app browser, no "connect wallet" popup, instant signing, native-feeling.
**Who.** Mobile-Phantom users (the majority of Solana mobile users).
**Why care.** Web3 users live inside Phantom mobile. Forcing them to context-switch out kills retention.
**Why startup.** Apps that feel native inside Phantom feel like Phantom-blessed software.
**UI.** Detect `window.phantom` injected provider → skip wallet-modal, auto-connect.
**Flow.** Open settle.so URL inside Phantom mobile → immediately authenticated → signing prompts pop up natively in Phantom's UI.
**Data model.** None new.
**On-chain piece.** None.
**Devnet status.** Real after build (1 week).
**Test plan.** Open in Phantom mobile in-app browser → no connect step → sign payment.
**Failure modes.** Phantom upgrade breaks injection. Mitigation: feature-detection, graceful fallback.
**Polish details.** Subtle "Connected via Phantom" badge in header. No noise; just confidence.

### F27.2 — Mobile-first responsive design (Phantom mobile in-app browser tested)
**What.** Every screen designed and tested on iPhone SE (375×667) up, with Phantom mobile's in-app browser as the primary target.
**Who.** Mobile users.
**Why care.** Mobile is where Phantom users actually pay.
**Why startup.** Desktop-first apps feel like 2010.
**UI.** Touch targets ≥44pt. Forms reflow to single column. Tab bar fixed at bottom on mobile (thumb-zone).
**Flow.** Same flows as desktop, single-column layout, finger-friendly.
**Data model.** None.
**On-chain piece.** None.
**Devnet status.** Partial now (Tailwind responsive utilities present); systematic mobile audit pending.
**Test plan.** Each screen renders correctly on iPhone SE, Pixel 5, iPhone 14 Pro Max, iPad. Phantom mobile in-app browser tested specifically.
**Failure modes.** Modal sizing, sticky headers, virtual keyboard pushing content. Mitigation: explicit testing on iOS Safari + Chrome Android + Phantom in-app.
**Polish details.** Pull-to-refresh on activity feed (native gesture). Swipe-to-go-back on iOS.

### F27.3 — Phantom deep-link `solana:` URL schemes
**What.** Every payable action surface generates a `solana:`-scheme URL that opens Phantom natively from any context (SMS, email, Telegram, Twitter).
**Who.** Anyone receiving a Settle link outside the app.
**Why care.** One-tap from anywhere → Phantom → Settle → done.
**Why startup.** Solana Pay native UX requires this.
**UI.** Share buttons everywhere generate `solana:` URLs alongside the regular `https://`.
**Flow.** User taps a `solana:` link in any app → OS opens Phantom → Phantom signs → returns.
**Data model.** None.
**On-chain piece.** Solana Pay transfer-request format.
**Devnet status.** Partial now (Solana Pay URLs work; full deep-link audit pending).
**Test plan.** Tap a generated link from SMS, email, Telegram, X → Phantom opens, signs.
**Failure modes.** OS doesn't have a registered handler. Mitigation: fallback `https://` link with QR.
**Polish details.** Each share surface offers all three: copy URL, copy `solana:` URL, generate QR.

### F27.4 — Phantom App Store / Featured submission
**What.** Submit Settle to Phantom's discoverable "App Store" / Featured list.
**Who.** Phantom users browsing for apps.
**Why care.** Free distribution from Phantom's discovery surface (3M+ users).
**Why startup.** Featured = automatic credibility.
**UI.** Phantom's app browser shows Settle in their featured/payments category.
**Flow.** Submit via Phantom's submission process → review → listing.
**Data model.** None Settle-side.
**On-chain piece.** None.
**Devnet status.** Mainnet-only (Phantom's app store is mainnet by default).
**Test plan.** Listing visible in Phantom mobile.
**Failure modes.** Submission rejected. Mitigation: meet all listed criteria + screenshots + demo video.
**Polish details.** App icon designed for the listing tile. Description tuned for Phantom's audience.

### F27.5 — Phantom contact integration (handle resolution)
**What.** Phantom's contact list resolves Settle handles (`@pratiik`) → addresses automatically when the user types in Phantom's send field.
**Who.** Phantom users sending USDC to Settle handles.
**Why care.** Cross-app handle portability. Not just Settle's own send.
**Why startup.** Distribution via the dominant wallet's UX.
**UI.** Settle handles work as recipients in Phantom directly.
**Flow.** User types `@pratiik` in Phantom send → Phantom queries Settle's resolver → returns address → fills.
**Data model.** Public resolver endpoint at `/api/resolve/[handle]`.
**On-chain piece.** None.
**Devnet status.** Real after build (depends on Phantom team accepting an integration; alternatively expose a service Phantom CAN consume).
**Test plan.** Phantom send → typing handle resolves to address.
**Failure modes.** Phantom doesn't accept third-party resolvers. Mitigation: Bonfida SNS integration as fallback (already shipped).
**Polish details.** Resolver caches with reasonable TTL. Returns avatar + display name too.

### F27.6 — Touch-ID / Face-ID biometric prompt on every sign (Phantom-side)
**What.** On every payment, Phantom prompts for biometric auth before signing. Settle does nothing here — but our UX assumes this is happening + provides clear "approve in Phantom" copy.
**Who.** Mobile users.
**Why care.** Sense of security visible.
**Why startup.** UX feels like Apple Pay.
**UI.** When awaiting Phantom signature: copy says "Approve with Face ID in Phantom." Trust gesture animation pauses on the right state.
**Flow.** Send → wait for Phantom prompt → user biometrics → tx returns to Settle.
**Data model.** None.
**On-chain piece.** None Settle-side.
**Devnet status.** ✅ SHIPPED — Phantom handles biometric natively; we provide explicit "Approve in Phantom" copy. Polish pass on copy lives in Phase 1.
**Test plan.** Phantom mobile send flow.
**Failure modes.** None Settle-side.
**Polish details.** Subtle haptic + visual cue when Settle detects Phantom is awaiting user.

### F27.7 — Phantom-native QR payment
**What.** A settle.so QR opens directly inside Phantom mobile when scanned, with the payment pre-filled.
**Who.** Anyone receiving a QR via paper, screen, AirDrop.
**Why care.** Physical-world payments.
**Why startup.** Solana Pay's full vision.
**UI.** Every Settle payment URL has a QR variant. Receiver shows QR. Sender scans with Phantom's QR scanner.
**Flow.** Scan QR → Phantom opens transaction-request → user reviews → signs.
**Data model.** None.
**On-chain piece.** Solana Pay transaction-request URL.
**Devnet status.** ✅ SHIPPED — Solana Pay transaction-request URL works in Phantom mobile QR scanner.
**Test plan.** Generate QR → scan with Phantom mobile → payment confirms.
**Failure modes.** QR illegible at distance. Mitigation: error correction + size minimum.
**Polish details.** QR codes have brand color overlay. Embed Settle logo in center.

### F27.8 — Phantom transaction preview clarity
**What.** When Phantom previews a Settle tx for signature, the preview reads like English ("Spend $5 from your translation budget to translate.com") not like a tx dump.
**Who.** Anyone signing.
**Why care.** Phantom's tx preview is the trust moment. If it's gibberish, users abandon.
**Why startup.** Wallet UX clarity is part of our brand even though it's their UI.
**UI.** Phantom shows the simulated outcome clearly.
**Flow.** Settle builds tx with proper memo + inscribed metadata that Phantom's simulator can read.
**Data model.** None.
**On-chain piece.** Memo program for human-readable annotations.
**Devnet status.** Real after build (1 week — annotation pass on every ix builder).
**Test plan.** Build any tx → Phantom preview shows English description.
**Failure modes.** Phantom's simulator format changes. Mitigation: monitor Phantom releases.
**Polish details.** Memo text is the same plain-English copy we use elsewhere ("Pay @zoro $5 for pizza").

### F27.9 — One-handed mobile flows
**What.** Every primary action (send, sign, refund) reachable with one thumb on a phone.
**Who.** Mobile users.
**Why care.** Real-world phone use.
**Why startup.** Modern mobile design.
**UI.** Primary actions in bottom-third of screen. Tab bar bottom. Modal close buttons reachable.
**Flow.** Hold phone in one hand, complete payment without re-grip.
**Data model.** None.
**On-chain piece.** None.
**Devnet status.** Real after build (mobile audit pass; 1 week).
**Test plan.** Complete each primary flow with one thumb on iPhone SE.
**Failure modes.** Action buttons in top of screen. Mitigation: design audit.
**Polish details.** Bottom-sheet modals slide up (iOS native), not fade-in.

### F27.10 — Native iOS/Android share-sheet integration
**What.** Sharing a receipt URL invokes the OS share sheet → user picks Phantom / Telegram / X / Mail / Messages.
**Who.** Anyone sharing.
**Why care.** Native distribution.
**Why startup.** Polish.
**UI.** "Share" button → OS share sheet appears.
**Flow.** Tap share → sheet → pick app.
**Data model.** None.
**On-chain piece.** None.
**Devnet status.** Real after build (Web Share API; 2 days).
**Test plan.** Tap share on receipt → sheet appears with all installed apps.
**Failure modes.** Web Share API unsupported. Mitigation: fallback to copy-to-clipboard.
**Polish details.** Custom OG image renders in share preview.

---

## §28. Privacy as a coherent surface (cross-Layer 2 + 3 + 9)

**Why a dedicated section.** The master intent lists "privacy" as a top-level desire alongside trust and reputation. Treating it as one F2.4 voice-note feature was a miss. Privacy is *its own surface* — designed, opt-in, beautiful, Solana-native.

### Privacy product principle (revision to §3)

> *Privacy is opt-in, not opt-out. Default visibility is private; users explicitly choose what they make public. The product never shames either choice.*

### F28.1 — Default visibility is private
**What.** New AgentCards, Pacts, and receipts all default to `public_feed=false`. Users explicitly opt in to public.
**Who.** All users.
**Why care.** Most consumers and merchants don't want their spend on a leaderboard by default.
**Why startup.** Defaults define the brand. "Private by default" = Telegram-grade trust.
**UI.** Settings → Privacy section explicitly explains the default. When toggling public, a 1-line consequence statement appears.
**Flow.** User has to *intentionally* make something public. Toggle is on the create flow + reversible later (with a one-tap "make this private again" action).
**Data model.** `agent_cards.public_feed_default = false` migration.
**On-chain piece.** Per-receipt `public_feed` flag (already in spec).
**Devnet status.** 🟡 PARTIAL — `public_feed` flag already on chain; default-flip migration + UI copy update are ⏳ PLANNED for Phase 1.
**Test plan.** New card default → all child receipts private. Toggle public → public_feed flips.
**Failure modes.** None.
**Polish details.** Privacy toggle uses a "lock" → "globe" icon transition.

### F28.2 — Sealed-box receipt context (already F2.4, deeper polish)
**What.** Receipt purpose text + voice notes are sealed-box encrypted to the recipient's pubkey.
**Who.** Both senders and recipients.
**Why care.** What you said about a payment shouldn't be world-readable.
**Why startup.** Telegram-grade privacy + Solana-native.
**UI.** Receipt page shows a "🔒 Encrypted to recipient" badge.
**Flow.** Already shipped F2.4.
**Data model.** Already shipped.
**On-chain piece.** None.
**Devnet status.** ✅ SHIPPED — cross-ref F2.4 voice notes; encrypted at rest, sealed to recipient pubkey.
**Test plan.** Already passing.
**Failure modes.** Already documented.
**Polish details.** Add "Only @recipient can decrypt this" tooltip on the lock badge.

### F28.3 — Token-2022 confidential transfers (post-mainnet-only)
**What.** Optional opt-in: payment amounts hidden via Token-2022 confidential transfers.
**Who.** Privacy-conscious senders, B2B payments where invoice amounts shouldn't be public.
**Why care.** Even on mainnet, USDC volumes are world-readable. Confidential transfers fix that.
**Why startup.** Forward-looking primitive. Lily Liu / Multicoin notice this.
**UI.** /send → "Hide amount" toggle (only available when sender + recipient are using confidential ATAs).
**Flow.** Sender enables → tx uses Token-2022 confidential transfer ix → on-chain shows "tx happened" but not the amount → recipient sees the amount in their wallet only.
**Data model.** `agent_cards.is_confidential` flag.
**On-chain piece.** Token-2022 confidential transfer extensions.
**Devnet status.** ❌ **Mainnet-only** (Token-2022 confidential extensions are not yet available on devnet for the USDC mint we use). Honest label.
**Test plan.** Mainnet only. UI shows "Available on mainnet" disabled toggle on devnet.
**Failure modes.** Token-2022 extensions evolve. Mitigation: track Solana Foundation announcements.
**Polish details.** Setting it has a one-time educational modal: "Confidential transfers hide the amount. The receipt and parties are still verifiable."

### F28.4 — Private leaderboards (ZK-aggregated)
**What.** Prove "this merchant is in the top 10%" without revealing the exact rank or volume.
**Who.** Privacy-respecting merchants who want reputation but not granular volume disclosure.
**Why care.** Merchants want recognition without revealing competitive intelligence.
**Why startup.** ZK-aggregation as a primitive.
**UI.** Merchant profile shows "Top 10% in translation" badge instead of "$X lifetime volume."
**Flow.** Server computes ranks → ZK prover compresses into membership proofs → merchant displays the proof, not the raw data.
**Data model.** `private_leaderboard_proofs` table.
**On-chain piece.** Optional: proof commitment on chain.
**Devnet status.** Real after build (research project; 6-8 weeks).
**Test plan.** Generate proof → verify → reveals only "top 10%" not exact rank.
**Failure modes.** ZK circuit complexity. Mitigation: well-tested library (Light Protocol's circuits, RiscZero, SP1).
**Polish details.** Tier badges (top 1% / 10% / 25% / 50%) with distinct colors.

### F28.5 — Anonymous-but-verified mode
**What.** Prove "I have >50 ALLOW receipts and 0 disputes" without revealing pubkey.
**Who.** Whistleblowers, privacy-respecting marketplace bidders, anonymous voters.
**Why care.** Reputation without identity.
**Why startup.** Genuinely novel primitive. Few products offer this.
**UI.** Profile → "Generate anonymous proof" button → outputs a shareable proof string.
**Flow.** ZK prover takes user's receipt history → outputs a proof of "meets threshold" → user shares proof, identity stays hidden.
**Data model.** None on app side; pure ZK.
**On-chain piece.** Public verifier circuit.
**Devnet status.** Real after build (research; 8-12 weeks).
**Test plan.** Generate proof → verify → no identity leak.
**Failure modes.** ZK library maturity. Mitigation: pin to a maintained library; document scope.
**Polish details.** Use cases page documenting whistleblowing, voting, marketplace bidding.

### F28.6 — Confidential streaming pacts
**What.** Salary streams where the rate is private. The recipient gets paid; the rate is hidden from the public.
**Who.** B2B contractors, agencies with NDAs.
**Why care.** Real B2B use case.
**Why startup.** Genuinely novel.
**UI.** Streaming pact page → "Hide rate" toggle (mainnet only with Token-2022 confidential).
**Flow.** Combines F28.3 (confidential transfer) with streaming pact ix.
**Data model.** `pacts.is_confidential` flag.
**On-chain piece.** Streaming pact + Token-2022 confidential extension.
**Devnet status.** Mainnet-only (depends on F28.3).
**Test plan.** Mainnet test on a private rate.
**Failure modes.** Same as F28.3.
**Polish details.** Public view shows "Streaming • rate private" instead of dollar amount.

### F28.7 — Selective disclosure on receipts
**What.** Receipt holder can prove specific properties to specific parties without revealing the rest.
**Who.** Anyone responding to an audit, dispute, tax inquiry, KYC review.
**Why care.** "Prove I paid > $X to charity for tax deduction" without revealing all other spending.
**Why startup.** Real audit-response use case.
**UI.** Receipt → "Generate selective proof" → pick fields to reveal → outputs a proof URL.
**Flow.** ZK selective disclosure proof generated; auditor gets a URL that proves only the selected fields.
**Data model.** `selective_disclosure_proofs` table.
**On-chain piece.** Verifier (could be off-chain).
**Devnet status.** Real after build (research; 6-8 weeks).
**Test plan.** Prove "I paid more than $1000 in 2026" without revealing per-receipt amounts.
**Failure modes.** Specific field schemas need definition. Mitigation: standard schema + extensions.
**Polish details.** Each generated proof has its own URL for the auditor; expires after 72h.

---

## §29. The AI assistant cross-cutting layer (touches Layers 2, 3, 4, 7)

**Why a dedicated section.** Master intent says: *"every complex screen should have a plain-English explanation"* + the product should be deeply usable. This is more than the F2.3 receipt narration. It's an AI layer woven through the product.

### Assistant architecture principle

> *AI assistance is server-side, optional, falls back gracefully. Every AI feature has a non-AI fallback path so the product never breaks (or breaks the bank) if AI is unavailable.*

### Cost discipline (CRITICAL — money is the only blocker)

The user is on a code-only budget. Every AI feature in §29 and §35 must respect this hierarchy:

1. **Free tier first.** NVIDIA NIM (Kimi K2 instruct) is the primary — already in env (`NVIDIA_API_KEY`), generous free tier. Use it as default for narration, query, anomaly detection, explainer text.
2. **Local / open-source second.** For batch jobs (auto-tagging, embeddings, monthly recap), prefer local models via Ollama (Llama 3, Mistral, Phi). Pre-compute, store, never re-fetch. No per-call API cost.
3. **Aggressive caching always.** Every LLM output cached to Postgres at insert time. Receipt narration: `receipts.narration_text` filled once, served from DB on every subsequent view. Embeddings: `receipts.embedding` filled once, never recomputed.
4. **Paid tier (Claude / OpenAI) only as fallback.** If NVIDIA NIM is down or rate-limited, fall back to a paid API. Never primary; never for batch jobs.
5. **Hard quota per feature.** Each AI feature has a daily token budget (configurable). When budget exceeded, fall back to non-AI path silently. The product never crashes because of a quota; it just gets less smart for the rest of the day.
6. **No always-on AI.** Features that *could* run on every receipt (anomaly detection, auto-tagging) run on a sample (e.g., every 10th receipt) until traffic justifies more. We earn the LLM spend with usage, not pay for it speculatively.

**Budget guard in code:** every `/api/*` endpoint that calls an LLM checks a token-counter (Upstash Redis or Postgres-backed) and returns the non-AI fallback if the daily budget is exhausted. Logs the budget hit; never throws to the user.

**Honest devnet status on every AI feature:** because of the hierarchy above, AI features ship `🟡 PARTIAL` until the cache + fallback path are both proven. "AI works on first call" is not enough; "AI works at scale within budget" is the bar.

### F29.1 — Receipt-as-story narration (already F2.3, integrated here)
Already specified.

### F29.2 — AI receipt query
**What.** Search receipts in natural language: "show me all my translation expenses last month."
**Who.** Power users + accountants.
**Why care.** Natural search → faster bookkeeping.
**Why startup.** ChatGPT-grade query over financial history.
**UI.** Activity page → search bar accepts natural language.
**Flow.** User types → backend builds SQL via LLM (constrained schema) → query runs → results render.
**Data model.** Reads receipts.
**On-chain piece.** None.
**Devnet status.** Real after build (1-2 weeks).
**Test plan.** "translation expenses last month" → returns translation-capability receipts from previous month.
**Failure modes.** LLM hallucinates SQL. Mitigation: strict schema + parameterized queries only; reject if generated SQL touches outside whitelist.
**Polish details.** Loading state shows the AI's thinking ("Filtering by capability... by date range..."). Failed queries fall back to keyword search.

### F29.3 — AI bookkeeper (monthly recap + categorization)
**What.** Auto-categorizes receipts, drafts monthly recaps, flags anomalies, suggests budgets.
**Who.** Freelancers, small businesses, anyone managing personal finance.
**Why care.** Mint/YNAB equivalent on Solana.
**Why startup.** Real B2C feature.
**UI.** Settings → AI bookkeeper toggle. Dashboard widget shows current month's auto-recap.
**Flow.** Monthly cron summarizes, categorizes, flags. User reviews + accepts/edits.
**Data model.** `ai_recaps` table per user per month.
**On-chain piece.** None.
**Devnet status.** Real after build (3-4 weeks).
**Test plan.** End of month → recap appears with reasonable categories.
**Failure modes.** Wrong category. Mitigation: every recap is editable; learns from corrections.
**Polish details.** Recap is voice-readable (TTS); user can listen during commute.

### F29.4 — AI fraud / anomaly detection
**What.** Flags unusual spends in real time. "This merchant suddenly raised price 5x — confirm?"
**Who.** All users.
**Why care.** Catches problems early.
**Why startup.** Stripe Radar parallel.
**UI.** On any unusual receipt, an inline "⚠ Unusual" tag + reason. Dashboard widget shows alerts.
**Flow.** Backend models running on receipt insert → if anomalous, flag + notify.
**Data model.** `receipt_anomaly_flags` table.
**On-chain piece.** None.
**Devnet status.** Real after build (2-3 weeks).
**Test plan.** Synthetic anomalous receipt → flagged.
**Failure modes.** False positives. Mitigation: user can dismiss + we learn.
**Polish details.** Push notification only for severity ≥ medium.

### F29.5 — AI explainer button on every screen
**What.** A small ✨ icon top-right of every complex screen → modal opens with plain-English summary of what the user is looking at.
**Who.** First-time users + anyone overwhelmed.
**Why care.** Reduces cognitive load.
**Why startup.** Onboarding without modal-spam.
**UI.** ✨ icon → modal with auto-generated explanation specific to current page state.
**Flow.** Click → backend reads page state (route, user data, recent actions) → LLM generates 3-sentence summary → renders.
**Data model.** None.
**On-chain piece.** None.
**Devnet status.** Real after build (2-3 weeks; needs page-state extraction per route).
**Test plan.** Visit each major page → ✨ → meaningful summary appears.
**Failure modes.** LLM down. Mitigation: per-page hardcoded fallback summaries.
**Polish details.** Explainer modal can be voice-readable.

### F29.6 — AI rule generator (plain-English → on-chain rules)
**What.** "Set up a research-agent budget for me" → AI drafts plain-English rules → user confirms → on-chain.
**Who.** Non-technical AgentCard creators.
**Why care.** Makes programmable money creatable by anyone.
**Why startup.** Disambiguates "programmable" from "requires you to learn JSON."
**UI.** /agents/new → "Use AI" toggle → user types intent → AI drafts rules → user confirms → tx.
**Flow.** User: "I want my agent to research papers and pay for them, max $5 per paper, $20 total budget, for 1 week." → AI: "Daily cap $20, per-call $5, allowlist arxiv.org + sci-hub, expiry 1 week." → user confirms → tx.
**Data model.** None new.
**On-chain piece.** Existing `create_card` + `open_pact` with AI-drafted parameters.
**Devnet status.** Real after build (1-2 weeks).
**Test plan.** Test phrases → reasonable rules → tx executes correctly.
**Failure modes.** LLM hallucinates. Mitigation: every rule shown with its plain-English explanation BEFORE signing; user can edit.
**Polish details.** AI shows reasoning ("Allowlisting arxiv.org because you mentioned papers...").

### F29.7 — AI dispute drafter
**What.** Recipient about to dispute → AI helps draft the dispute reason.
**Who.** Disputers.
**Why care.** Better-stated disputes resolve faster.
**Why startup.** Quality of dispute language matters.
**UI.** Refund modal → "Help me write this" button → AI suggests language based on receipt context.
**Flow.** User clicks → AI reads receipt + current draft → suggests improved language.
**Data model.** None.
**On-chain piece.** None.
**Devnet status.** Real after build (3-5 days).
**Test plan.** Dispute test scenario → AI suggestion is reasonable.
**Failure modes.** AI produces aggressive language. Mitigation: prompt explicitly constrains tone.
**Polish details.** User can accept, edit, or reject AI suggestion.

### F29.8 — AI capability discovery (already F3.11, deeper here)
Already specified. Cross-references this section.

### F29.9 — AI agent-to-agent negotiation (cross-app primitive)
**What.** Two agents negotiate price + capability + duration. Settle as the rail.
**Who.** AI agents on both sides of a transaction.
**Why care.** Programmatic negotiation is the agent-economy unlock.
**Why startup.** Genuinely novel primitive.
**UI.** Agent profile → "Negotiate with this agent" CTA (for buyers' agents).
**Flow.** Buyer's agent + seller's agent exchange offers via Settle's relay → consensus → tx.
**Data model.** `negotiations` table.
**On-chain piece.** Once consensus, ix builds + signs.
**Devnet status.** Real after build (research project; 4-6 weeks).
**Test plan.** Two test agents negotiate → settle.
**Failure modes.** No consensus. Mitigation: timeout → user fallback.
**Polish details.** Negotiation visible as a thread in user's inbox.

### F29.10 — AI receipt voiceover (TTS narration)
**What.** Each receipt has a 5-second auto-narrated audio explanation.
**Who.** Accessibility users + commuters.
**Why care.** Audio-channel access.
**Why startup.** Inclusive design.
**UI.** Receipt page → speaker icon → plays narration.
**Flow.** Use F2.3 narration text → run through TTS (browser native or server) → play.
**Data model.** Optional cache of audio file.
**On-chain piece.** None.
**Devnet status.** Real after build (1 week).
**Test plan.** Click speaker → narration plays.
**Failure modes.** TTS engine quality. Mitigation: try browser native first, fallback to server.
**Polish details.** Voice character is calm, clear, brand-aligned.

---

## §30. The 9 emotional moments — design checklist

**Why a dedicated section.** Master intent explicitly named these nine moments and how they should *feel*. Each must be a designed experience, not a hope.

For each: what the user does, what should happen, what visual + motion + sound + copy delivers the feeling.

### M1. Creating a Pact = "I just made a programmable money agreement"
- **Action:** /agents/new → fill rules → confirm.
- **Should feel:** Powerful. Considered. Like signing a real document.
- **Visual:** Rules render as a paragraph in serif font: "This agent can spend up to $50/day, max $5/call, only with translate.com and arxiv.org, until June 5." Highlight key numbers. Show a wax-seal animation on confirm.
- **Motion:** When the user signs, the paragraph compresses into a small icon and slides into the user's "Active Pacts" list with a soft drop.
- **Sound:** A discreet "ka-thud" of a stamp (optional).
- **Copy:** "Your agent now has bounded authority. Revoke anytime."

### M2. Funding an AgentCard = "Safe and powerful, not scary"
- **Action:** /cards/[id]/fund → enter amount → sign.
- **Should feel:** Like depositing into a labeled vault, not throwing money into a black hole.
- **Visual:** Money visually slides from the user's main balance into the card's vault graphic. The rules appear *around* the vault as a defense ring.
- **Motion:** 600ms slide-and-settle animation. Rules ring pulses once, confirming protection.
- **Sound:** Coin-drop (optional).
- **Copy:** "$X funded. Protected by [list of rules]. The agent can never spend outside these rules."

### M3. Payment confirmation = "Instant and satisfying"
- **Action:** /send → confirm → wait.
- **Should feel:** Like you blinked and it was done.
- **Visual:** 4-state strip (idle → signing → confirming → success). Time elapsed shown in milliseconds. On success, full-screen subtle flash.
- **Motion:** Spring animation on the success checkmark. Confetti tier scales with amount.
- **Sound:** Sub-400ms "pop" (optional).
- **Copy:** "Confirmed in 0.42s." (Concrete, not vague.)

### M4. Receipt = "Permanent proof, not a database row"
- **Action:** Open /receipts/[id].
- **Should feel:** Like holding a notarized document.
- **Visual:** Hash-chain animation plays on first view (4 chain links connecting). Receipt-as-story narration in serif at the top. Each hash row has a "verify in your browser" button that recomputes live and lights up green.
- **Motion:** Chain animation plays once per session, settles static.
- **Sound:** Faint metallic "click" when each hash verifies (optional).
- **Copy:** "Verified by your browser. Anyone can check this. Forever."

### M5. Revoking an agent = "Decisive and protective"
- **Action:** /cards/[id] → revoke.
- **Should feel:** Like flipping a kill switch. Final.
- **Visual:** Confirmation modal with slide-to-confirm (not just a button). On confirm, all child Pacts visually freeze with a frost shader → ice particle shatter → tiles fade to grayscale.
- **Motion:** Slide-to-confirm = 600ms. Frost = 800ms. Shatter = 600ms. Total ~3s.
- **Sound:** Single deep "whoom" + ice crackle (~1s, optional).
- **Copy:** "Revoked. All future spends will reject."

### M6. Trust score = "Earned, not decorative"
- **Action:** Visit any agent profile.
- **Should feel:** Like seeing a credit score that you actually trust.
- **Visual:** Big number (out of 100). Below it: a *formula breakdown* — "100 receipts × 95% allow × 0.3 dispute factor = 28.5." Hovering shows the inputs.
- **Motion:** Number animates up to its value on first view (600ms count-up).
- **Sound:** None.
- **Copy:** "Computed from on-chain activity. Updates every 5 min."

### M7. Merchant page = "A financial storefront"
- **Action:** Visit /m/[merchant].
- **Should feel:** Like a Stripe-grade product page. Confident, clean, transparent.
- **Visual:** Hero with merchant logo + tagline. Capabilities grid (cards with prices + latency stats). Real-time activity feed in a sidebar. Reputation badges across the top.
- **Motion:** Activity feed pulses on new receipts. Smooth scroll on mobile.
- **Sound:** None.
- **Copy:** "@merchant • $X total served • 99.8% uptime • avg latency 320ms."

### M8. Public proof page = "Verifiable identity"
- **Action:** Visit /at/[handle]/proof.
- **Should feel:** Like a portable bio that proves what it claims.
- **Visual:** Hero with handle + avatar + soulbound badges arrayed. Capability usage chart. Recent receipts. Reputation graph.
- **Motion:** Badges tilt slightly in 3D on hover. Charts animate on load.
- **Sound:** None.
- **Copy:** "Verified by Solana. Anyone can check the math."

### M9. Developer integration = "Simple and inevitable"
- **Action:** A dev reads /docs → integrates.
- **Should feel:** Like the path-of-least-resistance to monetize anything.
- **Visual:** /docs page opens with a 30-second video gif showing `npx create-settle-merchant` end-to-end. Code examples copy-on-click.
- **Motion:** None excessive; serious dev product feel.
- **Sound:** None.
- **Copy:** "Seven lines of code. Capability-priced USDC payments. Receipts that verify themselves."

---

## §31. Cross-cutting UX disciplines

These are *requirements applied to every screen*, not features. Auditors check each discipline against each screen during design review.

### D1. Stripe-DNA
Every payment surface borrows from Stripe's playbook:
- Single-column checkout
- Big "Pay $X" button with the amount baked in
- Receipt anatomy: title, amount, line items, signature panel, raw event JSON viewer
- Webhook event vocabulary: `receipt.allowed`, `pact.opened`, `pact.disputed`
- Idempotency keys on every payment endpoint
- Error messages reference the type ("Insufficient funds. You have $3.20; this needs $5.00.")
- Pricing transparency: every tx shows "Network fee: $0.0003 • Settle fee: $0.00" line.

### D2. Mobile-first, not mobile-last
Design every screen for iPhone SE first, scale up to desktop:
- Touch targets ≥44pt
- Forms in single column
- Primary actions in bottom-third
- Tab bar at bottom on mobile
- Native gestures (pull-to-refresh, swipe-to-back)
- Phantom in-app browser is the primary mobile target

### D3. Every screen has an obvious next action
A user must never wonder what to do next. Every screen has a primary CTA visible without scrolling. If state X has no obvious next action, the screen needs a redesign.

Empty states are not exceptions — they have an *especially obvious* CTA ("Send your first payment" not "No data").

### D4. Microcopy as a discipline
Every label, button, error message, modal, tooltip, empty state, and confirmation hand-edited for clarity:
- No jargon
- No "Are you sure?"
- No passive voice ("Click here to..." → "Send the payment")
- Verbs as buttons ("Send" not "Submit")
- Specific quantities ("$5.00" not "this amount")
- No "Coming soon" — either ship or don't show it

### D5. Visual hierarchy
On every screen:
- Primary action visually loudest (size, color, position)
- Secondary actions visible but quieter
- Tertiary actions in dropdowns, settings, kebab menus
- Information architecture: most-important top-left, least-important bottom-right (LTR languages)
- Whitespace as structure

### D6. Tooltips with intentional copy
- Every unclear element has a tooltip
- Tooltips don't repeat what's visible
- 200ms delay before showing
- 1-line max

### D7. "Feels alive"
- Sub-400ms confirm with multi-modal feedback
- Realtime updates (Supabase channels) on every page that benefits
- Live counters (capability heatmap, current slot, refund timer)
- Anticipation animations on hover (Framer Motion)
- Page transitions smooth (View Transitions API)
- States change visibly when they change

### D8. Reduced motion respect
Every animation can be disabled via `prefers-reduced-motion`. The product must work fully without motion.

### D9. Accessibility
- WCAG 2.1 AA compliance
- Full keyboard navigation
- Real ARIA labels (not just `aria-label="button"`)
- Screen-reader optimized (announce state changes)
- High-contrast mode option
- Right-to-left language support (Arabic, Hebrew)

### D10. Dark + light mode parity
Both modes get equal design love. No "dark is afterthought."

### D11. Every number on every dashboard has an action
A number that doesn't help the user decide what to do is decoration, not data. Master intent: *"I do not want dashboards that show numbers without helping the user act."*

For every number on every dashboard:
- Click it → drill into the underlying records
- Hover it → see what it's computed from
- If the number is anomalous → suggest a next step (refill the Pact, revoke the agent, contact the merchant)
- If the number is zero → suggest the action that would change it
- If the number changes → animate the change (count-up / count-down) so the change is felt

Banned: static "lifetime spend: $1,247" with no further interaction. That's a Stripe-2015 pattern, not a Settle-2026 pattern.

### D12. Solana-native imagination, not copycat fintech
We adapt patterns from Stripe, Brex, Mercury, etc. (per §32) — but every adaptation is *re-imagined for Solana's properties*. Master intent: *"I do not want generic fintech UI copied without Solana-native imagination."*

Concrete tests:
- A receipt isn't a PDF; it's a four-hash commit chain visualized as living chain links.
- A balance isn't a number; it's a slot-anchored counter that ticks per Solana slot when streaming.
- A subscription isn't a recurring DB row; it's a Streaming Pact with pause-on-blur and per-slot rate.
- A refund isn't a Stripe API call; it's an emoji that fires an on-chain dispute_delivery_escrow ix.
- A merchant page isn't a Stripe dashboard; it's a public capability page with verifiable latency stats.

If a feature design *could equally exist on Stripe + Postgres*, it has failed the Solana-native imagination test. Re-imagine.

### D13. The mantra
The product must make first-time users feel:

> **"This is not just another crypto app. This is a new financial layer."**

This is the single emotional success metric. If a first-time user finishes onboarding and feels "another wallet/payment app," we lost. If they feel they just touched a new financial layer, we won.

Every screen, every animation, every word of copy must defend this mantra.

### D14. The 8 thinking lenses (applied to every product decision)
Master intent: *"I want you to think like a founder, product strategist, UX designer, Solana protocol engineer, Web3 power user, judge, investor, and ruthless competitor at the same time."*

Every feature proposal is evaluated through all 8 lenses:

| Lens | The question |
|---|---|
| **Founder** | Does this make the company more valuable / defensible / fundable? |
| **Product strategist** | Does this fit the spine and deepen one of the 4 nouns (rules / receipts / reputation / money)? |
| **UX designer** | Does this make the product *feel* better — fast, polished, obvious? |
| **Solana protocol engineer** | Is this idiomatically Solana? Does it leverage what only Solana can do? |
| **Web3 power user** | Would I, as a daily Phantom + Solana Pay + cNFT user, actually use this? |
| **Judge** | Does this differentiate Settle from every other hackathon submission? |
| **Investor** | Does this point toward a real business model + TAM expansion? |
| **Ruthless competitor** | If I were trying to kill Settle, what would I attack? Does this feature defend that flank? |

If 3+ lenses say "weak," the feature is weak — even if 5 say "strong." We optimize for the *minimum* across all 8 lenses, not the maximum.

---

## §32. The product comparisons made explicit

Master intent named these explicitly: *"Stripe + Brex + Mercury + Linktree + Phantom + Splitwise + Patreon + Linear + agent-payment protocol."* Here's exactly what we steal from each.

### From Stripe
- Webhook event vocabulary
- Idempotency keys
- Receipt anatomy (title / amount / line items / sig panel / raw)
- Pricing transparency (no fee surprises)
- API-first dev culture
- "Seven lines of code" wedge framing
- Atlas-style compliance exports
- Dashboard polish

### From Brex
- Per-employee corporate cards
- Cost-center tagging
- Approval workflows
- Categorized spend
- Per-vendor allowlist auto-pay
- Integrations with accounting software (export only on Solana side)

### From Mercury
- Multi-account treasury (Pacts as sub-accounts)
- Scheduled sends
- Save-for-X goal vaults
- Yield-while-idle on idle balances
- Beautiful B2B dashboard
- Receipt PDFs that look like real bank statements

### From Linktree
- /at/[handle] is the Web3 link-in-bio. Profile + payments + earnings + badges in one URL.
- Custom domain support (post-Phase 4): `pay.theirsite.com` → their /at/ profile.
- OG image dynamically generated for share preview.

### From Phantom
- Wallet-native UX speed
- Mobile-first responsive
- In-app browser
- Deep-link `solana:` schemes
- Touch-ID/Face-ID-aware UX copy

### From Splitwise
- Ongoing running tab between friends (not just one-time split bill)
- Auto-net weekly: "@alice owes you $20, you owe @bob $30 — net @alice → @bob"
- Group balance visualization
- "Settle up" one-tap

### From Patreon
- Many-to-one creator subscription model
- Tier-based supporter levels (configurable)
- Public supporter list (opt-in)
- Recurring receivables (already covered as F4.3 + F7.4)

### From Linear
- Cmd+K command palette
- Keyboard shortcuts on every action
- Performant (sub-100ms route transitions)
- Opinionated default UX (less configuration, more polish)
- Issue-style timeline on receipts (forensic timeline already shipped)

### From an agent-payment protocol (no single competitor; the category)
- Capability hash registry
- Pact-as-API-key
- Bounded credentials with caps + allowlists + expiry
- Programmable spend rules enforced on-chain
- Receipt verification SDK

---

## §33. Novel financial primitives (deepening the wedge)

These are not features bolted on. They are new primitives that only Settle can ship because we own the on-chain custody architecture.

### F33.1 — Net settlement among friends
**What.** A owes B $20. B owes C $30. A owes C $10. → A pays C $30. All three balances zero.
**Who.** Friend groups, roommates, group expense participants.
**Why care.** Reduces gross transfer volume by 70%+ in cyclic obligations.
**Why startup.** Splitwise built a $40M ARR business on netting, but they don't actually settle on-chain. We do.
**UI.** Group page shows "Net settle now" → preview shows net flows → confirm → atomic batch tx.
**Flow.** Server computes net flows → builds atomic tx → all parties sign in parallel → broadcasts.
**Data model.** `group_balances` view.
**On-chain piece.** New ix or batched existing transfers.
**Devnet status.** Real after build (3-4 weeks; depends on multi-sig coordination).
**Test plan.** 3-person cyclic → resolves to 1 transfer.
**Failure modes.** One party doesn't sign in window. Mitigation: timeout → fallback to per-pair settlements.
**Polish details.** Pre-settlement preview shows the magic ("Saves 2 transfers").

### F33.2 — Per-merchant credit lines
**What.** Merchant extends $X credit to a known buyer; settles end-of-month or at threshold.
**Who.** Repeat buyer + repeat seller.
**Why care.** Eliminates per-transaction friction.
**Why startup.** Genuinely new primitive — credit on-chain without lending protocol.
**UI.** Merchant config: "Extend credit to top buyers." Buyer config: "Use credit lines I have."
**Flow.** First few buys are real-time. After threshold of trust, merchant offers credit. Subsequent buys deferred → batched at month-end.
**Data model.** `credit_lines` table (merchant, buyer, limit, used, settle_cadence).
**On-chain piece.** New escrow-like primitive: "deferred settle pact" mode.
**Devnet status.** Real after build (4-6 weeks; new on-chain primitive).
**Test plan.** Buyer accumulates → month-end → batched payment.
**Failure modes.** Buyer defaults. Mitigation: cap based on reputation; insurance pool.
**Polish details.** Both sides see live "credit used / credit remaining" gauge.

### F33.3 — Spend forecasting + burn-rate alerts
**What.** "Based on current burn rate, this Pact will be empty in 4 days." "This Pact is spending 3x faster than last week."
**Who.** Anyone with active Pacts.
**Why care.** Prevent surprises.
**Why startup.** Predictive UI.
**UI.** Pact page shows projection chart + alert badges if anomalous.
**Flow.** Cron computes burn rates, compares to historical, fires alerts.
**Data model.** `pact_burn_rates` table.
**On-chain piece.** None.
**Devnet status.** Real after build (1-2 weeks).
**Test plan.** Synthetic burn → projection accurate; spike → alert fires.
**Failure modes.** Noise on low-volume Pacts. Mitigation: minimum-volume threshold before alerting.
**Polish details.** Push notification format: "@research-agent will run out of budget in 4 days at current rate."

### F33.4 — Auto-refill rules
**What.** "When Pact balance < $5, refill from authority wallet by $50."
**Who.** Set-and-forget agent operators.
**Why care.** Maintains agent operation without manual intervention.
**Why startup.** Stripe Connect's auto-funding parallel.
**UI.** Pact config → "Auto-refill" section.
**Flow.** Cron monitors balance; when threshold hit, builds refill tx, signs via auth (with prior consent stored).
**Data model.** `auto_refill_rules` (pact, threshold, amount, source_wallet, max_refills).
**On-chain piece.** Existing fund-pact ix.
**Devnet status.** Real after build (2-3 weeks).
**Test plan.** Drain Pact → cron detects → refill fires.
**Failure modes.** Source wallet drained. Mitigation: alerts before failure.
**Polish details.** History of auto-refills visible. "Last refill: 3 days ago."

### F33.5 — Sealed-bid pacts
**What.** Pay an unspecified amount; merchant decides whether to accept. Reveals on settlement.
**Who.** Buyers in markets with private pricing (B2B negotiations, RFP responses).
**Why care.** Genuine new primitive: confidential bid + on-chain settle.
**Why startup.** Combines Token-2022 confidential transfer + Pact escrow.
**UI.** Special "sealed-bid" send flow.
**Flow.** Buyer locks confidential amount in escrow → merchant sees offer (encrypted to merchant pubkey) → merchant accepts or rejects → on accept, settles.
**Data model.** `sealed_bid_pacts` table.
**On-chain piece.** Token-2022 confidential + DeliveryEscrow Pact mode.
**Devnet status.** Mainnet-only (depends on Token-2022 confidential).
**Test plan.** Mainnet flow.
**Failure modes.** Merchant doesn't decide in window. Mitigation: auto-refund.
**Polish details.** Buyer sees "Pending merchant decision..." with countdown.

### F33.6 — Multilateral netting at scale (org-wide)
**What.** Reduce gross transfers by 70%+ in DAO/agency contexts where multiple parties have circular obligations.
**Who.** DAOs, agencies with many internal transfers, multi-party vendor settlements.
**Why care.** Capital efficiency at scale.
**Why startup.** Real B2B value.
**UI.** Org dashboard → "Net settle this period" → preview → execute.
**Flow.** Same as F33.1 but at org scale (potentially 100+ parties).
**Data model.** Reuses F33.1's view, scaled.
**On-chain piece.** Batched atomic tx (with size limits — may require multi-tx coordination).
**Devnet status.** Real after build (3-5 weeks; complex coordination).
**Test plan.** Simulate 50-party DAO → net settle.
**Failure modes.** Tx size limits on Solana. Mitigation: batch into multiple coordinated txs.
**Polish details.** "Saved $X in tx fees vs gross settlement" metric.

### F33.7 — Clearing batches
**What.** Daily/weekly batched settlement reduces tx fees for high-volume merchants.
**Who.** High-volume merchants.
**Why care.** Per-tx fee adds up.
**Why startup.** Same as F33.6.
**UI.** Merchant config → "Batch incoming receipts daily."
**Flow.** Receipts accumulate in escrow → daily cron batches → single settlement to merchant.
**Data model.** `clearing_batches` table.
**On-chain piece.** Batch ix.
**Devnet status.** Real after build (3-4 weeks).
**Test plan.** Merchant batches 100 receipts → single tx settles all.
**Failure modes.** Batch fails partially. Mitigation: atomic only.
**Polish details.** Merchant dashboard shows "Saved $X in fees this week via batching."

### F33.8 — Cross-token settlement (pay BONK, settle USDC)
**What.** Pay in any Solana token; recipient gets clean USDC. Net through Jupiter atomically.
**Who.** Buyers holding non-USDC.
**Why care.** Don't force a swap step on the user.
**Why startup.** Already shipped F12 Pay-with-any-token; this section deepens the framing.
**UI.** Send flow → "Pay with..." picker → token list with quote.
**Flow.** Composed v0 tx: swap input token → USDC → transfer → settle. Atomic.
**Data model.** None new.
**On-chain piece.** Jupiter swap + transfer in one v0 tx.
**Devnet status.** Quote-only on devnet (no DEX liquidity); real on mainnet.
**Test plan.** Mainnet swap-and-pay.
**Failure modes.** Slippage. Mitigation: explicit slippage tolerance.
**Polish details.** Receipt shows both legs ("Paid 1000 BONK ≈ $5.00 → settled $4.97 USDC after slippage").

### F33.9 — Inheritance-on-Pact
**What.** If authority wallet is inactive for 90 days, Pact funds release to a successor.
**Who.** Long-term users worried about wallet loss.
**Why care.** Crypto's inheritance problem.
**Why startup.** Real consumer demand.
**UI.** Pact config → "Set successor" → other wallet pubkey.
**Flow.** Cron monitors authority activity. After 90 days inactive, executes successor transfer.
**Data model.** `pact_successors` table.
**On-chain piece.** New "set_successor" ix + cron-triggered "claim_successor" ix.
**Devnet status.** Real after build (3-4 weeks; new ixs).
**Test plan.** Set successor → simulate 90 days → successor claims.
**Failure modes.** False positive (user just inactive but alive). Mitigation: warning emails + 90-day grace.
**Polish details.** Email at 30/60/89 days: "Activity needed."

### F33.10 — Co-spend (two agents share a Pact)
**What.** Two agents on one Pact, both can claim. Useful for agent-to-agent collaboration.
**Who.** Multi-agent setups.
**Why care.** Composability.
**Why startup.** Genuinely new primitive.
**UI.** Pact config → "Add co-spender."
**Flow.** Both agent pubkeys can sign spends within the cap.
**Data model.** `pact_cospender` table or array column on `pacts`.
**On-chain piece.** Allowlist multiple agent pubkeys.
**Devnet status.** Real after build (1-2 weeks; minor program change).
**Test plan.** Co-spender tries to spend → succeeds within bounds.
**Failure modes.** Race condition on cap. Mitigation: on-chain cap enforcement (already exists).
**Polish details.** Both agents visible on the Pact page.

---

## §34. The investor lens — why Settle is invest-able

**Why a dedicated section.** Master intent says: *"judges, users, developers, and investors understand why this matters."* We covered the first three; the investor lens is its own narrative.

### TAM (Total Addressable Market)

We sit at the intersection of four growing markets:

1. **Stablecoin payments**: $200B+/month in stablecoin volume on Solana alone (early 2026); annualized $2.4T+. Capturing 0.05% of receipt volume on this rail = $1.2B/year revenue at 1bp take rate.
2. **AI agent economy**: $X (rapidly emerging; agent-to-agent transactions estimated $50B/year by 2027 by multiple analysts). Pact-as-API-key replaces a $1B/year API key management category.
3. **Creator/freelance payments**: $400B annually globally. Settle Personal serves consumer-to-consumer + consumer-to-creator with sub-second confirm.
4. **Enterprise spend management** (Brex / Ramp / Mercury territory): $2B+ annual SaaS revenue category. Settle Business directly competes.

We're not betting on any single one of these; we're betting on the intersection where all four meet — programmable, verifiable money on Solana.

### Business model (when we eventually monetize)

**Phase 0–3 (devnet → first paying customers):** Free. Build the protocol, build the moat. No fees on receipts.

**Phase 4+ (post-Phase 3, after we've shipped Business surface):**

1. **Per-receipt fee on commercial activity:** 0.5–5 bps on receipt volume above a generous free tier. Free for personal use, sub-1bp for SMBs, sliding for enterprise. Comparable to Stripe's 2.9% + 30¢ but 100× cheaper because we're not absorbing card-network economics.
2. **Settle Business SaaS:** $50–500/mo per merchant for advanced analytics, multi-employee cards, approval workflows, compliance exports. Mercury's $0/mo + Brex's $0/mo charge nothing for basic; their revenue is interchange. We charge transparent SaaS for power features.
3. **Settle Treasury yield:** Take a thin spread (10–25 bps) on yield generated by yield-while-idle (F6.5). Users still earn 4–6%; we take 0.10–0.25% out of underlying APY.
4. **Verification API premium:** `<settle-verify>` web component is free. Programmatic API for high-volume verifiers (other apps verifying millions of receipts) is metered.

We never charge users for receipts they can verify themselves. Verification is the public good.

### Unit economics

**Per-receipt cost:** ~$0.001 thanks to Light Protocol ZK Compression. ~$0.0003 for the on-chain commit. Total infrastructure cost per receipt: <$0.0015.

**Per-receipt revenue (at scale):** 1bp on a $5 receipt = $0.0005. Doesn't break even alone — we make money on volume + on Business SaaS.

**Break-even volume:** ~$200M/year in receipt volume (single full-time engineer on infra). Achievable in 12–18 months on the current trajectory.

**LTV / CAC dynamics:**
- CAC: ~$0 in Phase 0–2 (organic, dev-led, ecosystem-driven). ~$50–200/customer in Phase 3+ when we add paid distribution.
- LTV: high. Receipts compound. Once a merchant has built 10K receipts on Settle, switching costs are real (export-and-reimport, but reputation doesn't transfer).

### Why funding compounds the wedge (not just speeds it)

When we raise:
1. **Engineering team scales 5×:** 1 → 5 senior engineers. We ship Phase 3–5 in 6 months instead of 24.
2. **Audit budget:** $100K–500K → OtterSec / Neodyme / Kudelski. Mainnet credible.
3. **Verifiable build infrastructure:** dedicated CI + reproducible builds.
4. **Capability registry curation:** dedicated team curating + reviewing PRs. Schema becomes legitimately public-good.
5. **B2B sales motion:** 1–2 sales hires for Settle Business. Land enterprise.
6. **Partnerships:** Solana Foundation, Helius, Phantom, Squads — proper engagement.
7. **Marketing:** technical + consumer narratives in parallel.

What funding does NOT do:
- Buy us a business model (we're building one)
- Buy us a moat (the moat is the protocol layer + open-source verifiable build, which we ship without funding)
- Buy us users (organic ecosystem-driven distribution is more durable)

### Why we'd raise (timing)

**Don't raise before Phase 3 done.** Pre-revenue raise = excessive dilution for marginal speed gain. The wedge — verifiable money — is buildable without capital.

**Raise after Phase 3:** $5M–$15M seed once the Business surface is shipping, capability registry has 100+ entries, 3+ paying enterprise customers on devnet/mainnet. At that point, capital buys real growth.

**Don't raise from generic VCs.** Raise from PayFi-aware funds (Multicoin, Variant, Hack VC, Solana Ventures) who understand the on-chain primitive thesis.

### What investors will get wrong (and how we counter)

| Investor concern | Our answer |
|---|---|
| "Stripe will just add Solana." | Stripe operates on rails they don't own. We own the rail. Stripe can integrate but can't replicate our verifiability. |
| "Phantom will add payments." | Phantom is a wallet UI. We are infrastructure. Different product surfaces. |
| "AI agents are speculative." | Agents are one user type. Consumers + Business carry the rest of TAM. |
| "Solana could die." | We'd port to any L1 with sub-second finality. The wedge is the property, not the chain. |
| "Stablecoin regulation could hit." | We settle in whatever's stable. Today USDC; tomorrow whatever's the leader. |

---

## §35. AI/ML primitive layer (cross-Layer)

These are AI/ML primitives that aren't AI assistants (those are §29) — they're *infrastructure-level AI* that powers Settle's distinguishing intelligence.

### F35.1 — Receipt embeddings
**What.** Every receipt's purpose text + reason JSON gets vectorized; stored in pgvector or similar.
**Who.** Powers F29.2 (AI receipt query) and F35.4 (semantic search).
**Why care.** Semantic understanding > keyword matching.
**Why startup.** Modern infrastructure.
**UI.** Invisible to users; powers smart features.
**Flow.** Insert receipt → embed → store vector.
**Data model.** `receipts.embedding` vector column.
**On-chain piece.** None.
**Devnet status.** Real after build (1-2 weeks; pgvector extension on Supabase).
**Test plan.** Insert → embedding present → similarity query works.
**Failure modes.** Embedding model API down. Mitigation: queue retry.
**Polish details.** Re-embed on schema changes.

### F35.2 — Capability fingerprinting
**What.** Each capability hash gets an associated fingerprint vector (computed from its endpoints + sample receipts) for similarity search.
**Who.** Capability discovery, merchant similarity rec.
**Why care.** "Find merchants similar to translate.com" type queries.
**Why startup.** Marketplace intelligence.
**UI.** Capability page → "Similar capabilities" sidebar.
**Flow.** Compute fingerprint → store → similarity rec.
**Data model.** `capability_fingerprints` table.
**On-chain piece.** None.
**Devnet status.** Real after build (2-3 weeks).
**Test plan.** "Translation" capability → similar capabilities surface.
**Failure modes.** Fingerprint quality. Mitigation: improve over time.
**Polish details.** "Why similar" hover-card.

### F35.3 — Trust score model (live ML, not just formula)
**What.** F3.12 was a formula. Upgrade: ML model trained on dispute outcomes predicts trust score.
**Who.** Buyers evaluating agents/merchants.
**Why care.** Better trust prediction.
**Why startup.** Frontier defensibility.
**UI.** Same as F3.12, but score is now model-driven.
**Flow.** Periodic batch retraining; live inference on score query.
**Data model.** `trust_models` versioning table.
**On-chain piece.** None.
**Devnet status.** Real after build (4-6 weeks; needs labeled training data — disputes).
**Test plan.** Backtest model: predicts disputes better than baseline.
**Failure modes.** Overfitting. Mitigation: cross-validation, hold-out set.
**Polish details.** Score reasoning visible ("low trust because: 12% dispute rate, low diversity").

### F35.4 — Semantic receipt search (powered by F35.1)
**What.** "Pizza-related receipts" returns receipts about food, not just receipts containing the word "pizza."
**Who.** Power users.
**Why care.** Smarter search.
**Why startup.** Modern UX.
**UI.** Search bar with natural-language input.
**Flow.** Embed query → cosine similarity vs receipt vectors → return ranked.
**Data model.** Reads `receipts.embedding`.
**On-chain piece.** None.
**Devnet status.** Real after build (1-2 weeks after F35.1).
**Test plan.** "Food" returns pizza, sushi, takeout. "Tools" returns translate, summarize, image-gen.
**Failure modes.** Embedding drift. Mitigation: re-embed on model upgrade.
**Polish details.** Highlight matched semantic concepts in results.

### F35.5 — Anomaly detection (live, transformer-based)
**What.** F29.4 fraud detection upgraded with transformer model trained on receipt sequences.
**Who.** All users.
**Why care.** Catches subtler patterns.
**Why startup.** Stripe Radar parallel.
**UI.** Same as F29.4.
**Flow.** Sequence model on receipt history; flags outliers.
**Data model.** `anomaly_models` versioning.
**On-chain piece.** None.
**Devnet status.** Real after build (4-6 weeks).
**Test plan.** Synthetic anomaly scenarios → flagged.
**Failure modes.** Drift. Mitigation: retrain periodically.
**Polish details.** Per-user anomaly profile (some users have spiky spend by nature).

### F35.6 — Auto-tagging (powered by F35.1)
**What.** Receipts auto-tagged on insert based on embedding similarity to existing tagged receipts.
**Who.** All users; reduces manual tagging.
**Why care.** Reduces friction on F2.11.
**Why startup.** Bookkeeping at scale.
**UI.** Receipts arrive with suggested tags; user can accept/edit.
**Flow.** New receipt → embed → kNN against tagged receipts → suggest tag.
**Data model.** Reads `receipts.embedding` + `receipt_tags`.
**On-chain piece.** None.
**Devnet status.** Real after build (1-2 weeks after F35.1).
**Test plan.** Tag 10 "pizza" receipts → 11th pizza receipt auto-tagged.
**Failure modes.** Wrong tag. Mitigation: easy to correct; learns.
**Polish details.** Tag confidence visible ("90% confident this is 'food'").

### F35.7 — Capability category clustering
**What.** Capabilities cluster into categories automatically (translation / summarization / image-gen / web-scrape) based on receipt patterns.
**Who.** Powers /capabilities page navigation.
**Why care.** Discoverability.
**Why startup.** Auto-emerging market structure.
**UI.** /capabilities → categories appear from clustering.
**Flow.** Periodic clustering on capability fingerprints (F35.2).
**Data model.** `capability_clusters` table.
**On-chain piece.** None.
**Devnet status.** Real after build (3-4 weeks after F35.2).
**Test plan.** New capabilities cluster reasonably.
**Failure modes.** Bad clusters. Mitigation: human review of cluster assignments.
**Polish details.** Each cluster has its own page + index.

### F35.8 — Predictive burn-rate (better than F33.3's linear forecast)
**What.** F33.3 used linear extrapolation. Upgrade: time-series model accounting for weekly/monthly patterns.
**Who.** Pact owners.
**Why care.** Better forecasts.
**Why startup.** Predictive depth.
**UI.** Same as F33.3 with confidence intervals visible.
**Flow.** Time-series model on Pact spend history.
**Data model.** Reuses F33.3.
**On-chain piece.** None.
**Devnet status.** Real after build (3-4 weeks after F33.3).
**Test plan.** Backtest accuracy.
**Failure modes.** Cold-start (new Pact). Mitigation: fall back to linear until sufficient data.
**Polish details.** Forecast chart shows confidence bands.

---

## §36. Updated build sequence (Part VI features integrated)

### Phase 1 (Personal surface depth) — adds:
- §27 Phantom integration depth (mobile audit, in-app browser, deep-links, share-sheet)
- §31 Cross-cutting UX disciplines audit + enforcement
- §30 The 9 emotional moments designed and shipped
- §28.1 Default visibility = private (migration + UI)
- §28.2 Sealed-box receipt context polish

### Phase 2 (Protocol moats) — adds:
- §29.5 AI explainer button on every screen
- §29.1 Receipt-as-story narration (F2.3)
- §35.1 Receipt embeddings infrastructure
- §29.6 AI rule generator
- §32 Comparison framing in marketing copy

### Phase 3 (Business surface) — adds:
- §29.3 AI bookkeeper
- §29.4 AI fraud detection
- §29.7 AI dispute drafter
- §33.3 Spend forecasting + burn-rate alerts
- §33.4 Auto-refill rules
- §35.5 Anomaly detection (transformer)
- §35.6 Auto-tagging
- §34 Investor narrative (used for fundraising prep)

### Phase 4 (Treasury / org) — adds:
- §33.1 Net settlement among friends
- §33.2 Per-merchant credit lines
- §33.6 Multilateral netting at scale
- §33.7 Clearing batches
- §29.2 AI receipt query
- §29.10 AI receipt voiceover

### Phase 5 (Consumer breadth) — adds:
- §32 Splitwise-style ongoing tab feature shipped
- §32 Patreon-style supporter subscription explicit
- §35.4 Semantic receipt search
- §35.7 Capability clustering
- §33.9 Inheritance-on-Pact
- §33.10 Co-spend

### Phase 6 (Protocol future) — adds:
- §28.3 Token-2022 confidential transfers (post-mainnet)
- §28.4 Private leaderboards (ZK)
- §28.5 Anonymous-but-verified mode (ZK)
- §28.6 Confidential streaming pacts
- §28.7 Selective disclosure on receipts
- §29.9 AI agent-to-agent negotiation
- §33.5 Sealed-bid pacts
- §35.3 Trust score ML model
- §35.8 Predictive burn-rate

---

## §37. The 6-criteria minimum-bar filter (run first, before §37b)

> **Big is allowed. Random is not.**

Every feature must satisfy at least ONE of these six criteria. If it satisfies zero, it doesn't ship — period. This is the *necessary* condition; the §37b 17-check list is the *sufficient* condition.

| # | Criterion | Test question | Examples |
|---|---|---|---|
| 1 | **Programmable** | Does it let humans/agents/teams define better money rules? | Caps, pacts, streams, schedules, approvals |
| 2 | **Verifiable** | Does it create better proof? | Receipts, hash chains, cNFTs, audit logs, exports |
| 3 | **Trusted** | Does it reduce fear or risk? | Revoke, refund, escrow, reputation, merchant verification |
| 4 | **Useful** | Does a real user open the app and use it? | Send money, pay merchant, fund agent, split bill, view receipt |
| 5 | **Solana-native** | Does Solana make it *meaningfully* better? | Instant settlement, low fees, Blinks, Solana Pay, PDAs, SPL, cNFTs |
| 6 | **Clear UX** | Can the user understand it in one sentence? | If not, simplify the UX before building. |

**Process:**

1. Propose a feature.
2. Run it through all 6 criteria — assign ✅ or ✗ for each.
3. If 0 of 6 are ✅ → reject. The feature is random, not focused.
4. If 1+ of 6 are ✅ → proceed to §37b.
5. The feature must also attach to the spine (§1) — *programmable, verifiable money movement for humans and agents on Solana*. If a feature satisfies criteria but doesn't attach to the spine, it's a different product, not Settle.

**Why this is the minimum-bar:** the 17-check list (§37b) is comprehensive but exhausting. It's good for the final gate. As a *first-pass* sanity check, the 6 criteria are faster — most weak features fail here in 30 seconds.

**Examples of what this filter catches:**

| Proposed feature | Pass / Fail | Why |
|---|---|---|
| "Add a chat feature so users can DM each other" | ✗ | 0/6: not programmable, not verifiable, not trusted (could amplify scam risk), arguably useful but not Settle-shaped, not Solana-native, unclear UX. → **Random.** |
| "Refund-by-emoji on every receipt within window" | ✅ | 4/6: programmable (rule = window), verifiable (refund creates new receipt), trusted (reduces fear), useful, Solana-native (on-chain dispute primitive), clear UX. → **Build.** |
| "AI-generated NFT avatar for every user" | ✗ | 0/6 against the spine. → **Random.** |
| "Streaming salary with pause-on-blur" | ✅ | 5/6: programmable, verifiable (receipt per claim), trusted (claim-anytime, refund-prorated), useful, Solana-native (sub-second slot accounting). → **Build.** |
| "Game-like leaderboard with badges and tiers" | 🟡 | 2/6 if framed as gamification (random-ish). 4/6 if framed as *capability reputation* (real Settle primitive). → **Reframe before build.** |

This is the difference between *big and coherent* (4-6 ✅s, attached to spine) and *big and random* (0-1 ✅, not attached to spine).

---

## §37b. The depth filter (17 checks, run after §37 passes)

When a feature has cleared the 6-criteria gate above, evaluate it through all 17 deeper checks:

1. **Mantra (§1):** does this defend the feeling *"this is not just another crypto app — this is a new financial layer"*?
2. **Spine check (§1):** does it deepen *programmable rules*, *verifiable receipts*, *trust-building reputation*, or *money movement*?
3. **Layer placement (§5):** which of the 9 layers does it belong to?
4. **User type (§4):** which of 7 user types is the primary? (Consumers / Agents / Merchants / **Creators** / Developers / Teams / Ecosystem)
5. **Principle alignment (§3 + §28 default-private):** does it satisfy all 11 principles?
6. **Filter pass (§18-§21):** code-heavy, money-light, testable, Devnet-honest, coherent?
7. **Cross-cutting discipline (§31):** all 14 disciplines (D1–D14) — Stripe-DNA, mobile-first, every-screen-next-action, microcopy, hierarchy, tooltips, feels-alive, reduced-motion, accessibility, dark/light parity, every-number-actionable, Solana-native imagination, mantra-defense, 8-lens evaluation?
8. **8 lenses (§31 D14):** does this hold up across founder, product strategist, UX designer, Solana protocol engineer, Web3 power user, judge, investor, ruthless competitor?
9. **Emotional moment (§30):** if this is one of the 9 named moments, is the design specified?
10. **Phantom integration (§27):** does this work in Phantom in-app browser? Mobile-first?
11. **Privacy surface (§28):** what's the default visibility? Is opt-in clear?
12. **AI surface (§29):** is there a smart assistant or explainer that helps the user?
13. **Comparison resonance (§32):** does this borrow from Stripe / Brex / Mercury / Linktree / Phantom / Splitwise / Patreon / Linear (or invent a new pattern), AND re-imagine for Solana (D12)?
14. **Build phase (§16, §36):** which phase does it ship in?
15. **Investor lens (§34):** does this make Settle more invest-able?
16. **Refused-scope check (§22):** does this overlap with what we deliberately don't do? If yes, kill or redirect.
17. **Hackathon-safe filter:** is this *required* to ship by May 11, or is it Phase 1+? If hackathon-required, it must be 80% reusable in Phase 1+.

If any answer is "I don't know" or "kind of," the feature isn't ready. Sharpen first, ship second.

---

## Appendix A — How to use this document

When proposing a new feature:

1. Pick a **Layer** (§5).
2. Identify the **User type** (§4).
3. Verify the **Spine** — does this deepen rules / receipts / reputation / money?
4. Apply the four filters (§18-§21).
5. Write a feature spec in the template from Part II.
6. Add to the relevant phase in §16.

If at any step the answer is "I don't know" or "kind of," the feature isn't ready — go back and sharpen it.

When proposing a pivot:

1. Re-read §1 (spine) and §22 (what we don't do).
2. If the pivot violates either, it's a different product.
3. If it doesn't, go to step 4.
4. Show the pivot doesn't shrink ambition (per §17 deepen-first rule).
5. If approved, this document gets updated.

---

## Appendix B — How this document gets updated

Every two weeks, the founder + active contributors review:

- Are any features in Part II now shipped? → mark them ✅ in §15.
- Are any features missing? → add to the appropriate layer with full spec.
- Has any phase finished? → mark "Done when" criterion met, advance to next phase.
- Has the spine drifted? → §1 update only with explicit founder approval.

This document is the source of truth. When it goes out of date, the product goes out of focus.

---

*Last meaningful update: 2026-05-01. The product is in Phase 0 → Phase 1 transition. Phase 1 (Personal surface depth) starts immediately after the hackathon submission lands.*
