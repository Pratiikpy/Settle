# Settle DevNet Product Capability Spec

Last reviewed: 2026-04-30

This document is the operational truth for Settle on DevNet. It is written from the current codebase, not from the older pitch docs.

It answers four questions:

1. What is Settle?
2. What features exist on DevNet right now?
3. How does each feature appear in UX, and what exactly does it not do?
4. Which Solana primitives are actually integrated now, which are partial, and which are deferred to MainNet or later?

---

## 1. Product definition

Settle is a Solana payment app with two tightly-related product surfaces:

- Human payments: send, request, collect, split, escrow, and track payments with handle-based UX.
- AI-agent payments: create scoped spending controls, fund task-level pacts, let an agent spend within those controls, revoke quickly, and verify the resulting receipts.

The core product thesis is not "creator commerce" and not "generic wallet." It is:

> Safe, programmable payments for humans, merchants, teams, and AI agents, with cryptographic receipts and Solana-native settlement.

---

## 2. DevNet status summary

### What is materially real on DevNet

- The Anchor program is real and includes direct spend, pact spend, streaming pact, and delivery escrow modes.
- The main consumer flows exist in the web app.
- Receipt verification is a real SDK capability, not just UI copy.
- Solana Pay references, Blinks/Actions, PDAs, SPL token transfers, and wallet-signed flows are real.
- DevNet is enough to exercise the product's core control plane and core UX.

### What is not fully "done" yet

- The repo still contains placeholder or stale docs that overstate some integrations.
- Some integrations are conditional or optional rather than guaranteed in every flow.
- Some features are intentionally DevNet-limited and become fully real only on MainNet.
- A real deployed program ID and end-to-end runtime verification still depend on deployment and environment configuration.

### Practical conclusion

Settle is close to a strong DevNet-complete version, but the honest line is:

> Core protocol and core UX are real on DevNet. Some integrations are partial, optional, or MainNet-only, so the product should not yet be described as "nothing left except MainNet."

---

## 3. Feature-by-feature product truth

Each feature below lists:

- What it is
- What the user can actually do
- What it explicitly does not do
- How it shows up in UX
- Which Solana primitives it uses
- DevNet status

### F1. Wallet onboarding

- What it is: guided wallet-first onboarding.
- What user can do: connect Phantom, receive devnet funds, create a first AgentCard, then enter the app.
- What it does not do: no full non-wallet onboarding flow today; Privy is wrapped into providers but not the primary product path.
- UX: `/onboarding` is a four-step flow with progress bar and wallet-required actions.
- Solana usage: wallet adapter, devnet SOL airdrop, devnet USDC funding, signed `create_card`.
- DevNet status: real.

### F2. Handle-based payments

- What it is: pay a user via `@handle`.
- What user can do: resolve a handle, send USDC directly, optionally attach a short note.
- What it does not do: no universal social identity layer; handle resolution is limited to Settle directory + optional SNS resolve path.
- UX: `/send` and `/at/[handle]` expose the primary payment CTA.
- Solana usage: Solana Pay-style reference tracking, SPL Token `TransferChecked`, memo for note/reference context, handle resolution helper.
- DevNet status: direct USDC path is real.

### F3. Pay with any token

- What it is: send value from a non-USDC token and settle the receiver in USDC.
- What user can do: on mainnet, build Jupiter swap + send; on devnet, see a real quote and an honest "mainnet only" execution message.
- What it does not do: non-USDC swap execution is not end-to-end on devnet.
- UX: same `/send` page; token picker and quote module adapt by cluster.
- Solana usage: Jupiter quote API, Jupiter swap-instructions API, v0 transaction + lookup tables on mainnet, direct USDC transfer on devnet.
- DevNet status: partial. Quote UX is real; execution is mainnet-only.

### F4. Payment requests

- What it is: merchant/customer payment request using Solana Pay URL + QR.
- What user can do: generate a canonical Solana Pay request with embedded reference and optional memo.
- What it does not do: this is not a full merchant dashboard or full e-commerce engine.
- UX: `/request` shows a request form, QR code, reference pubkey, and share/copy actions.
- Solana usage: Solana Pay URL format, reference key for `getSignaturesForAddress`, SPL USDC mint selection by cluster.
- DevNet status: real.

### F5. Shareable payment links and Blinks

- What it is: URLs that can be shared directly and rendered by Solana Action/Blink-capable clients.
- What user can do: share request/pay/agent flows as action-compatible links.
- What it does not do: not every route is automatically a public social growth feature; registry/unfurl quality still depends on Action registration and client support.
- UX: handle pages, request links, and action routes expose share-first behavior.
- Solana usage: Solana Actions API shape, actions.json mapping, Dialect-compatible action surfaces.
- DevNet status: real, but distribution quality depends on wallet/client support.

### F6. AgentCard

- What it is: parent policy object for agent spending.
- What user can do: create a card with label, daily cap, per-call max, allowlist, expiry, revoke state, and pinned USDC mint.
- What it does not do: the public create-card UX does not yet expose capability pinning input even though the protocol supports it.
- UX: `/cards/new`, `/onboarding`, and `/cards/[id]`.
- Solana usage: Anchor PDA, on-chain policy fields, slot-based cap window, SPL USDC mint pinning.
- DevNet status: real.

### F7. One-shot Pact

- What it is: task-scoped child spending budget funded once and used autonomously by the agent.
- What user can do: open a pact, fund a vault PDA, let the agent spend from that vault without user per-spend signatures, and close it for refund of unspent balance.
- What it does not do: this is not a generic external escrow for arbitrary merchants unless using delivery escrow mode specifically.
- UX: `/agents` opens the pact flow; `/cards/[id]` shows state and revoke/close behavior.
- Solana usage: Pact PDA, Vault PDA, vault ATA, program-signed `TransferChecked`, parent-card daily cap composition.
- DevNet status: real.

### F8. Streaming Pact

- What it is: rate-limited continuous spend/claim flow for agents.
- What user can do: open a streaming pact, accrue entitlement by slot, claim accrued spend, pause/resume, and close with remaining funds left in vault.
- What it does not do: not a polished "subscription SaaS" module; this is an agent-budget primitive.
- UX: `/agents/streaming` exists, but the page itself still signals this flow is less polished than the main one-shot pact flow.
- Solana usage: `PactMode::Streaming`, slot accrual, program-signed claims, parent-card daily-cap updates.
- DevNet status: protocol real, UX not yet as mature as the main pact path.

### F9. Delivery escrow

- What it is: buyer-funded escrow pact with release/dispute windows.
- What user can do: open escrow, release manually, allow timeout-based release, or dispute within window for refund.
- What it does not do: not a generalized dispute-resolution marketplace; merchant and capability are pinned at open time.
- UX: receipt page surfaces refund/dispute state; dedicated claim/escrow routes exist.
- Solana usage: `PactMode::DeliveryEscrow`, vault-funded escrow, buyer release/dispute instructions, deadline slots.
- DevNet status: protocol real.

### F10. Agent spending through x402 proxy

- What it is: off-chain facilitator route that verifies credentials, checks policy, and submits spend transactions.
- What user can do: let an agent pay a merchant/API via a scoped Settle flow rather than raw bearer credentials.
- What it does not do: it is not "fully on-chain business logic"; HTTP policy context and anti-loop checks still live off-chain.
- UX: mostly invisible to the user; visible indirectly through agent flows, live activity, and receipts.
- Solana usage: on-chain spend instructions plus off-chain dual-signature credential verification and transaction submission.
- DevNet status: real.

### F11. Verified merchants

- What it is: merchant verification layer.
- What user can do: transact with merchants that can be checked via SAS or trusted fallback DB.
- What it does not do: guarantee pure on-chain SAS verification in every environment; env completeness matters.
- UX: merchant verification is surfaced through trust language and receipt/decision logic, not as a complex user control panel.
- Solana usage: Solana Attestation Service validation when configured; Supabase verified-merchant fallback when not.
- DevNet status: real but environment-dependent.

### F12. Receipts

- What it is: structured receipt object with on-chain hash commitments and off-chain canonical payloads.
- What user can do: inspect payment result, decision, merchant, amount, hashes, decision slot, and status; verify authenticity.
- What it does not do: give every holder transferable decrypt/refund rights. Current rights stay pinned to the original auth model.
- UX: `/receipts/[requestId]` is a full detail screen with verification, refund/dispute, and live update surfaces.
- Solana usage: on-chain `receipt_hash`, `reason_hash`, `policy_snapshot_hash`, off-chain `purpose_hash`, SDK verification.
- DevNet status: real.

### F13. cNFT receipt enrichment

- What it is: optional compressed NFT receipt or loyalty/pass-style collectible.
- What user can do: receive a cNFT when configured.
- What it does not do: guarantee minting in every deployment; guarantee transferable rights bundle; guarantee Bubblegum V2.
- UX: receipt pages and cNFT metadata routes surface collectible-style receipt presentation.
- Solana usage: Bubblegum compressed NFTs, current code path uses Bubblegum V1 helpers.
- DevNet status: partial/conditional. Real when configured, not universal.

### F14. Voice-note receipt attachment

- What it is: encrypted attachment on top of the receipt.
- What user can do: record and attach a voice note that is encrypted for the intended viewer.
- What it does not do: create transferable rights simply by transferring a cNFT.
- UX: receipt page includes record/playback controls and live attachment updates.
- Solana usage: not an on-chain primitive by itself; it composes with receipt identity and Solana-authenticated access.
- DevNet status: real off-chain feature tied to the Solana-authenticated receipt model.

### F15. Receipt verification

- What it is: deterministic verification of receipt integrity.
- What user can do: verify receipt hash chain publicly via SDK or via the receipt page.
- What it does not do: prove the economic correctness of the upstream service output; it proves receipt integrity and policy commitment integrity.
- UX: receipt and card pages include a verification action.
- Solana usage: public on-chain commitments + SDK recomputation.
- DevNet status: real.

### F16. Revocation and denial ledger

- What it is: on-chain record of revoke and denial outcomes.
- What user can do: revoke a card/pact and see deny/revoke outcomes reflected in the ledger and UI.
- What it does not do: make every possible off-chain business error disappear; it captures the payment decision ledger.
- UX: `/cards/[id]`, `/activity`, and receipts expose this behavior.
- Solana usage: `PolicyDecisionEvent`, revoke events, denial recording, indexer ingest.
- DevNet status: real.

### F17. Live activity feed

- What it is: public stream of payment decisions written by the indexer into Supabase and replayed in UI.
- What user can do: watch ALLOW/DENY/REVOKE events land and inspect amounts/merchants.
- What it does not do: stream raw validator data directly from LaserStream today.
- UX: `/activity`.
- Solana usage: program event logs, WebSocket log subscription, Supabase Realtime.
- DevNet status: real, but current implementation is standard RPC logs, not LaserStream gRPC.

### F18. Public handle profile and follow graph

- What it is: public identity page showing pay CTA, public receipt stats, and follow relationship.
- What user can do: pay a handle, follow a handle, inspect public inbound activity and follower counts.
- What it does not do: act as a full social network or content platform.
- UX: `/at/[handle]`.
- Solana usage: wallet auth for relationship actions; optional SNS resolution; payments route back into Solana payment flows.
- DevNet status: real.

### F19. Split bill

- What it is: organizer creates a bill and shareable settlement page for N payers.
- What user can do: define total and payer count; payers settle their exact share.
- What it does not do: complex group expense management or off-chain bank-style reconciliation.
- UX: `/split-bill` and `/split-bill/[id]`.
- Solana usage: wallet-signed server auth plus underlying payment rail.
- DevNet status: real.

### F20. Collab / multi-party payout surface

- What it is: collaborative payment/payout surface.
- What user can do: interact with a split/collab oriented payment route.
- What it does not do: replace a full treasury system or Squads-native multisig workflow yet.
- UX: `/collab/[id]` and `/agents/collab`.
- Solana usage: built around Solana payments; not yet equivalent to full Squads orchestration.
- DevNet status: present, but not the strongest or most central feature.

### F21. Resolve and SNS lookup

- What it is: resolution layer for handles and optional `.sol` names.
- What user can do: resolve Settle handles, and the code path can attempt SNS-based resolution where applicable.
- What it does not do: guarantee SNS behavior on devnet.
- UX: implicit in send/profile flows.
- Solana usage: Bonfida SNS resolution path.
- DevNet status: partial. SNS is effectively mainnet-oriented.

### F22. Price and oracle helper

- What it is: SOL/USD price helper endpoint.
- What user can do: read current SOL/USD quote in app contexts that need it.
- What it does not do: make Pyth a critical product primitive today.
- UX: mostly internal/supporting.
- Solana usage: Pyth Hermes API.
- DevNet status: real supporting integration.

---

## 4. Solana utilization map

This section answers the specific question: have we used "everything we could" on DevNet?

Short answer: no. You have used a strong subset of the right Solana primitives, but not everything that is theoretically possible. More importantly, not everything that is possible should be added.

### A. Real, meaningful Solana usage in the current code

- Anchor program with PDA-owned state and instruction-based policy enforcement
- Program-derived vault authorities for autonomous agent spend
- SPL Token `TransferChecked`
- Associated Token Account derivation and creation
- Solana Pay references, direct payment URLs, QR flows, transaction-request style flows
- Solana Actions / Blinks routes and action mapping
- On-chain event emission and event-indexed ledger
- Wallet-signed transactions and message auth
- Bubblegum cNFT enrichment path
- SAS merchant-attestation path
- Helius RPC + Sender usage
- Jito submission helper path
- Pyth Hermes helper
- SNS resolution path
- Jupiter swap composition path

### B. Real but conditional / optional / incomplete

- Bubblegum receipt minting: real when configured, not guaranteed in every environment
- Jupiter swap execution: real on mainnet, quote-only on devnet for non-USDC
- Jito bundles: helper exists, but devnet has no Jito block engine path in the same way
- Lighthouse assertions: opt-in hardening, not guaranteed universal invariant
- SAS verification: fully depends on correct env/config and attestation presence
- Privy: provider wrapper exists, but not a dominant product path

### C. Mentioned in docs or marketing, but not currently first-class shipped truth

- Bubblegum V2 specifically
- Helius LaserStream gRPC specifically
- Solana Mobile MWA as an actual wired adapter
- Codama-generated client as the runtime truth
- "full" rights transfer by moving a receipt collectible

---

## 5. What DevNet can prove today vs what MainNet is needed for

### DevNet can prove today

- Real on-chain spending controls
- Real pact funding and autonomous spend
- Real revocation and denial ledger
- Real receipt verification
- Real handle-based send/request UX
- Real delivery escrow and streaming pact primitives
- Real Actions/Blinks surfaces

### MainNet is needed for or materially improves

- Real non-USDC swap execution liquidity via Jupiter
- Real SNS usage in a live user environment
- MainNet-grade Jito path
- Production cNFT tree/collection rollout
- Production merchant verification rollout
- Final external audit posture
- Final production deploy IDs, funded accounts, and monitoring posture

---

## 6. Current concerns

These are the main concerns after audit.

### Concern 1. Docs are behind the code

The codebase is ahead of the public docs. Several docs still describe:

- only six instructions
- Bubblegum V2 as current
- LaserStream as current
- universal Jito-style atomicity as if it were current devnet truth
- stronger Privy/MWA/Codama integration than the product currently exposes

This is fixable, but until fixed, product truth is fragmented.

### Concern 2. Some features are real protocol primitives but weaker UX surfaces

Streaming pact and some advanced flows exist in protocol terms, but not every associated page is polished to the same level as send/request/basic pact flows.

### Concern 3. Placeholder deployment state still matters

The repo still uses placeholder program IDs until the deploy flow patches them. That is correct for source control, but it means "the repo compiles" is not the same as "the devnet deployment is finalized and wired."

### Concern 4. Environment completeness still gates truth

Several features become fully real only when:

- RPC/Helius env is correct
- Supabase migrations are applied
- SAS env is configured
- cNFT infra is configured
- actual program deploy has happened

That is not a design flaw, but it is a real operational dependency.

---

## 7. Recommended truth-language for the team

Use these lines internally and externally:

- "Settle is a Solana payment app for humans and AI agents with scoped spend controls and cryptographic receipts."
- "Core payment control, pact funding, receipt verification, and delivery escrow work on DevNet today."
- "Some integrations are optional or MainNet-only, especially Jupiter swap execution for non-USDC."
- "cNFT receipts are enrichment, not the sole source of rights."
- "Current receipt collectible transfer does not transfer decrypt/refund rights."

Avoid these lines until corrected everywhere:

- "Everything left is only MainNet"
- "Bubblegum V2 is already the shipped path"
- "LaserStream is the current indexer transport"
- "Privy/email/passkey is a finished primary onboarding path"
- "Moving the cNFT transfers the full receipt rights bundle"

---

## 8. Bottom line

Settle has a real DevNet product. The protocol is serious. The payment-control thesis is real. The Solana usage is not superficial.

But the honest state is:

- DevNet core is strong
- some integrations are partial
- some docs still overclaim
- MainNet is not just a formality; it unlocks a few genuinely missing pieces

That is a much stronger position than "half-built," but it is not the same as "absolutely nothing left except flipping the cluster."
