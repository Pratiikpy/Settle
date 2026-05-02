# Settle — Product + UX Brief for the Front-End Prototype Team

You are designing the front-end prototype for **Settle**, a Solana-native payment product. This brief tells you everything the prototype must cover. Read it once. Start building. No project files needed beyond this one.

**The bar.** Settle is a startup, not a side project, not a weekend hack, not a hackathon submission. It is being built by serious people. The prototype should reflect that ambition — feel like a financial-layer product, not a wallet UI or a crypto demo. If your prototype could be mistaken for a generic crypto app, it is not Settle.

This brief intentionally:

- Says nothing about UI, layout, components, color, typography, spacing, animation style, current screens, or how anything currently looks. **All of that is yours to design.**
- Says nothing about tech stack, framework, libraries, or implementation. Those will not help you. They will confuse the prototype.
- Does describe every feature, every flow, every state, every user type, every Solana primitive that affects UX, and the voice we want to project.
- Treats every feature as something we either ship today or are committed to shipping. There is no "future maybe" pile. The prototype should cover the full surface as if everything exists.

If something is unclear, ask before assuming. We would rather you slow down than skip a feature.

---

## 1. What Settle Is

> **Pay anyone. Hire any AI. Trust the receipts.**

Settle is the payment rail for the AI age. Three kinds of users move money through one product:

1. **Consumers** sending money to other people via `@handle` (Venmo-shaped — but every payment is provable, refundable on rules, and traceable).
2. **Creators / merchants / API sellers** receiving payments, with public reputation, public earnings if they opt in, and verifiable disputes.
3. **AI agents** spending USDC on behalf of a human under cryptographic spend rules (per-call max, daily cap, allowlisted merchants, capability pins, expiry) — without the human signing every spend.

Underneath every payment is a **4-hash commitment** on-chain so the receipt can be independently verified by anyone, with no Settle servers in the loop. Refunds, disputes, streaming agent salaries, atomic split payments, and group spend approvals are real on-chain primitives, not UI tricks.

**Where Settle sits in the market.** Stripe assumes a human at the keyboard. Cash App doesn't run on a chain. Brex/Ramp give corporate cards but not programmable spend rules for agents. A wallet (Phantom etc.) is a wallet, not a payment product. Settle is the consumer payment app where AI agent payments are first-class, with on-chain proof that anyone can verify. You're designing something with the simplicity of Venmo, the clarity of Stripe, the safety of Brex, and the speed of Phantom — but the unique thing it offers is that **every cent is provable**.

**The emotional metric we're aiming for:**

> "This is not just another crypto app. This is a new financial layer."

If a user opens the prototype and feels that, you've succeeded.

---

## 2. The Six User Types

The prototype must give each of these a coherent experience. None of them are the same person. None of their needs overlap fully.

### 2.1 Consumers

People paying other people. Want speed, clarity, low friction.

What they do:
- Send money to a `@handle`, a wallet pubkey, a payment link, or a QR code.
- Receive money and know who sent it and why.
- See history of what they paid.
- Get a refund if rules allow.
- Split a bill across N people.
- Contribute to a group payment (collab pay).
- Send a gift that auto-refunds if unclaimed.
- Schedule recurring sends.
- Save toward a goal.
- Round-up savings on every spend.
- Set an allowance for a kid / dependant.
- Browse a public feed of receipts (where senders/recipients opted in).
- Pay with USDC by default; pay with any token where supported.
- Pay over voice (speak the intent, the app composes the tx).
- Pay from a screenshot of a Solana Pay QR.

### 2.2 AI Agent Principals

Humans who delegate spending power to an AI agent. Want safety, control, and proof.

What they do:
- Spawn an **AgentCard** — a programmable spending budget bound to an AI agent's pubkey.
- Set per-call caps, daily caps, allowlisted merchants, capability pins, expiry, policy version.
- Fund a **Pact** — a task-scoped vault inside the AgentCard.
- Watch the agent spend in real time with policy decisions visible (allow / deny / review).
- Revoke the AgentCard immediately if anything feels wrong.
- Close a Pact and reclaim unspent funds.
- See every receipt the agent generated.
- Set up auto-refill rules so a low Pact tops up automatically.

### 2.3 AI Agents

Autonomous systems acting on behalf of an AgentCard. Want fast, predictable spend decisions and verifiable receipts.

What they do (mostly via SDK / MCP, but some surfaces are visible):
- Present credentials to a merchant's MCP server.
- Spend within their AgentCard bounds.
- Receive ALLOW / DENY / REVIEW with a reason.
- Generate a receipt for every spend attempt (success and failure).
- Claim from a streaming Pact periodically.
- Trigger a delivery escrow release after merchant confirms.

### 2.4 Creators / Merchants / API Sellers

People or services that receive payments. Want trust signals, payment surfaces, and revenue visibility.

What they do:
- Claim a public `@handle`.
- Build a public profile page (creator surface).
- Build a merchant operator surface (separate from public profile).
- Publish a capability spec (what they sell, in what units, at what price).
- Verify their domain via DNS TXT so they show as **verified merchant**.
- Generate self-repricing QR codes (Solana Pay transaction-request URLs).
- Generate one-time-use payment links.
- Create payment Blinks for X / Discord / Telegram unfurling.
- Set up self-serve webhook URLs + signing secret.
- See analytics (revenue, top capabilities, dispute rate, refund rate).
- Handle disputes with AI-drafted responses + on-chain refund authority.
- Show public follower graph + earnings transparency (opt-in).
- Build a price list.
- Be recognized as having a **reputation badge** (on-chain MPL Core soulbound asset) once they hit volume thresholds.
- Show their **capability heatmap** position in the public capability leaderboard.

### 2.5 Developers

People integrating Settle into their own apps, agents, MCP servers, or merchant flows. Want a clean dev surface that "just works".

What they do:
- Read product docs and pick a path (consumer pay component, merchant accept, agent spend, MCP wrap, webhook).
- Use TypeScript / Python / Rust SDKs.
- Use the MCP middleware to wrap their own tool servers with Settle billing.
- Use embeddable Pay component, embeddable Verify component.
- Read GraphQL / REST API references.
- Test on devnet before shipping to mainnet.
- Verify receipts independently of Settle's servers.
- Compute capability hashes correctly to register capabilities.
- Sign and verify webhooks.
- Use Solana Actions / Blinks endpoints.
- Use Solana Pay transaction-request endpoints.

### 2.6 Teams / Groups / DAOs / Families

Multiple people sharing money management. Want shared budgets, vote-to-spend, and accountability.

What they do:
- Create a **group account** with quorum + threshold ("3 of 5 members must approve any spend over $100").
- Members request a spend (creates a pending request).
- Members vote yes/no.
- When quorum is met, the cron signer fires the spend autonomously.
- Custodian holds the AgentCard authority but cannot spend solo.
- Share a request via shareable URL (group invite link).
- Set per-kid allowances inside a family group.
- Track spending by member, merchant, purpose, time window.

### 2.7 Operators (internal)

People running a Settle deployment. Want operational visibility and emergency controls.

What they do:
- See cron loop health (last fire, indexer cursor lag, total executions).
- Promote / demote federation origins (which external Settle deployments to trust).
- Retry failed federated webhooks.
- Run preflight config gates before promoting a deploy.
- See `/admin/health` operator dashboard.

---

## 3. The On-Chain Primitives (in product terms — no implementation)

You don't need to know how these are stored. You need to know what they MEAN to the user, because the UX hangs on these concepts.

### 3.1 AgentCard

A spending card that belongs to a human (the **authority**) and is delegated to an AI agent (the **agent**). It carries rules: daily cap, per-call max, allowlisted merchants, capability pins, expiry, policy version, revoked-or-not.

Conceptually: like a Brex / Ramp corporate card, but the spender is an AI, the rules are cryptographically enforced, and revocation is immediate and provable.

UX implications: every AgentCard view should show ALL its rules in plain English. "This agent can spend up to $50/day, max $5 per call, only with these 3 merchants, until June 5, with capability `chat-completion`." Numbers must be actionable — clicking "$12.50 spent today" should open today's receipts.

### 3.2 Pact

A task-scoped budget attached to an AgentCard. The user funds it once; the agent draws from it according to rules. Three modes:

- **OneShot Pact** — fixed budget for a fixed task. "$20 for one research task." Vault holds the funds. Spending happens via `spend_via_pact` ix. Closing returns unspent USDC to authority.
- **Streaming Pact** — money accrues over time at a per-slot rate up to a max total. "$0.10/minute up to $50 total for a research-streaming agent." Agent claims periodically. Pause/resume/cancel-with-prorata-refund supported. The **just-claimed period must not retroactively count as paused** (subtle UX).
- **Delivery Escrow Pact** — buyer pre-funds, merchant + capability + deadlines pinned. Funds release on buyer-confirm OR permissionless after the deadline. Buyer can dispute within the dispute window for a refund. Merchant pubkey is pinned in the on-chain account so a permissionless release cannot redirect funds.

UX implications: the prototype must distinguish these three modes clearly. They are not the same flow. A Pact card / module should always show: mode, current state, funded amount, spent/claimed amount, remaining, expiry/deadlines, available actions (pause/resume/release/dispute/close/refund/renew).

### 3.3 Receipt

Every payment generates a receipt. Internally, that receipt has a 4-hash commitment chain (receipt_hash, reason_hash, policy_snapshot_hash, purpose_hash). Externally, **the receipt is a living proof object** — not a database row, not a plain confirmation page.

Receipts have **kinds**: `direct_send`, `x402_spend` (agent http-billed), `streaming_claim`, `escrow_release`, `escrow_dispute`, `refund`, `link_send`. The kind drives copy and what additional fields appear.

Receipts have **states**: pending → confirming → confirmed | failed. Refund status, dispute status, public/private state, cNFT mirror state are all on the receipt.

UX implications: a receipt page must include — amount, sender, recipient (or merchant), purpose, status, kind, timestamp, slot, decision (allow/deny), refund/dispute available actions, plain-English narration of what happened, a hash inspector for technical users, related receipts (refund-of links), tags, attachments (voice notes), public/private toggle, share/print/PDF export.

A receipt that fails should still appear with reason — not as a generic error. Denials are policy decisions; they belong in the public ledger of "what the rules did".

### 3.4 Verifier

Anyone — not just Settle — can verify a receipt. A user pastes a tx signature into `/verify` and sees: the on-chain commitment chain, the off-chain canonical JSON the hashes were computed from, and a green "VERIFIED" or red mismatch. The verifier is a public surface. It works without a wallet.

### 3.5 Capability Hash + Capability Registry

A **capability hash** is a 32-byte BLAKE3 fingerprint of a merchant's spec ("I sell `gpt-4-completion` at 0.0001 USDC per token"). Merchants publish their spec via `/m/[handle]/capabilities`; the hash is what gets pinned in AgentCard allowlists. The **capability registry** maps a hash to a human alias ("OpenAI gpt-4 chat") so a receipt can show "you paid for `OpenAI gpt-4 chat`" instead of `0xa3f9…`.

UX implications: the merchant capability surface is one of the more important developer-facing UI moments. The consumer never sees the hash directly — they see the human alias.

### 3.6 Blink / Solana Action

A **Blink** is a Solana Action URL that any X/Discord/Telegram client can unfurl into a one-click pay button. Pasting `settle.so/at/zoro?req=20&note=pizza` into a tweet should render as "Pay Zoro $20 — pizza" with an Approve button right there. The merchant doesn't have to leave the app to pay.

UX implications: the prototype should include a "share as Blink" affordance on payment links, payment requests, hire-an-agent links, and tipping flows.

### 3.7 cNFT / Compressed Receipt

For ALLOW receipts, Settle mints a 1-unit compressed token (~$0.001/account vs ~$0.00204 for a regular Solana account) as a public proof mirror. This is the "public proof" surface — anyone can view a receipt's cNFT as canonical evidence on-chain.

### 3.8 Reputation Badges

Soulbound MPL Core assets minted to users/merchants who hit specific behavior thresholds. Frozen-at-create — they cannot be transferred. They represent earned reputation, not gamification. Six categories (volume, speed, dispute rate, refund rate, capability breadth, agent reliability).

### 3.9 Streaming + Escrow Are Real

A streaming agent salary is not a UI fiction. The on-chain program tracks rate, max total, claimed-so-far, last-claim-slot, paused-or-not. A delivery escrow holds funds; the merchant cannot redirect them. Disputes within the window refund the buyer. Past the window, anyone can release to merchant.

UX implications: when the prototype shows "this agent earned $0.42 this hour" it should feel like watching a tachometer. The rate is real; the slot count is moving; the paused state is honest.

### 3.10 Wallet, Sign-In, Cluster

The user signs in via Phantom (and other wallet-standard wallets). On devnet they use devnet USDC. On mainnet they use real USDC. The product must be honest about which cluster they're on. **Never let a devnet limitation look like a broken product** — say "swap requires mainnet (no devnet liquidity)" not "swap failed".

---

## 4. The Product's Four Surfaces

These are the four "buildings" the prototype lives in. They feel different from each other on purpose — a consumer should not feel like they're inside an admin tool.

1. **Consumer surface** — pay, receive, schedule, save, group, profile, history, receipts, settings.
2. **Creator/merchant surface** — public profile (`/m/[handle]`), operator landing (`/m/[handle]/manage`), capabilities, webhook self-serve, disputes, analytics, verify-domain.
3. **Agent surface** — agent templates, agent dashboards, hire-an-agent flow, AgentCard management, streaming dashboards.
4. **Operator/admin surface** — federation origins, cron status, preflight gates, health dashboard.

Each surface has its own "home" feeling. Each surface has shared chrome (wallet button, profile dropdown, cluster indicator) but distinct information architecture.

---

## 5. Every Feature The Prototype Must Cover

Treat all of these as in-scope. Group them however makes the best prototype IA (information architecture). Don't omit anything.

### 5.1 Consumer

**Money movement:**
- Send money by `@handle`.
- Send money by raw pubkey.
- Send money by payment link (`/pay/<token>`).
- Send money via QR (Solana Pay transaction-request, self-repricing).
- Pay-by-screenshot (drop a Solana Pay QR image, parse, prefill).
- Send money over voice (speak intent → app composes tx).
- Pay with USDC (default).
- Pay with any token via Jupiter swap (USDC sends work everywhere; non-USDC swap activates on mainnet).
- Live SOL/USD ticker (Pyth).
- Atomic two-tap collab payment (basis-point split between two creators in one tx).
- Split bill (N payers, ceiling-divided per-payer amount, server aggregates closure at N/N).
- Buy-now-pay-on-delivery escrow (with dispute window + permissionless release after deadline).
- Schedule a recurring send (daily / weekly / monthly).
- Save-for-X bucket (named goal, auto-contribute, target amount, deadline).
- Round-up savings (every spend rounds up to nearest $X, the delta goes to a savings dest).
- Gift send (escrow card holds funds; recipient claims via a link).
- Allowance (parent → kid recurring weekly funding with daily-cap-enforced kid card).
- Group account spending with quorum approval flow.
- Auto-refill (if a Pact's vault drops below threshold, auto-refund from owner).
- Streaming claim worker (Pact accrues; cron drains when ≥ min-claim threshold).

**Identity / profile:**
- Public handle (`@yourhandle`).
- Wallet-aware profile ("you've sent $X to @handle across N payments").
- Follow another wallet → public follow graph.
- Web Push notifications when followed wallet receives a public_feed receipt.
- Capability leaderboard (public market view of capability volume + latency).
- Public earnings transparency (opt-in via card setting).
- Reputation badges visible on profile.
- Trust score (per-wallet aggregate).

**Receipts:**
- Receipt detail page (every payment).
- Receipt verifier (paste sig → verified result).
- Hash/proof inspector (advanced).
- Receipt narration (LLM-generated plain English forensic timeline).
- Voice-note attachment (sealed-box encrypted, sender-only decrypts).
- Live receipt object (mode-aware status: open / streaming live / streaming paused / held / released / refunded).
- cNFT compressed receipt mirror status (was it minted? where can it be viewed?).
- Receipt search.
- Receipt tags (user-annotated).
- Refund-by-emoji (😞 → mode-routes to close_pact or dispute_delivery_escrow within window).
- Receipt PDF export.
- Refund linkage (a refund receipt links to the original receipt and vice versa).
- Receipt federation (a receipt from another Settle deployment can be imported and verified).

**Wallet management:**
- Connect wallet (Phantom primary; wallet-standard discovery).
- Sign in with Solana (canonical envelope JSON + agent_sig + nonce).
- Cluster awareness (devnet vs mainnet badge, never silent).
- Disconnect / change wallet.
- Pre-connect USDC balance preview on payment landing pages.

**Speed / sensory:**
- Confetti calibrated to amount (small puff at $1, full takeover at $50+ with haptic).
- Sub-400ms trust gesture with elapsed-time readout ("Confirmed in 0.42 s").
- Live audience counter on a receipt (Supabase Realtime — how many people are viewing this proof right now).
- Killchain animation (the receipt building itself out of its 4 hashes — for educational moment).
- Drag-share UX (drag a receipt out of the page to share).

### 5.2 AI Agent / Principal

- Spawn AgentCard with full rule set.
- Pre-built AgentCard templates (research, content-research, dev-tools, etc.).
- "Hire this AI agent" public Blink — shareable hire flow.
- Open OneShot Pact, Streaming Pact, or Delivery Escrow Pact.
- Auto-refill setup (rule + queue).
- Bulk-close all Pacts under a card.
- Revoke card with confirmation copy explaining what stops, what's safe, what needs closing.
- Live policy decisions feed (allow/deny/review with reasons).
- Denial reasons in plain English (over cap, off allowlist, capability mismatch, expired, revoked).
- Agent spend history filtered by capability, merchant, time.
- Pause/resume/cancel-with-prorata-refund for streaming.
- Release/dispute for delivery escrow.
- Streaming dashboard ("agent earned $X this hour, $Y this day, $Z lifetime").
- MCP adapter docs (OpenAI, Anthropic, LangChain, CrewAI, Vercel AI SDK).
- "Hire an agent" landing surface for non-technical users.

### 5.3 Creator / Merchant

- Claim handle (`/m/[handle]` becomes their public profile).
- Operator landing (`/m/[handle]/manage`).
- Public profile (CTA, capability list, recent activity, follower count, badges, verified status).
- Verify domain via DNS TXT (init token, paste in DNS, verify).
- Publish capability spec → capability hash registered.
- Capability list (what they sell, units, prices).
- Price list management (live pricing for QR).
- Self-repricing QR (one URL forever; price updates via pricelist).
- One-time-use payment links (atomic single-use enforcement).
- Webhook self-serve (URL + signing secret + test ping).
- Webhook delivery status (queue, retries, last delivery).
- Disputes flow (receive dispute → AI-drafted response → on-chain refund authority).
- Analytics (revenue by capability, merchant heatmap position, dispute rate, refund rate, top customers).
- Public earnings transparency (opt-in).
- Follower activity (when a follower paid you).
- Reputation badge claim flow (eligible → mint).
- Capability heatmap presence (live grid of public_feed ALLOW receipts as glowing cells).
- Solana Attestation Service (SAS) verified-merchant lookup.

### 5.4 Developer

- Top-level docs hub (`/docs`).
- TypeScript SDK reference + quickstart.
- Python SDK reference.
- Rust SDK reference.
- MCP middleware docs (`/docs/mcp`).
- Pay component docs (`/docs/pay-component`) with embed snippet.
- Verify component docs (`/docs/verify-component`) with embed snippet.
- Webhook docs (`/docs/webhooks`) — signing, verification, retry semantics.
- GraphQL / REST API explorer.
- Receipt verification guide.
- Capability hash computation guide.
- Webhook signing/verification guide.
- One-line examples ("accept a payment", "verify a receipt", "wrap an MCP server").
- `npx create-settle-merchant` CLI scaffolder docs.
- Devnet quickstart.
- IDL drift detector reference.
- Programmatic Solana Actions and Blinks setup.
- Sandbox playground (`/sandbox`) for quick experiments.

### 5.5 Operator / Admin

- Control center (overview).
- Preflight config gates (env var presence, RPC reachability, program ID match).
- Cron status (last fires, success rate, error tail).
- Federation origins admin (promote, demote, retry queue).
- Audit page (read-only audit findings + resolution status).
- `/admin/health` (operator-grade health dashboard: last 20 executions, last-24h failures, indexer cursor lag, migration count, pass/fail pill).
- Verifiable build status (`/verify-build` — what code shipped + program hash match).

### 5.6 Public / Protocol Surfaces

- Landing page (consumer pitch).
- About / mission.
- Stats / transparency report (`/stats`).
- Public goods page (`/public-goods`).
- Capability heatmap (`/leaderboard`) — real-time grid of capability activity.
- Per-capability leaderboard pages.
- Verifier (`/verify`) — paste a sig, verify a receipt without a wallet.
- Capability registry (`/capabilities`) — public registry of capability hash → human alias.
- Federation list — which Settle deployments mutually trust each other.
- Public feed — ALLOW receipts where sender + recipient opted in.
- Solana Pay endpoints (`/sp/[merchant]/[slug]`).
- Solana Action / Blink endpoints (under `/api/actions/*` — render Blinks for hire/request/revoke/router).
- Help / FAQ / education.
- Security / threat model page.
- Onboarding flow.

### 5.7 Cross-Cutting

- Activity feed.
- Notifications (web push via VAPID).
- Real-time receipt updates (Supabase Realtime).
- Voice/spoken intent parsing.
- Screenshot drop / paste / pick → Solana Pay parse.
- Multi-language UI (i18n; pick one non-EN locale to start).
- Mobile + tablet + desktop layouts.
- Accessibility (zero axe-core violations on every primary surface).
- Email-passwordless / Privy embedded wallet alternative (for users without Phantom).

---

## 6. The Cross-Cutting UX Systems The Prototype Must Solve

These are not features; they are systems that touch every page.

### 6.1 The Wallet Flow

A user lands on Settle. What happens next?

- **First-time:** they see a connect CTA. Clicking opens the wallet picker (Phantom + alternative). Once connected, they see their handle (or are prompted to claim one).
- **Returning:** wallet auto-connects (their choice; user can disable in settings). Their dashboard loads with state.
- **No wallet installed:** the picker offers an embedded/passkey option (Privy) so they're not blocked. Crypto-novice users should be able to send their first $1 without ever installing Phantom.
- **Cluster mismatch:** if user is on mainnet but the deploy expects devnet, fail loud — never silent. A clear "switch network" CTA.
- **Disconnect:** every gated page should gracefully render the disconnected state — never crash or feel broken.

### 6.2 The Transaction Lifecycle

Every payment is a small story with five acts:

1. **Compose** — recipient + amount + token + note. Show fees + final receivable amount.
2. **Sign** — wallet popup. Show what they're approving in plain English ("Pay 5.00 USDC to @zoro").
3. **Confirm** — sub-second. Show animated trust-gesture with elapsed time.
4. **Receipt** — receipt appears in their history; if amount-tier confetti fires, fire it.
5. **Share** — receipt is shareable as a Blink.

Failures get the same dignity:
- Wallet rejected: "you cancelled" — neutral, no shame.
- Tx failed on-chain: show the on-chain reason in plain English.
- Network failed: "couldn't reach Solana — try again" with a retry.

### 6.3 The Receipt-As-Story

When a user looks at a receipt, they should see a forensic timeline:

> **08:14:23.412 (slot 459460038)**  
> @aria sent 5.00 USDC to @zoro via Pact `studio-tip`.  
> Card `creator-tips` allowed it (within $50/day cap).  
> Capability: `tip` (no pinned hash).  
> Confirmed in 0.42 seconds. cNFT mirrored at `BzGz…`.  
> Verifiable independently — anyone can recompute the 4 hashes.

This narration is generated, not hand-written per receipt. The prototype should treat a receipt as a thing with a *voice*.

### 6.4 The Live Numbers

Every number on Settle is real-time when relevant. "$12.50 spent today" updates without a refresh. The cap usage bar fills as the agent spends. The streaming claim ticker counts up by the slot. "23 viewing this receipt right now" updates live.

This is not decoration. This is the speed of Solana made visible.

### 6.5 The States Per Screen

Every screen needs all eleven of these. The prototype will be judged on whether any of them are missing.

1. Empty (first-time user, no data).
2. Loading (data arriving).
3. Needs setup (env / wallet / handle / verification not done).
4. Ready (the happy path).
5. Signing (wallet popup is open).
6. Confirming (tx submitted, awaiting confirmation).
7. Success (post-confirm).
8. Partial (some operations succeeded, some didn't).
9. Failed (with a reason and a next-step).
10. Retry (action available).
11. Human action required (operator must do something out-of-band).

### 6.6 The Plain-English System

If the system enforces a rule, the user reads a sentence about it, not a constraint.

- "This card can spend $50 today; $12.50 used so far."
- "This Pact will close automatically on June 5."
- "Refund available for 3 days. After that, funds release to merchant unless disputed."
- "This agent is paused. Resume to start earning again."

Internal terms (PDA, BLAKE3, Anchor, slot, lamport) are allowed in advanced/technical inspector views. They should never be the first impression.

### 6.7 The Privacy System

Every receipt has a public/private flag. The user controls it. The UI must always make state obvious. A user must never accidentally publish a private receipt. A merchant must never accidentally hide a public earnings claim.

### 6.8 The Real-Time + Sensory System

- Solana confirmations <400ms — celebrate them.
- Confetti calibrated to amount (don't celebrate $0.05 the same as $50).
- Trust gesture with elapsed-time readout.
- Sound is optional (don't autoplay).
- Haptic on mobile for >$5 confirmations.
- Live audience counter on shared receipts.

### 6.9 The Mobile + Phantom-Friendly System

A material % of users will live in Phantom's in-app browser. The prototype must:
- Render perfectly at iPhone 14 width (390px) and Pixel 7.
- Handle the Phantom in-app deep-link return cleanly.
- Have no horizontal overflow at narrow widths.
- Place primary CTAs in thumb-reach zones on mobile.
- Treat Phantom mobile as the canonical user, not a degraded one.

### 6.10 The Empty-State Teaching System

An empty page is the first chance to teach. "No receipts yet" should also explain what receipts are, why they matter, and what to do next. Never a blank page.

### 6.11 The Trust / Proof Presentation System

Trust signals must look earned, not decorative.
- Verified merchant badge: only on DNS-verified.
- Reputation badges: only on threshold met.
- Trust score: clickable, opens a "why this score" explanation.
- "Verified ✓" on a receipt: only when all 4 hashes recomputed.

A trust signal that feels purchasable is a betrayal of the product.

---

## 7. The Nine Emotional Moments

These are moments the prototype should make special. They are why people will tell their friends about Settle.

1. **The first sub-second confirmation** — first time a user pays and sees the trust-gesture animate in 400ms with a real elapsed time. They should feel the speed of Solana viscerally.
2. **The first AgentCard spawn** — they're handing money to an AI. The flow should feel like handing keys to a teenager — with rules. Plain English. Reassuring.
3. **The first Pact funding** — they fund a vault and the rule-enforced spend begins. The act of funding should feel weighty and clear.
4. **The first agent spend** — they watch their AI agent pay a merchant in real time, with the policy decision visible. This is the moment they understand "programmable money".
5. **The first receipt verify** — they paste a tx sig into the public verifier (no wallet) and see "VERIFIED" with the 4 hashes recomputed. They feel proof.
6. **The first refund-by-emoji** — they tap 😞 on a payment and the right refund flow happens (close_pact for OneShot/Streaming, dispute for Escrow). It feels like cancellation done right.
7. **The first revoke** — they hit revoke on an AgentCard. They see exactly what stopped, what's safe, what needs closing. It feels protective, not panicked.
8. **The first receipt drag-share** — they drag a receipt out of the page and share it as a Blink in a tweet. The receipt is portable proof.
9. **The first streaming claim** — they watch an agent's streaming Pact tick up by the slot. They pause, the ticker stops. They resume, it counts again.

These should not feel like UI tricks. They should feel like the protocol's real superpowers becoming visible.

---

## 8. Voice We're Aiming For (Recommendation, Not Mandate)

**You decide.** This is your craft. Below is what we'd lean toward — feel free to deviate if you have a better take.

We'd lean toward: **calm, confident, precise, a touch playful.** Not corporate. Not bro-ish. Not crypto-bro. Not hand-holdy.

- The speed of Stripe's voice, the clarity of Linear's voice, the friendliness of Cash App's voice. Not the loudness of Phantom's launch screens. Not the complexity of a typical wallet UI.
- Microcopy is tight. "Pay 5.00 USDC to @zoro" not "Initiate transfer of 5.00 USDC to recipient @zoro".
- Errors are honest and humane. "We couldn't reach Solana — try again?" not "RPC request failed: 503".
- Confirmation copy explains what's about to happen, not what it's called. "Sign to authorize this AI agent to spend $50/day" not "Sign create_card instruction".
- Marketing copy on the landing page leans plainspoken about what the product DOES, not what tech it uses. "Pay anyone. Hire any AI. Trust the receipts." is the line.

If your prototype has a better voice direction, run with it. We trust your taste.

---

## 9. Where To Add Your Own Creative Independence

We want you to NOT just rebuild what we have. We want you to ADD what you think a startup-grade product needs. Examples of things we'd love to see:

- **A landing page that punches.** Not just "what is Settle" — a landing that makes a non-crypto person want to try it.
- **A blog / changelog surface.** We'll write the words; we want the surface designed.
- **A press kit / brand page.** Logo, screenshots, mission, founders, contact.
- **An onboarding flow that teaches without lecturing.** Maybe a 60-second tour the first time someone connects a wallet.
- **A "how Settle works" interactive explainer.** Animations that show the 4-hash receipt building itself, the AgentCard rules being enforced, the streaming Pact ticking up.
- **A receipt that's a proper share-able artifact.** Not just a page — a thing people will paste in tweets.
- **A capability heatmap that's beautiful.** Real public data, glowing cells, hover-to-see.
- **A merchant onboarding that doesn't suck.** From "claim handle" to "first verified payment received" in under 3 minutes.
- **A developer hub that feels like Stripe's not Truffle's.** Make integrating Settle the easiest day a developer has had.
- **An agent template gallery.** Pre-built agent configurations for common use cases.
- **A "for teams" page.** Group accounts, family allowances, DAO treasury — surfaced as a coherent offering.
- **A trust/security page** that explains the threat model in human terms, not RFC-speak.
- **A referral / share / viral surface** if you think one fits.
- **A novel UX for any of the 9 emotional moments above.** Surprise us.

If you propose a feature we haven't thought of and it serves the spine ("humans and agents move money through programmable rules, verifiable receipts, and trust-building reputation"), we'll want it.

---

## 10. The Bar (read this last; it sets the standard)

Settle is a startup. Funded or not, the prototype should look and feel like one. That means:

- Every page has a purpose. No filler. No "lorem ipsum" sections. If you can't justify a section, remove it.
- Every CTA is earned. The user knows why they're being asked to do something.
- Every state is designed. Empty isn't blank; loading isn't a spinner alone; failed has a path forward.
- Every flow ends in confidence. The user knows what just happened.
- Every primitive (AgentCard, Pact, receipt) feels like a thing in the product, not a database column.
- Every page works on mobile, on Phantom mobile, on tablet, on desktop. Mobile is the default, not the afterthought.
- Every interaction is fast. If it's not fast in the prototype, it can't be fast in production.
- Every word is plain English first, technical second.
- Every claim is honest. If something doesn't work on devnet, the UI says so without making the product feel broken.
- Every public surface (landing, verify, leaderboard, public feed) works without a wallet.

If, at the end, a senior product designer at Stripe or Linear could look at the prototype and not immediately spot a corner that was rushed — you've delivered.

If, at the end, a non-crypto-native user could open the prototype and say "oh I get this, I'd use this for $20" — you've delivered.

---

## 11. What We'd Like You To Deliver

You decide the format. As a starting point, what we'd find most useful:

1. **Full user journey maps** for each of the 6 user types — from "first arrival" through every primary task to "habitual return".
2. **Screen inventory** — every distinct screen across consumer, merchant, agent, developer, operator, public surfaces.
3. **Information architecture** — how the product navigates. What lives where. Where the boundaries between surfaces are.
4. **State models** for each major screen — all 11 states from §6.5.
5. **Feature-to-screen mapping** — every feature in §5 placed on a screen.
6. **Action hierarchy per user type** — what can the consumer do, what can the agent principal do, etc., ordered by frequency.
7. **The 9 emotional-moment treatments** — how each one feels in the prototype.
8. **The plain-English copy system** — how copy is written across the product.
9. **The trust / proof presentation system** — how badges, scores, verified marks, public feeds are shown.
10. **The mobile + Phantom-friendly interaction plan.**
11. **Anything you propose to add** that the brief didn't ask for but you think Settle needs.

Don't anchor to whatever exists today. Design from the brief.

---

## 12. Final Standard

A user opening Settle should quickly understand:

- I can pay people.
- I can authorize AI agents safely.
- I can trust the receipts.
- I can inspect proof when I want to.
- I can stop risk if anything feels wrong.
- I can build on this if I'm a developer.
- This is a startup that's serious about what it's building.

If your prototype makes those things obvious, you've built Settle.

If your prototype hides those things behind crypto vocabulary or generic dashboards, you've built another wallet UI. We don't want another wallet UI.

We want a financial layer.

Build that.
