# Codex Strategy For Settle

This file is the durable product and execution context for Settle. Read this before changing strategy, adding features, writing pitch copy, or deciding what to build next.

The spelling of this file is intentional because the user requested `codex_strategry.md`.

## 0. The Actual Strategy To Build Settle

The strategy is not "add many features." The strategy is to make Settle own one deep, defensible product category:

> Programmable, verifiable money movement on Solana.

Everything else is built around that.

Settle should be built in layers:

1. **Universal Receipt Kernel**
   - Every money movement creates the same kind of verifiable receipt.
   - This is the deepest wedge.
   - Human sends, agent spends, streaming claims, escrow releases, split bills, payment links, refunds, and revokes all become proof objects.
   - Without this, Settle is a collection of flows.
   - With this, Settle becomes a financial proof layer.

2. **Programmable Money Layer**
   - AgentCards and Pacts are the rule engine.
   - OneShot Pact = bounded one-time delegated spend.
   - Streaming Pact = money over time.
   - DeliveryEscrow Pact = trust-minimized payment with dispute/release.
   - Future modes can include recurring, team-approved, scheduled, milestone, or oracle-conditioned payments.
   - This layer is what makes Settle more than a wallet.

3. **User Product Surfaces**
   - Personal: send, split, request, refund, receipt, profile, proof.
   - Agents: budget, allowlist, capability, spend, deny, revoke, reputation.
   - Merchants: accept, prove, analyze, dispute, export, build trust.
   - Developers: SDK, API, webhooks, MCP adapter, verify widget.
   - Teams: treasury, cost centers, approvals, recurring budgets, exports.
   - These surfaces must feel like one product because they all use the same receipt and Pact layers.

4. **Trust And Reputation Layer**
   - Receipts feed reputation.
   - Reputation feeds merchant and agent trust.
   - Trust feeds user decisions.
   - Leaderboards, badges, proof pages, capability scores, public stats, and exports must come from real receipt behavior, not vanity data.

5. **Distribution And Composability Layer**
   - Blinks make Settle usable anywhere.
   - Solana Pay makes payment links and QR flows native.
   - SDKs and widgets make Settle embeddable.
   - Public profiles and proof pages make receipts shareable.
   - Capability registry makes Settle the schema owner for agent-commerce behavior.

The build strategy:

### Step 1: Make The Core Claim True

Core claim:

> Every payment proves itself.

Before adding major new surfaces, every existing money movement must feed the same receipt kernel.

Required:

- Direct sends create receipts.
- Payment links create receipts.
- Split bills create receipts.
- Collabs create receipts.
- x402 agent spends create receipts.
- Streaming claims create receipts.
- Escrow open/release/dispute creates receipts.
- Refunds create receipts.
- Revocations create policy receipts.

This is the first real startup-grade move because it turns Settle from "many payment features" into "a proof standard for money movement."

### Step 2: Make The Receipt Page The Signature Product

The receipt page should be the thing people remember.

It must show:

- What happened.
- Who paid whom.
- Why it was allowed.
- What rules applied.
- What hash proofs exist.
- What transaction settled it.
- Whether it can still be refunded or disputed.
- Whether it minted cNFT / compressed receipt / badge effects.
- What the user can do next.

The receipt page should feel like Stripe receipt + block explorer + legal proof + beautiful consumer memory.

This is where UX, trust, Solana, and product story meet.

### Step 3: Make Programmable Pacts Feel Like A New Financial Primitive

Pacts should not feel like backend objects. They should feel like programmable money agreements.

Each Pact card should show:

- Mode: one-time, streaming, escrow, future recurring.
- Who controls it.
- Who can spend.
- Who can receive.
- Cap.
- Burn rate.
- Expiry.
- Refund/dispute/revoke rights.
- Current status.
- Linked receipts.
- Plain-English rule sentence.

Example:

> This agent can spend up to $5 per call, $50 per day, only with verified translation merchants, until June 5. You can revoke anytime.

### Step 4: Build Surfaces Around The Same Kernel

Only after the kernel is universal, deepen surfaces:

- Personal dashboard: recent payments, active pacts, pending disputes, proof exports.
- Agent dashboard: budget, allowed merchants, denied spends, burn rate, revoke.
- Merchant dashboard: revenue, disputes, latency, receipt completeness, capability reputation.
- Developer dashboard: API keys replaced by Pacts, webhook logs, SDK snippets, verification tools.
- Team dashboard: treasury, approvals, cost centers, policy templates.

Each surface must answer: what should the user do next?

### Step 5: Make Settle Embeddable

The most defensible product is not only an app. It is a standard others can use.

Build:

- `<settle-pay>` web component.
- `<settle-verify>` web component.
- `@settle/sdk` examples.
- MCP paid-tool adapter.
- Merchant template.
- Agent template.
- Public capability registry.

This makes Settle more than a frontend. It becomes protocol infrastructure.

### Step 6: Expand Into Startup-Scale Surfaces

After the foundation is strong:

- Recurring payments.
- Scheduled sends.
- Team approvals.
- Treasury exports.
- Merchant subscriptions.
- Capability marketplace.
- Public stats.
- Cross-app receipt importer.
- Mainnet Jupiter swap execution.
- Mainnet proof transactions.

These are expansion moves, not the foundation.

## 0.1 What We Are Actually Making

Settle is not one product surface. It is a layered payment operating system:

> Wallet UX + programmable contracts + cryptographic receipts + agent budgets + merchant trust + developer SDK + public proof network.

The user-facing product should let someone say:

- I can pay anyone.
- I can let an agent spend safely.
- I can prove what happened.
- I can revoke risk.
- I can inspect trust.
- I can accept payments as a merchant.
- I can build on this as a developer.
- I can use this as a team treasury.

That is the product.

## 0.2 What Not To Do Next

Do not immediately add random new categories like full Patreon, full Calendly, full Gumroad, full CRM, or full banking.

Those may become plugins or merchant templates later, but the next product work must deepen the Settle-native primitives:

- receipts,
- pacts,
- trust,
- reputation,
- merchant verification,
- developer integration,
- programmable payment UX.

Big is good only when the center is strong.

## 0.3 The Best Next Build Order

Immediate build order:

1. **Universal Receipt Kernel**
   - One receipt path for every payment.
   - Highest priority.

2. **Receipt Page v2**
   - Story, proof inspector, timeline, refund/dispute/revoke actions, export, cNFT/compressed/badge status.

3. **Pact UX v2**
   - Beautiful Pact cards, rule sentence, burn rate, mode-specific actions.

4. **Personal Dashboard v2**
   - Active pacts, recent receipts, pending actions, proof exports.

5. **Merchant Trust Pages**
   - Capability reputation, latency, disputes, revenue, proof completeness.

6. **Agent Profiles**
   - Capabilities, spend history, denial rate, trust score, hire/fund Blink.

7. **Developer Layer**
   - SDK docs, MCP adapter, `<settle-verify>`, `<settle-pay>`, webhook logs.

8. **Team/Treasury Layer**
   - Approval rules, cost centers, budget templates, exports.

This is sequencing, not reducing ambition.

## 0.4 If We Follow This Strategy, What Do We Get?

If this strategy is followed properly, Settle should become the product described in the master intent:

> A serious Solana-native PayFi product where humans, agents, merchants, developers, teams, and protocols move money through programmable rules, verifiable receipts, instant settlement, reputation, privacy, and trust.

The outcome should not be:

- a small hackathon demo,
- a weekend AI-agent wrapper,
- a narrow "hire an agent" app,
- a generic wallet,
- a fake super-app,
- or a backend protocol with no user-facing product.

The outcome should be:

- a usable consumer payment app,
- a programmable agent-budget system,
- a merchant/API payment rail,
- a receipt and reputation network,
- a developer integration layer,
- a team treasury product,
- and a protocol-style public-good layer.

Following this strategy will get the desired product only if each phase is implemented to the definition of done in this file. The strategy is not magic by itself. It is the build order and product spine. The work still has to be executed with high UX quality, real Devnet behavior, honest claims, and end-to-end tests.

## 0.5 Required App Surfaces From The Master Intent

The final app should include these real, user-facing surfaces. These are not optional polish if the goal is startup-level depth.

### Home Dashboard

The first logged-in screen should answer:

- What can I do now?
- What money is moving?
- What needs my attention?
- What receipts were created recently?
- What Pacts are active?
- What risks or disputes exist?
- What did I earn or spend today?

The dashboard should not be a vanity stats page. It should be an action surface.

### Send And Payment Flow

The send flow should support, over time:

- pay by handle,
- pay by wallet address,
- pay by Solana Pay link,
- payment request,
- payment link,
- split bill,
- scheduled payment,
- recurring payment,
- gift payment,
- refund/dispute path,
- receipt export after completion.

Every send must end in a receipt.

### Pact Center

The Pact center should show:

- OneShot Pacts,
- Streaming Pacts,
- DeliveryEscrow Pacts,
- future recurring/scheduled/team Pacts,
- spend rules,
- vault balances,
- burn rate,
- claim/refund/revoke rights,
- linked receipts,
- policy version,
- plain-English rule summary.

### Agent Center

The Agent surface should include:

- AgentCards,
- funded budgets,
- allowed capabilities,
- denied spends,
- trust/reputation,
- public agent profiles,
- hire/fund Blink,
- revoke/panic control,
- spend history and burn-rate charts.

### Merchant Center

The Merchant surface should include:

- merchant profile,
- capability listing,
- verified merchant status,
- payment acceptance,
- human vs agent revenue,
- disputes/refunds,
- latency and success metrics,
- receipt completeness,
- webhook logs,
- CSV/proof exports,
- future merchant subscriptions.

### Receipt Center

The Receipt surface should include:

- receipt list,
- receipt detail,
- proof inspector,
- hash-chain verification,
- timeline,
- receipt-as-story,
- refund/dispute actions,
- cNFT/compressed/badge status,
- sealed notes/voice notes,
- export,
- shareable proof link.

### Reputation And Trust Center

Trust should be earned from behavior.

This surface should include:

- capability reputation,
- merchant trust score,
- agent trust score,
- badge collection,
- dispute history,
- denial rate,
- success rate,
- latency,
- proof completeness,
- public proof pages.

### Developer Center

The developer surface should include:

- SDK docs,
- public API,
- webhook docs,
- MCP adapter,
- example merchant,
- example agent,
- receipt verifier,
- `<settle-pay>`,
- `<settle-verify>`,
- local/devnet setup,
- error-code reference.

### Treasury And Team Center

The team surface should include:

- treasury dashboard,
- team-managed AgentCards,
- approvals,
- cost centers,
- vendor allowlists,
- recurring/scheduled budgets,
- contractor streaming payments,
- exports,
- policy templates.

### Settings And Safety Center

Settings should include:

- wallet/session controls,
- privacy settings,
- notification settings,
- sealed-box keys,
- trusted merchants,
- active credentials,
- connected devices,
- revoke-all/panic control,
- export data,
- developer keys where applicable.

### Public Surfaces

Public surfaces should include:

- public profile pages,
- public merchant pages,
- public agent pages,
- public proof pages,
- capability leaderboard,
- public stats,
- shareable receipts,
- Blink-compatible actions.

## 0.6 Missing Means Not Done

If any major payment flow does not create a verifiable receipt, Settle is not done.

If users cannot understand what to do next, Settle is not done.

If the dashboard is empty or passive, Settle is not done.

If merchant, agent, and human flows feel like separate products, Settle is not done.

If Solana primitives are hidden and not felt through UX, Settle is not done.

If the product only impresses developers and not users, Settle is not done.

If the product only impresses judges and not real Web3 users, Settle is not done.

If a feature is simulated but presented as real, Settle is not done.

If the app cannot be tested clearly on Devnet/localnet/simulation, Settle is not done.

## 1. Master Intent

Settle must be treated as a serious startup-level product, not a small hackathon project, weekend demo, or narrow AI-agent payment toy.

The product ambition is:

> Settle is the PayFi rail for programmable, verifiable money movement on Solana, built for humans, AI agents, merchants, developers, teams, and protocols.

The product should feel like a Solana-native combination of Stripe, Brex, Mercury, Linktree, Phantom, Splitwise, Patreon, Linear, and an agent-payment protocol, but it must not become a random feature drawer. Every surface must connect to one product spine:

> Settle lets humans and agents move money through programmable rules, verifiable receipts, and trust-building reputation on Solana.

Settle should make users feel:

> This is not just another crypto app. This is a new financial layer.

The user explicitly does not want narrow MVP thinking. Time, code complexity, and engineering effort are not the blockers. Money is the blocker. Prefer code-heavy, money-light features that can be built, tested, and demonstrated through Solana programs, Devnet, localnet, Phantom, Solana Pay, Blinks, open-source SDKs, local simulations, self-hosted services, free public APIs, UI polish, indexers, and verifiable receipt logic.

## 2. Non-Negotiable Constraints

- Do not reduce ambition because something takes time.
- Do not assume engineering effort is the blocker.
- Do not turn Settle into a small MVP if the user asked for the best long-term version.
- Do not build fake features and present them as real.
- Do not claim mainnet readiness when something is only Devnet-ready.
- Do not build expensive features requiring bank partners, card issuing, KYC vendors, audit firms, hardware, unavailable phones, SOC 2, insurance capital, paid compliance providers, or large paid infra.
- Do not build features that are impossible or painful to test end-to-end.
- Do not let AI agents dominate the product so much that human payments disappear.
- Do not let human payments become disconnected from agent payments, receipts, trust, and Solana-native primitives.
- Do not add random creator-commerce or fintech features unless they compound the core Settle spine.
- Do not use judge-gaming as a substitute for real product quality.
- Do not make dashboards that only show numbers without helping the user act.
- Do not make receipts static transaction pages.
- Do not make reputation decorative or fake.
- Do not make crypto jargon visible when plain English is better.
- Do not leave broken mobile, wallet, transaction, empty, or error states.

## 3. Product Standard

Every major feature must answer at least one of these:

- Can a real user use this?
- Does this make Settle more useful?
- Does this make Settle more trustworthy?
- Does this make Settle more beautiful?
- Does this make Settle more defensible?
- Does this make Settle feel like a company, not a project?
- Does this make Settle more obviously native to Solana?
- Does this make users, developers, judges, and investors understand why Settle matters?

The final standard:

> If another serious team gets one year, uses AI agents, and builds aggressively, Settle should still feel more useful, polished, ambitious, coherent, and startup-worthy.

## 4. Strategic Framing

There are two useful external framings:

1. PayFi rail for the agent economy on Solana.
2. Verifiable money for humans and agents.

The first is strong for Solana, stablecoin, PayFi, and judge language. The second is stronger as a durable startup wedge.

Recommended combined framing:

> Settle is the PayFi rail where every payment proves itself. Humans pay humans. Agents pay APIs. Merchants serve both. Every payment moves through programmable rules and leaves a cryptographic receipt.

Avoid making the product sound like only:

- "AI agent payments"
- "hire an agent"
- "stablecoin checkout"
- "crypto Venmo"
- "database UI on top of Solana"

Those are too narrow or too generic.

## 5. Core Product Surfaces

Settle should expand through coherent surfaces, not random features.

### Surface A: Settle Personal

For humans paying humans, creators, friends, freelancers, and everyday Web3 users.

Core actions:

- Send USDC.
- Pay by handle.
- Split bills.
- Create payment links.
- Gift or request money.
- View live receipts.
- Attach sealed notes or voice notes.
- Refund or dispute within allowed windows.
- Follow profiles.
- View public proof pages.
- Export receipt history.

UX standard:

- Sending money should feel as simple as Venmo.
- Settlement should feel faster than Web2.
- Receipts should feel like permanent proof objects, not boring transaction pages.
- Errors should tell the user exactly what to do next.

### Surface B: Settle Agents

For AI agents, users delegating budgets, and developers building paid agents.

Core actions:

- Create AgentCards.
- Set daily caps, per-call caps, allowlists, capability pins, expiry, and revocation.
- Open Pacts.
- Fund agent budgets.
- Stream payments.
- Revoke access instantly.
- See allow, deny, review, and revoke decisions.
- Inspect capability hashes in plain English.
- Use `settle://` credentials and per-request signatures.

UX standard:

- Funding an agent should feel powerful but safe.
- Every rule should be decoded before signing.
- Revoking should feel decisive and protective.
- Denied spends should be receipts, not vague errors.

### Surface C: Settle Merchants

For API sellers, creators, merchants, and service providers.

Core actions:

- Accept Solana Pay and x402-style payments.
- Publish merchant profile.
- Bind pubkey to domain or verification.
- Show capability pricing.
- View revenue by human vs agent.
- Inspect disputes, refunds, and receipt completeness.
- Receive webhooks.
- Export CSV and proof bundles.

UX standard:

- Merchant profile should feel like a financial storefront, not a debug page.
- Trust should be visible through receipts, latency, disputes, and successful payments.
- Analytics must suggest actions, not just show charts.

### Surface D: Settle Developers

For builders integrating Settle into agents, APIs, sites, tools, MCP servers, or wallets.

Core actions:

- Use `@settle/sdk`.
- Verify receipts.
- Create paid API endpoints.
- Use webhooks.
- Embed pay and verify widgets.
- Wrap MCP tools as paid capabilities.
- Use templates for agents and merchants.

UX standard:

- A developer should understand and integrate Settle in minutes.
- Docs should expose real code, real routes, and real test commands.
- Every API should have idempotency and clear error contracts.

### Surface E: Settle Teams And Treasury

For teams, DAOs, companies, and shared budgets.

Core actions:

- Treasury dashboard.
- Team-managed AgentCards.
- Approval rules.
- Cost centers.
- Vendor allowlists.
- Streaming contractor payments.
- Compliance exports.
- Spend anomaly alerts.

UX standard:

- This should feel like Brex or Mercury for programmable Solana budgets.
- Enterprise language is allowed here, but the UX must stay clear and testable.

### Surface F: Settle Protocol

For the ecosystem.

Core actions:

- Open-source receipt verification.
- Public capability registry.
- Public stats.
- Receipt importer for non-Settle Solana payments.
- Verification widgets.
- Reputation primitives.
- Verifiable builds.

UX standard:

- Settle should become infrastructure others can build on.
- The moat is not secrecy. The moat is trust, standards, execution depth, and networked receipt/reputation data.

## 6. Product Principles

- Money should be programmable.
- Receipts should be verifiable.
- Agents should have bounded authority.
- Users should understand every rule before signing.
- Trust should be earned through behavior.
- Privacy should be available when needed.
- Fast settlement should be felt, not just stated.
- Every complex crypto concept should have a plain-English explanation.
- The product should be beautiful without becoming gimmicky.
- The product should be broad without becoming incoherent.
- Prioritization means sequencing, not shrinking the vision.

## 7. UX Principles

Important moments must feel emotionally strong:

- Creating a Pact should feel like creating a programmable money agreement.
- Funding an AgentCard should feel safe and powerful.
- A payment confirmation should feel instant and satisfying.
- A receipt should feel like a permanent proof object.
- Revoking an agent should feel decisive and protective.
- A trust score should feel earned, not decorative.
- A merchant page should feel like a financial storefront.
- A public proof page should feel like a verifiable identity.
- A developer integration should feel simple and inevitable.

Concrete UX expectations:

- Mobile-first, especially Phantom-friendly.
- No empty dashboards without useful examples or next actions.
- No scary wallet wording unless necessary.
- Every transaction state needs clear stages: preparing, signing, submitting, confirming, complete, failed.
- Denials and disputes should show reason codes in plain English.
- Receipts should have live status, hash inspector, proof timeline, and export.
- Advanced crypto details should exist, but behind progressive disclosure.
- Animations should reinforce trust and speed, not distract.

## 8. Current Repository Truth

As of the latest Codex audit:

- The current product spec is `docs/PRODUCT_SPEC.md`.
- `docs/v0.3-build-plan.md` is useful history, but it contains stale planning language.
- `docs/DEVNET_PRODUCT_CAPABILITY_SPEC.md` is older and may be stale relative to v0.3.
- `submission.md` is stale and unsafe for final submission without rewriting.
- `SECURITY.md` is stale relative to autonomous Pact spends and needs a rewrite.
- `README.md` says v0.3 has 22 features, but `docs/PRODUCT_SPEC.md` says 25.

Current verified commands:

- `pnpm typecheck` passes across all 7 packages.
- `pnpm test:sdk` passes 83/83 SDK tests.
- `pnpm --filter @settle/web build` passes.
- `pnpm verify:idl` passes: `idl.ts` matches generated Anchor IDL across 14 instructions, 2 accounts, 6 types, and 12 events.
- `anchor-cli 0.31.1` is installed.

Current local blocker:

- `solana` CLI / `cargo build-sbf` is missing locally, so Anchor runtime tests cannot be executed yet.
- `anchor build` and `anchor test` currently fail with `program not found` because the Solana build toolchain is incomplete.

Recent code fixes from Codex:

- Added `apps/web/components/wallet-button-client.tsx` to load `WalletMultiButton` client-only and avoid hydration mismatch.
- Updated header and onboarding to use the client-only wallet button.
- Removed a bad ESLint suppression in the receipt page.
- Fixed lint warnings in cards/docs pages.

## 9. Current Strongest Product Assets

The repo now has a much stronger v0.3 shape than the early narrow agent-payment concept.

Strong assets:

- AgentCard PDA with caps, per-call max, allowlist, expiry, revoke, agent pubkey, USDC mint pin.
- Pact PDA with Vault PDA custody.
- `spend_via_pact` autonomous agent spend path.
- `open_streaming_pact`, `claim_streaming`, `pause_streaming`, `resume_streaming`.
- `open_delivery_escrow`, `release_delivery_escrow`, `dispute_delivery_escrow`.
- Policy decision events with deny codes.
- x402 proxy with dual signature enforcement and canonical receipt persistence.
- Receipt verification SDK.
- Receipt page with hash inspection.
- Sealed-box receipt attachments.
- Payment links and Solana Pay routes.
- Blinks and Actions routes.
- Capability leaderboard and heatmap.
- MPL Core reputation badge worker.
- Light Protocol compressed receipt mirror worker.
- Devnet seed scripts including streaming and delivery escrow pacts.

This is no longer a tiny app. The remaining work is to make every surface share the same proof layer.

## 10. The Biggest Current Product Gap

The biggest gap is not "more random features."

The biggest gap is that the core product claim is not uniformly true across all payment flows.

The desired claim:

> Every payment proves itself.

Current truth:

- x402 agent payment flow has the strongest canonical receipt pipeline.
- Some human/consumer flows build transactions but do not all persist the same canonical receipt row.
- Streaming claims currently use demo-grade hash derivation in `apps/web/app/api/streaming-pacts/[id]/claim/route.ts`.
- Payment links reserve off-chain with `claimed_at`, but they do not yet have a complete settlement-confirmation/receipt-finalization loop.
- Split bills, collabs, direct sends, escrow release/dispute, and streaming claims need to feed the same receipt kernel.

Therefore, the next no-compromise product move is:

> Universal Receipt Kernel.

## 11. Universal Receipt Kernel

This should be treated as the highest-leverage next build.

Goal:

Every money movement in Settle, human or agent, simple or programmable, should create the same kind of verifiable receipt object.

Flows that must use it:

- Direct send.
- Payment request.
- Payment link.
- Split bill payment.
- Collab payment.
- x402 agent spend.
- OneShot Pact spend.
- Streaming Pact claim.
- Delivery escrow open, release, and dispute.
- Refunds.
- Revocations.

Required behavior:

1. Create pending receipt before signing or submission.
2. Build canonical receipt inputs.
3. Add Solana reference or memo where possible.
4. Submit transaction.
5. Indexer or API finalizes receipt after chain confirmation.
6. Receipt page shows final status, signature, hash chain, policy context, and user-facing story.
7. cNFT / compressed receipt / badge workers consume the same receipt table.
8. Exports and dashboards consume the same receipt table.

Data requirements:

- `request_id`
- `flow_type`
- `payment_kind`
- `payer_pubkey`
- `recipient_pubkey`
- `merchant_pubkey`
- `card_pubkey`
- `pact_pubkey`
- `amount_lamports`
- `mint`
- `capability_hash`
- `purpose_text_hash`
- `receipt_hash`
- `reason_hash`
- `policy_snapshot_hash`
- `purpose_hash`
- `tx_signature`
- `reference_pubkey`
- `decision`
- `status`
- `created_at`
- `submitted_at`
- `confirmed_at`
- `settlement_slot`
- `canonical_reason_json`
- `canonical_policy_json`

Testing:

- Unit test canonical hash generation for each flow.
- Integration test direct send receipt finalization.
- Integration test x402 receipt finalization.
- Integration test streaming claim receipt finalization.
- Integration test escrow release/dispute receipt finalization.
- Realtime test receipt page updates from pending to confirmed.
- Worker dry-run test for cNFT/compressed/badge consumers.

UX:

- A user should be able to go to any receipt and see the same proof model.
- The receipt page should make clear what happened, why it happened, what rules applied, and what can still be done.
- If a receipt is pending, say pending.
- If a receipt is simulated, say simulated.
- If a proof is partial, say partial.
- Never show fake certainty.

## 12. Feature Sequencing Without Shrinking Ambition

The long-term vision can be large. The build order should be disciplined.

### Phase 0: Truth And Build Health

- Fix stale `README.md`, `SECURITY.md`, `submission.md`, and historical docs.
- Install Solana CLI and `cargo build-sbf`.
- Run Anchor build and Anchor tests.
- Run migrations 0001 through 0018 on a real Supabase project.
- Run seed scripts end-to-end.
- Verify devnet program deploy and IDL.

### Phase 1: Universal Receipt Kernel

- Make every payment flow produce one canonical receipt.
- Make every receipt verifiable.
- Make every receipt useful in the UI.
- Wire cNFT, Light compression, badges, exports, feed, and dashboards to the same kernel.

### Phase 2: Settle Personal Polish

- Receipt-as-story.
- Refund-by-emoji.
- Killchain revoke animation.
- Better public profile pages.
- Better send flow.
- Better mobile Phantom flow.
- Sound/haptic polish where tasteful.
- Strong empty states and next actions.

### Phase 3: Agent And Merchant Depth

- Agent profiles.
- Merchant profiles.
- Capability registry with aliases.
- Better capability hover cards.
- Better x402 developer onboarding.
- Merchant analytics and proof exports.
- Agent SDK and MCP wrapper.

### Phase 4: Protocol Layer

- `<settle-verify>` web component.
- `<settle-pay>` web component.
- Public capability registry repo.
- Cross-app receipt importer.
- Verifiable build.
- Public stats page.

### Phase 5: Treasury And Team Layer

- Team-managed cards.
- Approval rules.
- Cost centers.
- Treasury dashboard.
- Scheduled/recurring payments.
- Compliance exports.
- Squads integration if feasible and license-safe.

### Phase 6: Mainnet Hardening

- Mainnet deploy.
- Mainnet proof transactions.
- Mainnet Jupiter swap execution.
- Production RPC and webhook setup.
- Security review.
- Better rate limits.
- Incident runbook.

## 13. Judge And Market Alignment

The official Frontier rules judge:

- Functionality.
- Potential impact.
- Novelty.
- UX.
- Open-source composability.
- Business plan.

Settle should satisfy these through product truth, not tricks:

- Functionality: working Devnet flows, real receipts, real program logic.
- Impact: payment/reputation/receipt layer for humans and agents.
- Novelty: programmable Pacts, receipt hash chains, capability reputation, Light compressed receipt mirrors, soulbound reputation badges.
- UX: instant-feeling settlement, beautiful receipts, plain-English rules, Phantom-friendly flows.
- Open-source: SDK, verifier, program, widgets, registry.
- Business plan: developer payments, merchant rails, team treasury, verification standard.

Judge-facing wording is useful, but product quality is primary. Do not overfit to judges at the expense of real users.

## 14. Solana Native Requirements

Settle should use Solana in ways that are load-bearing:

- Anchor programs for enforced rules.
- PDAs for AgentCards, Pacts, Vaults.
- SPL Token / TransferChecked for USDC.
- Solana Pay for payment URLs and transaction requests.
- Blinks / Actions for distribution.
- Memo/reference for reconciliation.
- Helius or RPC logs for indexing.
- Metaplex / MPL Core for soulbound reputation badges.
- Light Protocol for compressed receipt mirrors where configured.
- Pyth for display/oracle UX where honest.
- SAS for merchant verification where configured.
- Jupiter for mainnet swap execution, with honest Devnet quote-only behavior.

Do not claim Solana primitives that are not wired.

## 15. Devnet vs Mainnet Honesty

Devnet-real:

- Program logic if deployed.
- AgentCards.
- Pacts.
- Streaming.
- Delivery escrow.
- Direct USDC devnet sends.
- Solana Pay transaction requests.
- Receipt pages.
- Supabase-backed app flows.
- Badge and compression workers if keys/RPC are configured.

Mainnet-only or limited on Devnet:

- Real Jupiter swap execution for arbitrary tokens.
- Mainnet liquidity.
- Production trust in SAS attestations.
- Real public user activity.
- Mainnet proof transactions.

If a feature is quote-only on Devnet, say quote-only. If it is simulated, say simulated.

## 16. Features To Add Only If They Attach To The Spine

Good fits:

- Universal Receipt Kernel.
- Receipt-as-story.
- Receipt search and export.
- Verification widgets.
- Agent SDK.
- MCP paid-tool adapter.
- Capability aliases and registry.
- Public proof pages.
- Merchant trust pages.
- Team treasury rules.
- Recurring/scheduled payments.
- Streaming salary.
- Refund-by-emoji.
- Better onboarding and first-action flow.
- Public stats.

Risky or off-spine unless carefully adapted:

- Full creator storefront.
- Calendar booking.
- Newsletter hosting.
- Patreon clone.
- Generic CRM.
- Yield app.
- DEX terminal.
- NFT marketplace.
- DAO payroll as a separate product.
- Mobile-native app requiring unowned devices.
- Banking/card/KYC features needing money-heavy partners.

Do not ban these forever. Just do not let them dilute the core before Settle owns programmable, verifiable payments.

## 17. Definition Of Done

A feature is not done until:

- It has a clear user.
- It has a UI surface.
- It has an empty state.
- It has loading and error states.
- It has plain-English copy.
- It can be tested locally, on Devnet, or through deterministic simulation.
- Its Solana/on-chain/off-chain boundary is documented.
- It does not make dishonest claims.
- It feeds the receipt/trust layer if money moves.
- It has at least one verification path.
- It does not break mobile.
- It passes typecheck/build/tests relevant to its layer.

For money movement specifically:

- It must create a receipt.
- It must be reconciliable.
- It must expose transaction status.
- It must handle failure cleanly.
- It must not silently double spend, double claim, or double mint.

## 18. Instructions For AI Assistants Working On Settle

When helping with Settle:

- Read this file first.
- Preserve ambition.
- Preserve constraints.
- Do not narrow the product without a real reason.
- Do not add random features just because they sound impressive.
- Build toward the product spine.
- If prioritizing, sequence, do not shrink.
- Separate shipped, partial, simulated, and future.
- Tell the truth when something is not wired.
- Prefer code-heavy and money-light work.
- Prefer testable Devnet/local flows.
- Use product language that real users understand.
- Use Solana-native depth where it matters.
- Keep docs synchronized with code.
- Do not submit stale docs.

If a future assistant suggests a feature, it must classify it under one of:

- Core product surface.
- Trust and receipt layer.
- Agent economy layer.
- Merchant layer.
- Developer layer.
- Treasury/organization layer.
- Consumer payment layer.
- UX polish layer.
- Protocol/future layer.

Then it must explain:

- What the feature is.
- Who uses it.
- Why users care.
- Why it helps Settle become a startup.
- How it appears in the UI.
- What data model it needs.
- What Solana/on-chain piece it needs.
- What can be Devnet-real now.
- What can be simulated honestly.
- How to test it.
- What could go wrong.
- How to make it feel polished.

## 19. Immediate Next Moves

If the goal is no-compromise product quality, the immediate next moves are:

1. Build Universal Receipt Kernel.
2. Rewrite stale public docs so claims match code.
3. Install Solana CLI / SBF toolchain and run Anchor tests.
4. Run end-to-end Devnet seed: program deploy, migrations, Supabase seed, demo card, streaming pact, delivery escrow pact.
5. Make receipt page the signature UX: story, proof inspector, refund/dispute affordance, live status, export.
6. Improve onboarding so the first user action happens fast and clearly.
7. Make public profile and merchant pages feel like real product surfaces.
8. Build developer verification widget and SDK examples.

Do not start another 50-feature expansion before the receipt kernel is universal. That is not shrinking ambition. That is deepening the foundation every future feature needs.

## 20. Final Product North Star

Settle should become the place where:

- Humans can pay anyone and trust the receipt.
- Agents can spend with bounded authority.
- Merchants can accept programmable payments.
- Developers can add verifiable payments in minutes.
- Teams can run programmable treasuries.
- The ecosystem can verify payment history without trusting Settle servers.

The product wins if users can say:

> I do not just see that money moved. I understand why it moved, what rules allowed it, what proof exists, what I can do next, and why I can trust it.

That is Settle.
