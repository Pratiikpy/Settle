# Settle — Product Specification v0.3

> **What this document is for.** This is the canonical "what does Settle actually do, exactly" reference. Every feature is described with precise IS / IS-NOT scope, the UX surface a user touches, the Solana primitives the feature relies on, and the difference between DevNet and mainnet behavior. Read this end-to-end before building, demoing, or judging.

---

## 0. Executive Summary

**Settle is a consumer payment app for the AI age, built on Solana.**

> **Pitch line:** *Pay anyone. Hire any AI. Trust the receipts.*

Three kinds of users move money through one product:

1. **Consumers** sending money to other people via `@handle` (Venmo-shaped).
2. **Creators / merchants** receiving payments (with a public follower graph + earnings transparency).
3. **AI agents** spending USDC on behalf of a human under cryptographic spend rules (per-call max, daily cap, allowlisted merchants, capability hashes), without the human signing per-spend.

Every payment writes a four-hash commitment chain (BLAKE3) on-chain, so receipts are independently verifiable. Refunds, disputes, streaming agent salaries, and atomic split payments are all real on-chain primitives, not UI tricks.

This v0.3 ships **25 user-visible features** and **2 truly new on-chain primitives** (Streaming Pact, Delivery-Escrow Pact) on top of the v0.2 program (AgentCard + OneShot Pact + Vault). v0.3 also lights up three "next-level" surfaces that depend on existing on-chain state but live entirely off the program: a real-time capability heatmap, soulbound MPL Core reputation badges, and Light Protocol ZK-compressed receipt mirrors.

---

## 1. Core Thesis

**A. Autonomous spend with real custody.** A user funds a Pact's Vault PDA once. An AI agent then signs spend ixs autonomously up to that Pact's cap. The user retains custody — they can `close_pact` at any time and reclaim unspent funds. This is `spend_via_pact` on-chain.

**B. Real-time visible money.** Solana's <1 s finality is treated as UX, not internal nicety. Confetti tiered by amount, sub-400 ms confirm animations, live audience counters, streaming spend timers visible to both sides.

**C. Composable identity.** Receipts are live objects that update post-purchase (refund timer, voice-note attachment, mint state). Follows live in-wallet. Reputation is portable across apps via on-chain attestations + the public capability leaderboard.

---

## 2. Glossary

| Term | Definition |
|---|---|
| **AgentCard** | On-chain PDA storing the user's spend rules: `daily_cap_lamports`, `per_call_max_lamports`, `allowlist`, `expiry_slot`, `revoked`, `usdc_mint` (pinned), `agent_pubkey` (who can sign autonomous spends). Seeds: `[b"agent-card", authority, label_hash]`. |
| **Pact** | On-chain PDA, child of an AgentCard. Holds task-scoped budget. Has a `mode` enum: `OneShot` (capped budget), `Streaming` (per-slot rate), `DeliveryEscrow` (held until release/dispute). Seeds: `[b"pact", parent_card, scope_label_hash]`. |
| **Vault PDA** | On-chain PDA `[b"pact-vault", pact]` that owns the Pact's USDC ATA. The program signs CPIs as this PDA. The vault is what makes per-spend wallet signatures unnecessary. |
| **Capability hash** | BLAKE3 over canonical `{domain, method, path, amount_lamports, version}`. Pins what an agent is paying for. Used in allowlist entries and event commitments. |
| **Receipt hash chain** | Four BLAKE3 hashes committed on every PolicyDecisionEvent: `receipt_hash`, `reason_hash`, `policy_snapshot_hash`, plus the off-chain `purpose_hash` that binds them to HTTP context. |
| **public_feed** | Per-receipt boolean. When `true`, the receipt appears in `/feed`, on `/at/<handle>` profiles, in the capability leaderboard, and triggers follower push fanout. Defaults to `agent_cards.public_feed_default` via a Postgres trigger. |
| **Cluster** | DevNet (default for v0.3) vs Mainnet. Several features (Jupiter swap execution, real DEX liquidity) are honest about being mainnet-only. |

---

## 3. Feature Catalog (F1–F25)

For each feature: precise scope, UX surface, Solana primitives used, DevNet behavior, files to look at.

---

### F1. Confetti calibrated to amount  → **consumer + agent**

**IS:** When a payment confirms, the app fires browser confetti scaled to amount in 4 tiers: *puff* ($0.01–$0.99), *standard* ($1–$4.99), *mid* ($5–$49.99), *takeover* ($50+). The takeover tier triggers a full-screen confetti burst, a haptic pattern (mobile), and a separate "BIG TIP" push to the recipient if `public_feed=true`.

**IS NOT:** Not a backend signal. Not a sound effect by default. Not an animation on the receipt page (separate, via `<TrustGesture>`).

**UX surface:** Triggered from `/send`, `/at/[handle]?req=X` payments, `/collab/[id]`, `/split-bill/[id]`, `/pay/[token]`. Sound is opt-in, off by default.

**Solana primitives:** Reads tx confirmation signal from `Connection.confirmTransaction(... "confirmed")`. No on-chain side.

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/lib/confetti.ts`, `packages/ui/src/trust-gesture.tsx`.

---

### F2. Sub-400 ms trust gesture  → **consumer + agent**

**IS:** A 4-state animation strip on every payment surface: `idle → signing → confirming → success`. Each transition drops a haptic on mobile and shows a slot-anchored elapsed-time readout (e.g., "Confirmed in 0.42 s").

**IS NOT:** Not a progress bar. Not a server-streamed status feed.

**UX surface:** All payment pages render `<TrustGesture state={...}>` near the submit button.

**Solana primitives:** Wall-clock between `signTransaction()` resolution and `confirmTransaction()` resolution. No on-chain commit.

**DevNet vs mainnet:** Identical. Mainnet is typically faster (smaller leader-schedule jitter).

**Files:** `packages/ui/src/trust-gesture.tsx`, `apps/web/lib/confetti.ts::trustGesture()`.

---

### F3. Live audience counter on receipt  → **consumer + agent**

**IS:** On the receipt detail page (`/receipts/[requestId]`), the page subscribes to a Supabase Realtime channel keyed by `request_id`. Live updates fire when: refund-timer ticks, voice-note attachment uploaded, on-chain spend confirmation arrives, cNFT mint completes, pact state changes (release/dispute/pause/claim).

**IS NOT:** Not a count of *viewers*. The "audience" counter is the count of distinct events that have arrived for this receipt during the current session.

**UX surface:** Receipt detail page shows a live status banner ("Pact closed — refund settled on-chain.").

**Solana primitives:** None directly — the source of truth is on-chain events, indexed into Postgres by the indexer, then republished by Supabase Realtime.

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/app/receipts/[requestId]/page.tsx`, `apps/indexer/src/index.ts`.

---

### F4. Refund-by-emoji (😞 → refund)  → **consumer**

**IS:** On any ALLOW receipt detail page where a Pact backs the receipt, a "😞 Refund" button appears. Pressing it builds the right on-chain ix per pact mode and returns it for the buyer's wallet to sign:
- **OneShot / Streaming pact** → `close_pact` (refunds remaining `vault_usdc.amount` to authority).
- **DeliveryEscrow pact, before `dispute_deadline_slot`** → `dispute_delivery_escrow` (refunds full vault to buyer; sets `refunded=true`; closes pact).
- **DeliveryEscrow pact, after deadline** → returns `mode: "not_refundable"` with a clear error.
- **Direct-spend receipt (no pact)** → returns `mode: "not_refundable"` with "contact merchant directly" message.

**IS NOT:** Not a chargeback mechanism. Not a partial refund.

**UX surface:** Receipt detail page → emoji button → wallet signs → toast confirms.

**Solana primitives:** `close_pact` ix for OneShot/Streaming. `dispute_delivery_escrow` ix for escrow within window. Vault PDA signs the CPI TransferChecked.

**DevNet vs mainnet:** Identical (assumes program deployed to the active cluster).

**Files:** `apps/web/app/api/receipts/[requestId]/refund/route.ts` (mode-routing), `apps/web/app/receipts/[requestId]/page.tsx`.

---

### F5. Voice-note receipt attachments  → **consumer + agent**

**IS:** On a receipt detail page, the recipient can record up to 10 seconds of audio. The audio is sealed-box encrypted in-browser to the per-deployment `SETTLE_SEALED_BOX_PUBKEY` (X25519 + XChaCha20-Poly1305 via @noble/ciphers). Ciphertext is uploaded to Supabase Storage. Metadata row written to `receipt_attachments` table. On playback, the server-side `/play` endpoint authenticates the caller via wallet signature, decrypts using the deployment privkey, streams audio bytes back.

**IS NOT:** Not transcribed. Not played back without wallet-sig auth. Not transferable via cNFT transfer (rights pinned to original receipt recipient pubkey — by design, per Codex round-2 review).

**UX surface:** Receipt page voice recorder + player. Mic indicator turns on/off cleanly. Browser support: MediaRecorder with audio/webm-opus preferred, audio/mp4 fallback for Safari.

**Solana primitives:** None on-chain. Storage is Supabase. Trust model is server-decryption-gated-by-wallet-sig — the user's wallet pubkey gates access.

**DevNet vs mainnet:** Identical. Both use the same sealed-box keys per deployment.

**Files:** `apps/web/lib/voice-note.ts`, `apps/web/app/api/receipts/[requestId]/attachments/route.ts`, `apps/web/app/api/receipts/[requestId]/attachments/[attachmentId]/play/route.ts`. Migration `0008_receipt_attachments.sql`.

---

### F6. Live receipt object (status + state badges)  → **both**

**IS:** Receipt detail page renders mode-aware blocks: pact state badge ("OneShot · Open" / "Streaming · Live" / "Streaming · Paused" / "DeliveryEscrow · Held — awaiting confirm or dispute" / "Released to merchant" / "Refunded to buyer"), refund timer (for time-windowed pacts), attachment list, hash-chain inspector.

**IS NOT:** Not editable. The receipt is read-only after the on-chain event fires.

**UX surface:** `/receipts/[requestId]`.

**Solana primitives:** Reads the on-chain Pact account via `decodePact` (Anchor account decoder). Reads `vault_usdc.amount` for live balance.

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/app/receipts/[requestId]/page.tsx`, `apps/web/lib/account-decoder.ts`.

---

### F7. Universal Blink router  → **both**

**IS:** A single endpoint `/api/actions/router/[handle]/[type]` returns a Solana Actions response (per Solana Actions Spec) for type ∈ {`tip`, `pay`, `request`, `hire`, `fund`, `revoke`}. GET returns `ActionGetResponse` (icon, title, description, label, links). POST returns `ActionPostResponse` with the unsigned base64 tx. Registered in `/.well-known/actions.json` with wildcard rules `/at/{handle}`, `/qr/{merchant}/{slug}`, `/pay/{token}` so a Phantom user pasting a Settle URL into X / Discord / Telegram sees an inline pay button.

**IS NOT:** Does not host the click flow itself — Phantom-in-X renders. Not a marketing redirector.

**UX surface:** Phantom Blink rendered inline anywhere a Solana Pay URL is pasted.

**Solana primitives:** Solana Actions / Blinks (Dialect Actions Registry compatible). Solana Pay reference pubkey embedded in every built tx for tracking.

**DevNet vs mainnet:** Identical mechanism. DevNet Phantom renders Blinks; mainnet does too. The actions.json `chains` field includes both clusters when configured.

**Files:** `apps/web/app/api/actions/router/[handle]/[type]/route.ts`, `apps/web/app/.well-known/actions.json/route.ts`.

---

### F8. Handle as Venmo request  → **both**

**IS:** `settle.so/at/<handle>?req=20&note=pizza` renders the recipient profile page with an inline "Pay $20 — pizza" CTA. Same URL pasted into X renders as a Phantom Blink (uses the actions.json router). Recipient sees the payment in their `/feed` and (if `public_feed=true`) on their profile.

**IS NOT:** Not a payment-link table entry. Not a one-time-use link. The URL is shareable forever.

**UX surface:** Profile page top section.

**Solana primitives:** Solana Actions / Blinks. SPL Token TransferChecked for the actual transfer. Solana Pay reference pubkey embedded for the recipient's tx-correlation lookup.

**DevNet vs mainnet:** Identical (USDC mint differs per cluster).

**Files:** `apps/web/components/handle-pay-cta.tsx`, `apps/web/app/at/[handle]/page.tsx`.

---

### F9. Self-repricing QR (Solana Pay transaction-request)  → **merchant**

**IS:** Each merchant pricelist slug exposes `/qr/<merchant>/<slug>` as a Solana Pay transaction-request URL. When a buyer scans, their wallet POSTs to `/api/sp/<merchant>/<slug>` which returns a freshly built tx with current price, current recipient ATA, current memo. Merchant updates the price in their pricelist; QR re-prices automatically.

**IS NOT:** Not a transfer-request URL (which is static). Not a permanent QR — paused/deleted slugs return a 410.

**UX surface:** Merchant generates a QR via `/qr/<merchant>/<slug>` page; buyer scans with Phantom or any Solana Pay wallet.

**Solana primitives:** **Solana Pay transaction-request URL** (`solana:https://...` with HTTPS endpoint). Server returns base64-serialized tx + label + message. SPL Token TransferChecked + memo program for the on-chain payment. Reference pubkey embedded.

**DevNet vs mainnet:** Identical mechanism. DevNet uses devnet USDC mint.

**Files:** `apps/web/app/api/sp/[merchant]/[slug]/route.ts`, `apps/web/app/qr/[merchant]/[slug]/page.tsx`.

---

### F10. Pre-paid one-time-use payment links  → **merchant**

**IS:** Merchant creates a payment link with a fixed amount + label. Returns a token URL `settle.so/pay/<token>`. The first buyer who claims the token completes the on-chain transfer; further claim attempts return 409 Already Claimed. Atomicity is enforced via `UPDATE merchant_payment_links SET claimed_at=now() WHERE token=$1 AND claimed_at IS NULL` returning row-count > 0.

**IS NOT:** Not a Pact (no on-chain "single-use" enforcement; off-chain via DB row-lock). Not refundable post-claim — once on-chain, F4 path applies.

**UX surface:** Merchant `/api/payment-links` POST → token URL. Buyer `/pay/<token>` page → wallet signs → claim.

**Solana primitives:** SPL Token TransferChecked. Solana Pay reference pubkey.

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/app/api/payment-links/route.ts`, `apps/web/app/api/payment-links/[token]/route.ts`, `apps/web/app/pay/[token]/page.tsx`. Migration `0010_payment_links.sql`.

> **Note:** The plan also called for a `single_use` flag on the OneShot pact mode (P2 in the plan). That on-chain enforcement is **deferred to V0.4** because P1 + P9 cover the demo budget. The off-chain DB-row enforcement in this feature is the V0.3 implementation.

---

### F11. Pre-connect USDC balance preview  → **consumer**

**IS:** On `/claim/<escrow>` and `/pay/<token>` pages, the buyer's USDC balance is shown *before* connecting a wallet — using a public RPC `getTokenAccountBalance` against the publicly-known recipient ATA. Reduces "do I have enough?" friction.

**IS NOT:** Not personalized for the connected wallet (since not connected yet). Just shows the recipient's expected USDC delivery context.

**UX surface:** Claim/pay pages above the connect button.

**Solana primitives:** RPC `getTokenAccountBalance`. SPL Token ATA derivation.

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/app/claim/[escrow]/page.tsx`, `apps/web/app/pay/[token]/page.tsx`.

---

### F12. Pay with any token (Jupiter)  → **consumer**

**IS:** On `/send`, the buyer can pick any token from their wallet via `<TokenPicker>`. Three execution modes (returned by `/api/swap/quote-and-build`):
- **`direct_usdc`** → buyer is paying USDC. Standard `TransferChecked` + Solana Pay reference. Works on devnet AND mainnet.
- **`jupiter_swap`** → buyer is paying non-USDC. Server fetches Jupiter v1 quote + swap-instructions. Composes one v0 versioned tx: `[computeBudget ix] + [optional CreateATA(recipient USDC ATA)] + [Jupiter setupInstructions] + [Jupiter swapInstruction] + [Jupiter cleanupInstruction] + [memo with reference]`. Uses Jupiter-provided Address Lookup Tables. Output ATA is the recipient's USDC ATA via Jupiter's `destinationTokenAccount` parameter. **Works on mainnet only** — Jupiter has no devnet liquidity.
- **`mainnet_only`** → buyer is paying non-USDC on devnet. Server returns a live quote (best-effort; informational only) + a clear "swap activates on mainnet" message. UI disables the submit button.

**IS NOT:** Not a generic swap UI. Not a multi-hop bridge. Not Token-2022 transfer-hook tokens (Jupiter's default routing rejects those without explicit token-badge).

**UX surface:** `<TokenPicker>` dropdown showing user's SPL balances (Token + Token-2022 programs both enumerated, USDC pinned at top, then SOL, then by amount). Live quote panel with price impact + route. Clear devnet banner when applicable.

**Solana primitives:** Jupiter Lite API (quote + swap-instructions). SPL Token + Token-2022 program IDs (read-only enumeration). **Address Lookup Tables (ALT)** — fetched from Jupiter's response and passed to `TransactionMessage.compileToV0Message(lookupTables)`. **Versioned transactions (v0)**.

**DevNet vs mainnet:** USDC sends work on both. Multi-token swap activates on mainnet only — explicitly surfaced in UI.

**Files:** `apps/web/app/api/swap/quote-and-build/route.ts`, `apps/web/components/token-picker.tsx`, `apps/web/lib/jupiter.ts`, `apps/web/lib/token-balances.ts`, `apps/web/app/send/page.tsx`.

---

### F13. Streaming pact open + claim  → **agent + consumer**

**IS:** Authority signs `open_streaming_pact(rate_lamports_per_slot, max_total_lamports, allowlist, expiry_slot)`. Vault is funded with `max_total_lamports` atomically in the same ix. Subsequently the agent (= `card.agent_pubkey`) signs `claim_streaming` ixs to draw entitlement. Entitlement formula:

```
elapsed = current_slot - last_claim_slot
total_paused = pause_accumulated_slots + (now − pause_started_slot if currently paused)
billable_slots = elapsed − total_paused
amount = min(billable_slots × rate, max_total_lamports − claimed)
```

Per-claim limits: also bounded by `card.per_call_max_lamports`. Daily limits: every claim updates parent `card.used_today` (cross-pact daily cap stays enforced — a streaming pact and a OneShot pact on the same card cannot jointly exceed the parent's daily cap).

After claim: `claimed += amount`, `last_claim_slot = now_slot`, `pause_accumulated_slots = 0`. If still paused at claim time, `pause_started_slot ← now_slot` so subsequent paused time accrues fresh (no retro-billing).

**IS NOT:** Not a Streamflow integration. Not real-time on-chain payouts every slot — it's pull-based: the agent (or a server cron) calls `claim_streaming` to actualize accrued entitlement.

**UX surface:** `/agents/streaming` lists active streams with a 1 Hz client tick estimating accrued $/sec, a Pause/Resume button, claimed/max progress bar.

**Solana primitives:** Anchor-managed `Pact` PDA in the new `Streaming` mode. Vault PDA + USDC ATA. `claim_streaming` ix uses `Clock::get()?.slot` and the `CAP_WINDOW_SLOTS = 220_000` (≈ 24 h) for daily reset.

**DevNet vs mainnet:** Identical. Localnet/devnet slot times drift slightly (~400 ms) — UI estimate uses a `SLOT_MS = 400` constant which is close enough for the visual tick.

**Files:** Anchor program: `programs/.../instructions/{open_streaming_pact, claim_streaming}.rs`, `state.rs::PactMode::Streaming`. Web: `apps/web/lib/anchor-client.ts::{openStreamingPactIx, claimStreamingIxWithAtas}`, `apps/web/app/agents/streaming/page.tsx`, `apps/web/app/api/streaming-pacts/{open,[id]/claim}/route.ts`. Migration `0011_streaming_pacts.sql`.

---

### F14. One-tap pause / resume / cancel-with-pro-rata-refund  → **agent + consumer**

**IS:** Authority taps "Pause" on a streaming pact card. `pause_streaming` ix sets `paused=true` and stamps `pause_started_slot = now`. Idempotent. "Resume" closes the pause window into `pause_accumulated_slots`. "Cancel" calls `close_pact` which refunds `vault_usdc.amount = max_total − claimed` to the authority's USDC ATA on-chain.

**IS NOT:** Not a partial reduction. Cancel is full close. Pause does NOT refund — it just stops accrual.

**UX surface:** `<StreamingCard>` on `/agents/streaming` has a single Pause/Resume button. Cancel routes through F4 (refund button on receipt detail).

**Solana primitives:** `pause_streaming`, `resume_streaming`, `close_pact` ixs. All authority-signed.

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/app/api/streaming-pacts/[id]/{pause,resume}/route.ts`, `apps/web/app/agents/streaming/page.tsx`. Anchor: `programs/.../instructions/{pause_streaming, resume_streaming}.rs`.

---

### F15. Wallet-aware profile page  → **both**

**IS:** When a wallet is connected and viewing `/at/<handle>` (and not their own profile), the page fetches `/api/handles/<handle>/relationship` (wallet-sig-auth gated) and renders a small block: "You've sent **$X** to @handle across **N** payments. (You're following them.)" The total comes from receipts where `merchant_pubkey = handle.pubkey AND card_pubkey IN (caller's cards) AND decision = 'ALLOW'`.

**IS NOT:** Not a public block — only the connected wallet sees their own relationship. A stranger reading the page sees nothing here.

**UX surface:** Above the public-spend stats on `/at/[handle]`.

**Solana primitives:** Wallet-signature auth (Ed25519 over canonical message + Upstash-stored nonce, 5-min TTL). No on-chain side.

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/app/api/handles/[handle]/relationship/route.ts`, `apps/web/app/at/[handle]/page.tsx`.

---

### F16. Save creator/agent to fan list (Follow)  → **both**

**IS:** Tap "Follow" on a handle profile. `POST /api/follows/<handle>` (wallet-sig auth) inserts a row into the `follows` table with `follower=auth.pubkey`, `following=resolved_pubkey`, `push_on_receipt=true`. When the followed pubkey receives a public_feed receipt, the proxy/persistReceipt path fans out a Web Push notification to every follower with `push_on_receipt=true`. Push delivery is best-effort (errors per-subscription swallowed; the receipt write isn't blocked).

**IS NOT:** Not a content subscription. Not a paid follow. Self-following is rejected at DB constraint (`follower_pubkey <> following_pubkey`).

**UX surface:** `<FollowButton>` on `/at/[handle]` with optimistic state flip + revert on error. Public follower count badge next to the button (anyone can read it — RLS lets follows be select-public).

**Solana primitives:** None on-chain. RFC 8291/8292 Web Push (hand-rolled VAPID signing in `apps/web/lib/web-push.ts`).

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/app/api/follows/[handle]/{,stats}/route.ts`, `apps/web/components/follow-button.tsx`, `apps/web/app/api/x402/proxy/[merchant]/route.ts::persistReceipt` (fanout trigger). Migration `0012_follows.sql`.

---

### F17. Public capability leaderboard  → **agent-primary**

**IS:** `/leaderboard` index lists top capability hashes by total volume. `/leaderboard/<capabilityHash>` ranks merchants serving that capability with: total volume, completion count, **avg total latency (ms)** (proxy entry → receipt persistence — the user-visible feel), **avg merchant latency (ms)** (upstream-call only — defensible "merchant speed" metric), unique users, last used. Both latencies come from server-clock timestamps captured in the same proxy process (no clock drift). Pre-P10 receipts (NULL timing) are excluded honestly via `filter (where ... is not null)` — never zero-imputed.

**IS NOT:** Not a price comparison. Not a review system. Capability hash is `BLAKE3(canonical{domain,method,path,amount_lamports,version})` — two different services with different canonicals get different hashes and thus separate leaderboards.

**UX surface:** Two pages plus a public API. Linkable per-capability.

**Solana primitives:** None on-chain. PostgreSQL views `capability_leaderboard` and `capability_leaderboard_summary` over the `receipts` table. `decision = 'ALLOW' AND public_feed = true` is the visibility gate.

**DevNet vs mainnet:** Identical query shape; mainnet just has more rows. The capability hash is cluster-agnostic by construction (no cluster-specific bytes in the canonical).

**Files:** `apps/web/app/leaderboard/{page.tsx,[capabilityHash]/page.tsx}`, `apps/web/app/api/leaderboard/{route.ts,[capabilityHash]/route.ts}`. Migrations `0013_request_timing.sql` (timing columns), `0014_capability_leaderboard.sql` (views).

---

### F18. Public earnings transparency  → **both**, opt-in

**IS:** When viewing `/at/<handle>/profile`, an "Earnings" block renders with: lifetime earned (sum of `amount_lamports` where `merchant_pubkey = handle.pubkey AND decision = 'ALLOW' AND public_feed = true`), last-30-days earned (same with `created_at >= now() - 30d`), top sender count (distinct `card_pubkey`s sending to this handle). Block only renders when lifetime > 0.

**IS NOT:** Not a forced disclosure — visibility is gated by the *buyer's* `public_feed` choice (per-card default in `agent_cards.public_feed_default`). Recipients can't unilaterally hide flow that buyers chose to publish; recipients can only choose how to display it (this block is opt-in via card setting).

**UX surface:** Earnings card on `/at/[handle]` between profile header and public activity feed.

**Solana primitives:** None on-chain. Aggregations over the `receipts` table.

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/app/api/handles/[handle]/profile/route.ts` (earnings block in response), `apps/web/app/at/[handle]/page.tsx`.

---

### F19. Tap-to-pay from screenshot  → **consumer-primary**

**IS:** On `/send`, a small drop-zone above the form accepts an image: drag-and-drop, paste-from-clipboard, or click-to-pick. The image is decoded client-side via **jsQR** to extract the QR contents. The contents are parsed via `@solana/pay::parseURL`. If parse succeeds and the URL is a transfer-request, the form auto-fills: recipient, amount, memo. If the URL is a transaction-request, an info toast surfaces the link (form not auto-filled because tx-requests need a wallet → fetch flow that is bigger than `/send`).

**IS NOT:** Not OCR. Not an image upload to the server. Not a multi-QR scanner. Camera-capture from the device is not in v0.3 (mobile-only, deferred).

**UX surface:** A small dashed-border tap target above the send form: "Tap-to-pay from screenshot · Drop a Solana Pay QR image, paste from clipboard, or click to pick a file."

**Solana primitives:** Solana Pay URL parser. No on-chain side from the screenshot itself; once parsed, the standard `/send` flow takes over (which goes through `/api/swap/quote-and-build`).

**DevNet vs mainnet:** Identical client-side. Once the form submits, the standard mode-routing applies (USDC works on both; non-USDC mainnet-only).

**Files:** `apps/web/lib/screenshot-pay.ts`, `apps/web/components/screenshot-dropzone.tsx`, `apps/web/app/send/page.tsx`. Dep: `jsqr@^1.4.0`.

---

### F20. Two-tap collab payment  → **both**

**IS:** Creator A + Creator B agree off-chain on a split (basis points: e.g., 5000 = 50/50). One of them creates a collab via `POST /api/collabs` (wallet-sig auth as `organizer_pubkey`). The collab gets a UUID; a shareable link `/collab/<id>` lets buyers pay any amount. The buyer's tx contains **two TransferChecked ixs in one tx**:
1. `amount × ratio_bps_a / 10000` → creator A's USDC ATA.
2. `amount − part_a` → creator B's USDC ATA.

Atomicity is guaranteed by being a single Solana tx — both creators are paid or neither is. If either creator's ATA doesn't exist, a CreateATA ix is prepended (buyer pays rent).

**IS NOT:** Not on-chain pact-state-tracked (no collabs Pact mode). Not adjustable post-creation. Not three-way (V1 is exactly two creators); >2 creators deferred to V2.

**UX surface:** `/agents/collab` (organizer hub with ratio slider + label form). `/collab/<id>` (buyer-facing pay page with split preview).

**Solana primitives:** SPL Token TransferChecked × 2 in one Solana tx (atomic). Solana Pay reference embedded on the first transfer.

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/app/api/collabs/{,[id]/{route,pay/route}}.ts`, `apps/web/app/agents/collab/page.tsx`, `apps/web/app/collab/[id]/page.tsx`. Migration `0016_collabs_and_split_bills.sql`.

---

### F21. Split bill QR  → **consumer**

**IS:** Organizer creates a bill via `POST /api/split-bills` (wallet-sig auth) with `target_total_lamports`, `n_payers`, `label`. Server computes `per_payer_lamports = ceil(target / n_payers)` and stores. Bill gets a UUID + shareable link `/split-bill/<id>`. Each payer who scans/visits sees their per-payer share, signs one tx (TransferChecked + memo `settle-split:<bill_id>` + Solana Pay reference) sending exactly `per_payer_lamports` to the organizer's USDC ATA. After on-chain confirmation, client POSTs to `/api/split-bills/[id]/confirm` with the tx signature; server RPC-verifies the tx, asserts the claimed payer is among the signers, inserts a row into `split_bill_payments`. Composite-key `(bill_id, payer_pubkey)` blocks double-pay. When `count(split_bill_payments) >= n_payers`, the bill is auto-marked `completed_at`.

**IS NOT:** Not a Pact (no on-chain "bill" object). Not retroactively editable. Doesn't enforce equal payments — last payer absorbs any rounding from the ceiling-divide.

**UX surface:** `/split-bill` (organizer create page). `/split-bill/<id>` (buyer pay + Realtime live progress: payer count, "$X collected so far", payer pubkey list with Solscan links).

**Solana primitives:** SPL Token TransferChecked + Memo program. Solana Pay reference. Server-side tx verify via `connection.getTransaction(sig).message` → assert `payer ∈ signerKeys`.

**DevNet vs mainnet:** Identical.

**Files:** `apps/web/app/api/split-bills/{route,[id]/{route,pay/route,confirm/route}}.ts`, `apps/web/app/split-bill/{page.tsx,[id]/page.tsx}`.

---

### F22. Buy-now-pay-on-delivery escrow  → **consumer**

**IS:** Buyer signs `open_delivery_escrow(amount, merchant, capability_hash, confirm_deadline_slot, dispute_deadline_slot, expiry_slot)`. Pact created in `DeliveryEscrow` mode; vault funded with `amount` atomically. State machine:

| Action | Caller | Window | Effect |
|---|---|---|---|
| `release_delivery_escrow` (buyer-confirm) | buyer = `pact.authority` | any time before close | vault → merchant USDC ATA; `released = true`; pact closes. |
| `release_delivery_escrow` (permissionless) | anyone | after `confirm_deadline_slot` | vault → merchant USDC ATA; `released = true`; pact closes. |
| `dispute_delivery_escrow` | buyer only | before `dispute_deadline_slot` | vault → buyer USDC ATA; `refunded = true`; pact closes. |

**Constraints (all enforced on-chain):**
- Merchant pubkey is **pinned at open** in the variant payload. `release_delivery_escrow` rejects if `merchant_usdc.owner != pinned_merchant`. Permissionless release is therefore safe — a stranger calling release after the deadline cannot redirect funds.
- `confirm_deadline_slot ≤ dispute_deadline_slot` enforced at open.
- Double-release / double-refund / dispute-after-window all reject with distinct errors.
- A permissionless cron worker (`apps/indexer/src/escrow-cron.ts`) polls Postgres for past-deadline pending escrows and fires release on the buyer's behalf — a thin client of the existing `/api/escrows/[id]/release` endpoint, signed with `SETTLE_ESCROW_CRON_PRIVKEY`.

**IS NOT:** Not a generic escrow. Not a multi-merchant escrow. Not a partial release (full `vault_usdc.amount` moves). The pact's `expiry_slot` from the parent card is honored; the indexer mirror uses `dispute_deadline_slot` as the conservative `expiry_slot` for the row (the on-chain Pact has its own expiry).

**UX surface:** `<EscrowState>` component on `/receipts/[requestId]` shows the right action button per state: "I received it — release to merchant" + "Dispute (refund)" for the buyer pre-deadline; "Permissionless release" for any other wallet post-deadline; collapse to "Released to merchant ✓" / "Refunded to buyer ✓" terminal panels.

**Solana primitives:** New `PactMode::DeliveryEscrow` Anchor variant (3 ixs). Vault PDA's USDC ATA. Anchor `address`-constraint on `pact.authority` for the dispute path; runtime caller-vs-authority check for the release path's dual-caller pattern.

**DevNet vs mainnet:** Identical.

**Files:** Anchor: `programs/.../instructions/{open_delivery_escrow, release_delivery_escrow, dispute_delivery_escrow}.rs`, `state.rs::PactMode::DeliveryEscrow`. Web: `apps/web/lib/anchor-client.ts::{openDeliveryEscrowIx, releaseDeliveryEscrowIx, disputeDeliveryEscrowIx}`, `apps/web/components/escrow-state.tsx`, `apps/web/app/api/escrows/{open,[id]/{release,dispute}}/route.ts`. Cron: `apps/indexer/src/escrow-cron.ts`. Migration `0015_delivery_escrow.sql`.

---

### F23. Capability heatmap (live market view)  → **merchant + consumer**

**IS:** A real-time grid on `/leaderboard` showing the last 60 seconds of public_feed ALLOW receipts, grouped by `capability_hash`. Each cell pulses (Framer Motion scale + opacity) on every new matching receipt. Cells decay out as their receipts slide past the rolling window. The browser tab title shows the live count (`(N) Settle`) so the page advertises activity even when backgrounded. Above the all-time leaderboard, the heatmap acts as a "live now" surface — judges and buyers see ongoing activity without waiting.

**IS NOT:** Not server-side aggregation (no Postgres view, no pre-computed bucket). Not a per-merchant view (use `/at/[handle]` for that). Not a historical chart — strictly the rolling 60 s window. Not gated by auth — the data is public_feed-only by definition.

**UX surface:** `<CapabilityHeatmap>` mounted on `/leaderboard` directly above the all-time top list. Append `?simulate=1` to the URL to inject synthetic receipts every ~700 ms — judges and demo videos see the heatmap pulse on a fresh devnet without needing real traffic. Each cell shows a truncated capability hash (first 8 chars) and the count; clicking it deep-links to `/leaderboard/[capabilityHash]`.

**Solana primitives:** Reads only — no on-chain side. Subscribes via Supabase Realtime to the `receipts` table filtered to `decision='ALLOW' AND public_feed=true`. Sliding-window aggregation runs entirely in the browser: a `Map<capabilityHash, { count, lastSeen }>` purged every animation frame.

**DevNet vs mainnet:** Identical. On a fresh devnet without traffic, use `?simulate=1` for demos.

**Files:** `apps/web/components/capability-heatmap.tsx` (340 LOC, fully self-contained), `apps/web/app/leaderboard/page.tsx`.

---

### F24. Soulbound reputation badges (MPL Core)  → **consumer + agent**

**IS:** Six on-chain achievements automatically minted to a user's wallet when they cross a threshold of real on-chain activity. Each badge is an MPL Core asset created with the `PermanentFreezeDelegate` plugin (`frozen: true` at create time) — non-transferable, non-burnable, true SBT semantics enforced by the MPL Core program. Badges:

| Kind | Threshold |
|---|---|
| 🏁 First Payer | First ALLOW receipt to any merchant |
| 🧠 Polymath | Paid 5+ distinct capability hashes |
| ⚡ High-Frequency Operator | 100+ ALLOW receipts lifetime |
| 🌊 Long Streamer | Active streaming pact for 30+ days |
| ⚖ Honest Disputer | First successful `dispute_delivery_escrow` within window |
| 📡 Public Spender | First `public_feed=true` receipt |

A worker cron polls Postgres every 5 minutes for `(user_pubkey, badge_kind)` pairs not yet in `reputation_badges`, mints, and inserts. Idempotent via a unique `(user_pubkey, badge_kind)` constraint — duplicate-mint impossible.

**IS NOT:** Not a fungible loyalty point. Not a level system. Not editable post-mint (the catalogue can grow, but the asset metadata of an issued badge is fixed). Not a competition between users — every user can earn every badge. Not a profile-page-only artifact: the asset shows up in the user's Phantom wallet and on Solscan because the recipient *is* the asset's owner; the freeze plugin only blocks transfer, not ownership.

**UX surface:** `<ReputationBadges>` card on `/at/[handle]` between the profile header and Public Activity. The card hides itself entirely when the user has zero badges (no "no achievements yet" empty state — too noisy on fresh profiles). Each badge tile shows the emoji on a radial-gradient swatch, the spec name, threshold sentence, "Earned X ago", and a Solscan link to the asset address so judges can verify the `PermanentFreezeDelegate` plugin is real. Push notification fan-out fires on unlock via the cron → `/api/internal/push` (Bearer auth) → web app's existing VAPID delivery — same path follower-fanout uses.

**Solana primitives:** **MPL Core** (`@metaplex-foundation/mpl-core` v1) `create()` ix with `PermanentFreezeDelegate` plugin in V2 plugin-args shape (`{ type: "PermanentFreezeDelegate", frozen: true }` — args spread, not nested under `data`). No collection — each badge is a standalone asset, slightly higher rent in exchange for zero collection-management overhead. Metadata is a `data:application/json;base64,...` URI with inline SVG (radial-gradient + emoji + name) so the badge renders in 5 years even if every off-chain CDN is dead.

**DevNet vs mainnet:** Identical mechanism. Devnet requires the operator to run `pnpm badge:keygen`, fund the printed pubkey with ~1 SOL, and start `pnpm --filter @settle/indexer dev:badge-cron`.

**Files:** Catalogue (shared by web UI + cron, no MPL Core dep): `packages/types/src/badges.ts`. Mint helper (server-only): `apps/indexer/src/badges-mint.ts`. Cron: `apps/indexer/src/badge-cron.ts`. Web API: `apps/web/app/api/handles/[handle]/badges/route.ts`. UI: `apps/web/components/reputation-badges.tsx`, wired into `apps/web/app/at/[handle]/page.tsx`. Push fan-out endpoint: `apps/web/app/api/internal/push/route.ts`. Keygen: `scripts/badge-keygen.ts`. Migration: `0017_reputation_badges.sql`.

---

### F25. ZK-compressed receipt mirror (Light Protocol)  → **consumer + agent**

**IS:** Every ALLOW receipt earns a secondary on-chain mirror — a 1-unit transfer of the `SETTLE_RECEIPT` compressed-token mint to the buyer's wallet authority. Cost per mirror: ~$0.001/account vs ~$0.00204 for a regular Solana account (~5,000× cheaper at scale on mainnet). Indexed by Photon RPC (bundled in the Helius endpoint) so any Light Protocol-aware explorer can query a buyer's full receipt history via `getCompressedTokenAccountsByOwner` without ever talking to Settle's database. The on-chain 4-hash commit chain on the original `sig_solscan` remains the canonical proof; the compressed-token mirror is a cheaper, queryable secondary record.

**IS NOT:** Not the canonical receipt — that's the BLAKE3 4-hash chain on the `PolicyDecisionEvent`. Not a transferable token in any meaningful sense (it's 1 unit of decimals=0; transferring it doesn't transfer money or rights). Not synchronous — the buyer's payment never blocks on Light Protocol RPC. Not retroactive past the migration — receipts created before the cron started running stay `compressed_sig=NULL` forever (a future backfill could fill them; intentionally out of scope).

**UX surface:** A violet "ZK Compressed receipt" card on `/receipts/[requestId]` (beneath the submission_method badge, above the back-link footer). Renders only when `compressed_sig` is set. Shows the compressed mint pubkey and a Solscan link to the mintTo tx. Tagline: "Light Protocol · ~$0.001". The receipts page Realtime subscription means the card materializes live as compress-cron processes the row — judges who pay during the demo see the card appear on their open page within ~30 s.

**Solana primitives:** **Light Protocol compressed-token program** (`@lightprotocol/compressed-token` v1 legacy API, the same one the official `light` CLI uses). `mintTo(rpc, payer, mint, recipient, authority, 1)` with the buyer's wallet authority as recipient. **Photon RPC** (Light Protocol's compressed-account indexer) bundled in the Helius `https://devnet.helius-rpc.com/?api-key=...` URL — passed as both the JSON-RPC and compression endpoint to `createRpc()` from `@lightprotocol/stateless.js`.

**DevNet vs mainnet:** Identical mechanism. Devnet requires: `pnpm zk:keygen`, airdrop ~1 SOL, `pnpm zk:mint-setup` (one-time createMint), `pnpm --filter @settle/indexer dev:compress-cron`. A Helius API key is required because Photon RPC is bundled into Helius — `clusterApiUrl()` does not serve compressed-account queries.

**Files:** Helper module: `apps/indexer/src/zk-compression.ts` (loadZkReceiptConfig, buildLightRpc, mintCompressedReceipt). Cron: `apps/indexer/src/compress-cron.ts`. Setup scripts: `scripts/zk-receipt-keygen.ts`, `scripts/zk-receipt-mint-setup.ts`. API surface: existing `apps/web/app/api/receipts/[requestId]/route.ts` returns `compressed_sig` + `compressed_addr` columns. UI: violet card section in `apps/web/app/receipts/[requestId]/page.tsx`. Migration: `0018_compressed_receipts.sql` (adds `compressed_sig`, `compressed_addr` + partial index on pending rows).

---

## 4. Architectural Primitives (P1–P13)

Concrete behind-the-scenes mechanisms that multiple features lean on.

### P1. Streaming Pact (on-chain, NEW in v0.3)
- New `Streaming` variant on `PactMode` enum.
- 4 new ixs: `open_streaming_pact`, `claim_streaming`, `pause_streaming`, `resume_streaming`.
- 3 new events: `StreamingPactOpenedEvent`, `PactStreamClaimEvent`, `PactStreamPauseEvent`.
- Slot accounting: pause split into `pause_started_slot` + `pause_accumulated_slots` so claims correctly subtract paused time without retro-charging the just-claimed period.
- Powers F13, F14.

### P2. Single-Use Pact (DEFERRED to V0.4)
- Plan called for a `single_use: bool` + `consumed: bool` flag on the OneShot variant. Implementing the same enforcement off-chain via the F10 `payment_links` table for V0.3.

### P3. Voice-note attachments (off-chain)
- Sealed-box (X25519 + XChaCha20-Poly1305) ciphertext in Supabase Storage. Server decrypts on `/play` after wallet-sig auth.
- Powers F5.

### P4. Live receipt channel (off-chain)
- Supabase Realtime subscription keyed by `request_id`.
- Powers F3, F6, plus pact-state and split-bill live updates.

### P5. Universal Blink router (off-chain)
- Solana Actions endpoint at `/api/actions/router/[handle]/[type]`. Wildcards in `/.well-known/actions.json` register `/at/*`, `/qr/*`, `/pay/*`.
- Powers F7, F8.

### P6. Jupiter swap-and-fund (off-chain, mainnet-only execution)
- Wraps Jupiter Lite API. Builds v0 versioned tx with Jupiter's Address Lookup Tables.
- Powers F12.

### P7. Public follow graph (off-chain)
- `follows(follower_pubkey, following_pubkey, since, push_on_receipt)` table with RLS: owner-only writes, public reads.
- Powers F16.

### P8. Capability leaderboard view (off-chain)
- Postgres view aggregating ALLOW + public_feed receipts.
- Powers F17.

### P9. Delivery-Escrow Pact (on-chain, NEW in v0.3)
- New `DeliveryEscrow` variant on `PactMode` enum.
- 3 new ixs: `open_delivery_escrow`, `release_delivery_escrow` (dual-caller), `dispute_delivery_escrow`.
- 3 new events: `DeliveryEscrowOpenedEvent`, `DeliveryEscrowReleasedEvent`, `DeliveryEscrowDisputedEvent`.
- Powers F22.

### P10. Server-clock request-timing columns (off-chain)
- `request_initiated_at`, `upstream_called_at`, `upstream_returned_at` on receipts. Populated by proxy in same process — clock-drift-safe subtraction.
- Powers F17 honest latency metric.

### P11. Client-side rolling-window heatmap (off-chain)
- Browser-only sliding 60 s aggregation over `receipts` Supabase Realtime payloads.
- No server view, no Postgres aggregation — judges can verify the heatmap by reading 1 component file.
- `?simulate=1` query param injects synthetic events for empty-cluster demos.
- Powers F23.

### P12. Soulbound MPL Core mint (off-chain → on-chain)
- Six-kind catalogue lives in `@settle/types` so both web UI and indexer cron import a single source of truth without dragging MPL Core into the SDK / browser bundle.
- Mint helper (`apps/indexer/src/badges-mint.ts`) is server-only, scoped to the indexer rootDir; uses `@metaplex-foundation/mpl-core` `create()` with the V2 plugin-args shape `{ type: "PermanentFreezeDelegate", frozen: true }` (frozen-at-create — true SBT, no later freeze toggle).
- Threshold detection: a 5-min cron polls Postgres for `(user_pubkey, badge_kind)` pairs not yet in `reputation_badges`. Idempotent via unique `(user_pubkey, badge_kind)` constraint.
- Push fan-out: `/api/internal/push` (Bearer-authed via `SETTLE_INTERNAL_API_KEY`, constant-time compare) keeps VAPID + RFC 8291 crypto in the web app, single source of truth.
- Powers F24.

### P13. Light Protocol compressed-token mirror (off-chain → on-chain)
- Decoupled from the user-facing payment path on purpose: x402 proxy never blocks on Light Protocol RPC. Receipts persist immediately; the mirror fills async via `compress-cron` polling `compressed_sig IS NULL`.
- Idempotent: once the column is filled, never retried. Cron crash mid-mint just re-tries on the next tick.
- One mint per cluster, created once via `pnpm zk:mint-setup` (legacy `createMint` from `@lightprotocol/compressed-token`). All receipts share the same `SETTLE_RECEIPT` mint.
- Photon RPC dependency: bundled in Helius URL — `createRpc(url, url, url)` uses the same endpoint for JSON-RPC + compression queries + prover.
- Powers F25.

---

## 5. On-chain Architecture

### Program: `settle-agent-card`
Anchor 0.31 program. Two account types, eleven instructions.

#### Account: `AgentCard`
| Field | Type | Notes |
|---|---|---|
| `authority` | `Pubkey` | The user's wallet. Owns the card. |
| `agent_pubkey` | `Pubkey` | The pubkey allowed to sign autonomous spend ixs (`spend_via_pact`, `claim_streaming`). |
| `label_hash` | `[u8; 32]` | BLAKE3 of the human label, used as PDA seed. |
| `usdc_mint` | `Pubkey` | Pinned at create. Spend rejects any other mint. |
| `daily_cap_lamports` | `u64` | 24-h aggregate cap across all child Pacts. |
| `per_call_max_lamports` | `u64` | Per-spend cap, also enforced on streaming claims. |
| `used_today` | `u64` | Incremented by every spend / claim; resets on slot-window roll. |
| `last_reset_slot` | `u64` | Slot where `used_today` was last reset. `CAP_WINDOW_SLOTS = 220_000` (~24 h). |
| `allowlist` | `Vec<AllowlistEntry>` | Up to 10 (merchant, optional capability_hash) entries. |
| `expiry_slot` | `u64` | Spend rejects past this slot. |
| `revoked` | `bool` | Spend rejects if true. |
| `policy_version` | `u32` | Bumped on revoke + future policy mutation ixs. |
| `created_at` | `i64` | Unix timestamp at create. |
| `bump` | `u8` | Stored canonical bump. |

PDA seeds: `[b"agent-card", authority, label_hash]`.

#### Account: `Pact`
| Field | Type | Notes |
|---|---|---|
| `parent_card` | `Pubkey` | Backlink to AgentCard. |
| `authority` | `Pubkey` | Mirrors `parent_card.authority`. |
| `agent_pubkey` | `Pubkey` | Mirrors `parent_card.agent_pubkey`. |
| `scope_label_hash` | `[u8; 32]` | BLAKE3 of scope label. PDA seed component. |
| `usdc_mint` | `Pubkey` | Pinned to `parent_card.usdc_mint`. |
| `mode` | `PactMode` | Enum: `OneShot { cap, spent }`, `Streaming { rate, max_total, claimed, last_claim_slot, paused, pause_started_slot, pause_accumulated_slots }`, `DeliveryEscrow { amount, merchant, capability_hash, confirm_deadline_slot, dispute_deadline_slot, released, refunded }`. |
| `allowlist` | `Vec<AllowlistEntry>` | Up to 5 entries. Strict subset of parent allowlist. (Empty for DeliveryEscrow — merchant pinned in variant payload instead.) |
| `expiry_slot` | `u64` | Pact expires past this slot. |
| `closed` | `bool` | Set true on close_pact / final release / final dispute. |
| `created_at` | `i64` | Unix timestamp. |
| `bump`, `vault_bump` | `u8` | Stored canonical bumps. |

PDA seeds: `[b"pact", parent_card, scope_label_hash]`. Vault: `[b"pact-vault", pact]`. Vault is data-less; signs USDC CPIs as derived signer.

#### Instructions (11 total)
| Ix | Signer | Purpose |
|---|---|---|
| `create_card` | authority | Initialize an AgentCard. |
| `spend` | authority | Authority-direct spend (legacy, no Pact). |
| `spend_via_pact` | agent | Autonomous spend on a OneShot pact. Vault PDA executes. |
| `revoke` | authority | Set `revoked = true`, bump `policy_version`, emit. |
| `record_denial` | authority OR agent | Audit-log a DENY to the on-chain ledger (no funds move). |
| `open_pact` | authority | Create + fund a OneShot pact. |
| `close_pact` | authority | Drain a OneShot/Streaming vault back to authority. Rejects DeliveryEscrow. |
| `open_streaming_pact` | authority | Create + fund a Streaming pact. **NEW in v0.3.** |
| `claim_streaming` | agent | Draw accrued entitlement on a Streaming pact. **NEW.** |
| `pause_streaming` / `resume_streaming` | authority | Pause/resume entitlement accrual. **NEW.** |
| `open_delivery_escrow` | authority | Create + fund a DeliveryEscrow pact with pinned merchant + deadlines. **NEW.** |
| `release_delivery_escrow` | dual: buyer any time / anyone post-deadline | Drain vault → pinned merchant. **NEW.** |
| `dispute_delivery_escrow` | authority | Drain vault → buyer (within dispute window). **NEW.** |

#### Events
- `PolicyDecisionEvent` — emitted on every spend / claim / record_denial / revoke. Carries 4 hashes + decision + amount.
- `CardCreatedEvent`, `CardRevokedEvent` — card lifecycle.
- `PactOpenedEvent`, `PactClosedEvent`, `PactSpendEvent` — OneShot lifecycle.
- `StreamingPactOpenedEvent`, `PactStreamClaimEvent`, `PactStreamPauseEvent` — Streaming lifecycle. **NEW.**
- `DeliveryEscrowOpenedEvent`, `DeliveryEscrowReleasedEvent`, `DeliveryEscrowDisputedEvent` — Escrow lifecycle. **NEW.**

#### Hash chain
Every `PolicyDecisionEvent` commits 3 BLAKE3 hashes on-chain: `receipt_hash`, `reason_hash`, `policy_snapshot_hash`. The off-chain `purpose_hash` (binds receipt to HTTP context: method + path + amount + capability + agent + pact + merchant) is computed in `@settle/sdk::canonicalPurposeHash` and stored alongside in Postgres for verification.

---

## 6. Off-chain Architecture

### Apps
| App | Purpose |
|---|---|
| `apps/web` | Next.js 15 App Router. All UI + the x402 proxy (the agent payment endpoint) + every API endpoint. |
| `apps/indexer` | Helius `onLogs` WebSocket subscriber. Decodes program events by 8-byte sighash discriminator and writes mirrored rows to Postgres. Also runs the webhook delivery worker, the F22 escrow-release cron, the F24 badge-mint cron, and the F25 ZK-compressed-receipt cron. |
| `apps/demo-merchants` | Sample merchant servers (arxiv-fetch, translate) for end-to-end agent demos. |
| `apps/demo-agent` | Sample autonomous agent that spends via x402 proxy to the demo merchants. |

### Packages
| Package | Purpose |
|---|---|
| `packages/sdk` | Canonical hash builders, capability-hash, sealed-box, handles, IDL constant. 83 unit tests. |
| `packages/types` | Cross-package types: `DenyCode` enum, ix arg types, F24 badge catalogue (`BADGE_CATALOGUE`, `BadgeKind`, `BadgeSpec`). |
| `packages/ui` | Shared UI: `<TrustGesture>`, `<SettleCard>`, `<HandleBadge>`, `<ReceiptCard>`. |

### Database (Supabase Postgres)
**Tables (16 migrations 0001–0016):**
- `handles` — Settle handles + display info.
- `agent_cards` — mirror of on-chain AgentCard accounts.
- `pacts` — mirror of on-chain Pact accounts; mode-aware columns.
- `agent_card_allowlist`, `verified_merchants`, `nonce_cache`.
- `receipts` — every spend's policy decision row + canonical reason/policy snapshot. Has `public_feed`, `request_initiated_at`, `upstream_called_at`, `upstream_returned_at`.
- `policy_decisions` — auxiliary read-optimized denormalization.
- `agent_templates` — re-usable AI agent definitions.
- `push_subscriptions` — VAPID Web Push subscriptions per pubkey.
- `receipt_attachments` — voice notes (sealed-box ciphertext in Storage).
- `refund_requests` — F4 audit log.
- `merchant_pricelist` — F9 self-repricing QR pricelist.
- `merchant_payment_links` — F10 one-time-use links.
- `follows` — F16 directed follow graph.
- `collabs`, `split_bills`, `split_bill_payments` — F20/F21.

**Views:**
- `agent_receipts` / `merchant_receipts` (RLS-filtered receipt views — N5 dual receipts).
- `capability_leaderboard` / `capability_leaderboard_summary` (F17).

**RLS model:**
- Public reads: `verified_merchants`, `follows` (count), `collabs`, `split_bills`, `split_bill_payments`, leaderboard views.
- Owner writes: `follows` (auth.jwt wallet_pubkey), `collabs.organizer`, `split_bills.organizer`, `merchant_pricelist.merchant`, `merchant_payment_links.merchant`, `agent_cards.authority`.
- Service-role only: `receipts` insert (proxy), `split_bill_payments` insert (server), `pacts` upsert (indexer).

### Indexer event handling
Discriminator-filtered (`sha256("event:<EventName>")[..8]`) decoder. New in v0.3:
- `StreamingPactOpenedEvent` (137 bytes) → upsert pacts row, mode='streaming'.
- `PactStreamClaimEvent` (136 bytes) → update claimed/last_claim_slot/pause_accumulated.
- `PactStreamPauseEvent` (41 bytes) → update paused/pause_started_slot.
- `DeliveryEscrowOpenedEvent` (192 bytes) → upsert pacts row, mode='delivery_escrow'.
- `DeliveryEscrowReleasedEvent` (113 bytes) → update released/closed/released_caller.
- `DeliveryEscrowDisputedEvent` (80 bytes) → update refunded/closed.

### x402 proxy (`/api/x402/proxy/[merchant]`)
The agent-payment endpoint. Validates dual-sig (wallet sig over canonical request + agent sig over capability hash + nonce). Runs live policy check (`checkLivePolicy` against on-chain card). Builds + signs `spend_via_pact` ix (facilitator = card.agent_pubkey). Sends + confirms via Helius Sender (Jito bundle). Persists receipt with timing columns. Fans out follower push notifications when ALLOW + public_feed.

---

## 7. Solana Primitive Inventory

### What we use today
| Primitive | Where |
|---|---|
| **Anchor 0.31 program** | Single program: `settle-agent-card`. |
| **PDA-derived signers** | `Vault PDA = [b"pact-vault", pact]` signs all CPI TransferChecked. |
| **SPL Token + ATA** | All payments. Auto-create-ATA prepended where missing. |
| **Token-2022 program** | Read-side: enumerated alongside Token in `<TokenPicker>`. Our own program uses Token (USDC mint pinned at card create). |
| **Solana Pay transfer-request** | F8 (handle pay), F10 (payment links). |
| **Solana Pay transaction-request** | F9 (self-repricing QR). |
| **Solana Pay reference pubkeys** | Embedded in every built tx for tx-correlation. |
| **Solana Actions / Blinks** | F7 universal router + `/.well-known/actions.json` wildcards. |
| **Compressed NFTs (Bubblegum V1)** | Receipt cNFT mints via `@metaplex-foundation/mpl-bubblegum`. |
| **MPL Core (`PermanentFreezeDelegate`)** | F24 soulbound badges. `frozen: true` at create-time enforces SBT semantics — non-transferable, non-burnable. |
| **Light Protocol compressed-token (`@lightprotocol/compressed-token`)** | F25 ZK-compressed receipt mirrors. ~$0.001/account vs ~$0.00204 for a regular Solana account. |
| **Photon RPC** | Light Protocol's compressed-account indexer. Bundled in Helius URL, queried via `@lightprotocol/stateless.js::createRpc`. |
| **Address Lookup Tables (ALT)** | Used via Jupiter's response in F12 swap path. |
| **Versioned transactions (v0)** | F12 Jupiter swap path. Other paths use legacy Transaction. |
| **Helius RPC + WebSocket** | Indexer `onLogs` subscription. |
| **Helius Sender (Jito Bundles)** | x402 proxy spend submission for confirmed-on-first-try landing. |
| **Lighthouse transaction assertion** | Defense-in-depth `AssertTokenAccountAmount` ix on x402 proxy spend tx (gated by `isLighthouseEnabled()`). |
| **Memo program** | Per-payment memo carrying note/reference correlation. |
| **VAPID Web Push (RFC 8291/8292)** | Hand-rolled in `apps/web/lib/web-push.ts`. |
| **Bonfida SNS resolver** | Forward `<name>.sol` → pubkey resolution in `/api/resolve`. |
| **Pyth Hermes pull oracle** | `/api/price/sol-usd` proxies the official Pyth Hermes endpoint with 30 s edge cache. `<PythPriceTicker>` polls every 5 s on `/sandbox` + `/send`, surfaces stale-warn after 30 s. |
| **Solana Attestation Service (SAS)** | Verified-merchant lookup with trusted_db fallback. |
| **Squads V4 detection** | `detectSquadsMultisig` for "team-managed card" UI surface. |
| **Codama-equivalent IDL drift detector** | `scripts/verify-idl.ts` deep-diffs the Anchor-generated `target/idl/settle_agent_card.json` against `packages/sdk/src/idl.ts::SETTLE_IDL`. Runs in CI on every PR; fails red on structural drift. |

### What we leave on the table for v0.3 (intentional)
| Primitive | Why we don't use it (v0.3) |
|---|---|
| **Token-2022 transfer hooks** | Our program pins to USDC at card create; Token-2022 with hooks would require integrating `transfer_hook_interface` and would block on Token-Badge-less hooks. Plan calls this V0.4. |
| **Token-2022 confidential transfers** | Overkill for a consumer payment app. Available for future regulated-flow features. |
| **Token-2022 permanent delegate** | Interesting refund primitive (Settle treasury could be permanent delegate on merchant balance, revocable). V0.4. |
| **Bubblegum V2** | We use V1 — fine for v0.3 receipt scale (thousands). V2 has nicer collection ergonomics; cost-equivalent. |
| **Squads spend-flow integration** | We detect Squads-managed cards but the spend flow doesn't generate Squads proposal txs. UI surfaces "team-managed card · X-of-Y signers"; full proposal flow is V2. |
| **Switchboard randomness** | Not needed by any v0.3 feature. |
| **Solana Mobile / MWA** | No mobile-wallet-adapter beyond Phantom. Web-first product. |
| **Codama as runtime client** | We hand-maintain `idl.ts` + `anchor-client.ts`. Drift detection (the *purpose* of Codama) is now in CI via `scripts/verify-idl.ts`, so the ergonomics gap is the only remaining reason — V0.4. |
| **Solana Programs Verifiable Build** | For trust signaling at production launch. Not in scope for hackathon devnet. |

---

## 8. DevNet vs Mainnet — Honest Table

| Capability | DevNet (current) | Mainnet (future) |
|---|---|---|
| **All `settle-agent-card` ixs** | Work on devnet once the program is deployed. | Same ixs; deploy to mainnet once audited. |
| **F1–F11 (consumer flows on USDC)** | Devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. Faucet via `pnpm sandbox:airdrop`. | Mainnet USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. |
| **F12 Pay-with-any-token (USDC input)** | Works (direct TransferChecked). | Works. |
| **F12 Pay-with-any-token (non-USDC input)** | **Quote only — execution disabled.** Jupiter has no devnet liquidity. UI shows live quote + "swap activates on mainnet" banner. Submit button disabled. | Real swap composes via Jupiter → recipient gets clean USDC. |
| **F13–F14 Streaming Pact** | Works fully on devnet. | Same. |
| **F15 Wallet-aware profile** | Works. | Same. |
| **F16 Follows + push fanout** | Works (devnet has no scale issue). VAPID keys must be generated. | Works at scale on Helius. |
| **F17 Capability leaderboard** | Works; rows accumulate as receipts persist on devnet. | Same; meaningful at mainnet volume. |
| **F18 Public earnings** | Works. | Same. |
| **F19 Tap-to-pay screenshot** | Works (client-side jsQR + parseURL). | Same. |
| **F20 Collab payment** | Works. | Same. |
| **F21 Split bill** | Works. | Same. |
| **F22 Delivery escrow + permissionless cron** | Works fully on devnet. | Same. |
| **F23 Capability heatmap (live market view)** | Works. Use `?simulate=1` for empty-cluster demos. | Same; far more cells active at mainnet volume. |
| **F24 Soulbound MPL Core badges** | Works once `pnpm badge:keygen` + airdrop + cron started. Renders in Phantom + Solscan. | Same. |
| **F25 ZK-compressed receipt mirror (Light Protocol)** | Works once `pnpm zk:keygen` + `pnpm zk:mint-setup` + cron started. **Requires Helius API key** for Photon RPC; `clusterApiUrl()` fallback does not serve compressed-account queries. | Same; queryable in any Light Protocol-aware explorer. |
| **Receipt cNFT mints (Bubblegum V1)** | Works on devnet. | Same; visible in Tensor/Magic Eden on mainnet. |
| **Solana Pay transaction-request URLs** | Works (Phantom resolves devnet endpoints via cluster query). | Same. |
| **Solana Actions / Blinks (Phantom-in-X)** | Works once domain is registered with Dialect Actions Registry. | Same. |
| **Verified merchants via SAS** | Operator deploys Credential + Schema on devnet. | Operator deploys on mainnet (separate). |
| **Squads V4 detection** | Works (Squads program is on both clusters). | Same. |
| **DAS (cNFT indexed reads)** | Helius DAS works on devnet. | Better scale on mainnet. |

---

## 9. Trust Model

### What the user controls
- Their wallet private key. Settle never sees it.
- Their AgentCard parameters: `daily_cap`, `per_call_max`, `allowlist`, `expiry_slot`, `revoked`, `usdc_mint`. Mutable only via authority-signed ixs.
- Their pact funding. They can `close_pact` (OneShot/Streaming) or `dispute_delivery_escrow` (within window) at any time to reclaim funds.
- Their privacy: `agent_cards.public_feed_default` controls whether their spend is visible publicly. RLS enforces it.
- Their voice-note recipients: sealed-box is locked to the original receipt recipient pubkey.

### What the network enforces
- No spend exceeds `card.per_call_max_lamports` per call.
- No spend exceeds `card.daily_cap_lamports` aggregated across all child Pacts in a 24-hour window (`CAP_WINDOW_SLOTS = 220_000`).
- No spend to off-allowlist merchants.
- No spend with a capability hash that doesn't match the pinned hash on the allowlist entry (when pinned).
- No spend with a wrong USDC mint (mint pinned at card create).
- DeliveryEscrow merchant pubkey is pinned at open — release cannot redirect funds.
- DeliveryEscrow `confirm_deadline_slot ≤ dispute_deadline_slot` enforced at open.
- Streaming pact entitlement is bounded by `(elapsed − paused_slots) × rate` and capped at `max_total − claimed`.

### What Settle (operator) controls
- The facilitator key: `SETTLE_FACILITATOR_PRIVKEY` (= `card.agent_pubkey` for proxy-managed cards). Used to sign `spend_via_pact` and `claim_streaming` ixs autonomously. Cannot exceed on-chain caps.
- The sealed-box keypair: `SETTLE_SEALED_BOX_PRIVKEY` decrypts voice notes server-side after wallet-sig auth. The pubkey is published in `/api/sealed-box-pubkey` for verification.
- The escrow cron keypair: `SETTLE_ESCROW_CRON_PRIVKEY`. Pays tx fees for permissionless release after deadline. Cannot redirect funds (merchant is pinned on-chain).
- VAPID keys for Web Push delivery.

### What Settle does NOT control
- Cannot move user funds outside on-chain rules.
- Cannot read voice notes without wallet-sig from authorized recipient.
- Cannot redirect escrow releases.
- Cannot prevent the user from `close_pact` / `dispute_delivery_escrow` at any time.

---

## 10. Hard Limits / Caps / Quotas

| Limit | Value | Where enforced |
|---|---|---|
| Allowlist entries on AgentCard | 10 | `MAX_ALLOWLIST` constant in Anchor program. |
| Allowlist entries on Pact | 5 | `MAX_PACT_ALLOWLIST` constant. |
| `CAP_WINDOW_SLOTS` for daily reset | 220,000 (~24 h at 400 ms/slot) | Anchor program. |
| Voice-note duration | 10 s | Browser-side cap in `MediaRecorder` setTimeout. |
| Voice-note pre-encryption raw bytes | 256 KB | `MAX_BYTES` in `voice-note.ts`. |
| Voice-note ciphertext bucket cap | 512 KB | Supabase Storage bucket policy. |
| Capability allowlist entry size | 65 bytes | 32 (merchant) + 1 + 32 (Option<capability_hash>). |
| `Pact::SPACE` | 566 bytes | Includes 91-byte PactMode + 329-byte allowlist + remaining fields + discriminator. |
| Wallet-sig auth nonce TTL | 5 min | Upstash TTL. |
| Wallet-sig auth ts skew tolerance | ±5 min | `TS_SKEW_SECONDS` in `wallet-auth.ts`. |
| Jupiter Lite API rate | ~60 rpm/IP | Public limit. We debounce quote requests at 350 ms in `/send`. |
| Split-bill payers | 2 ≤ N ≤ 50 | `split_bills.n_payers` constraint. |
| Collab ratio | 1 ≤ ratio_bps_a ≤ 9999 | `collabs.ratio_bps_a` constraint. |
| Push fanout per receipt | All followers with `push_on_receipt=true` | No throttle in v0.3. |

---

## 11. Known Gaps & Trade-offs

1. **Program not deployed yet.** All client-side ix builders throw `assertRealProgramId()` until `pnpm deploy:devnet` patches the real program ID.

2. **Migrations 0011–0016 unapplied** — the indexer + receipt API + leaderboard depend on these columns/views. Until you run them, the corresponding endpoints throw on first query.

3. **No anchor integration tests run.** The 9 tests in `programs/.../tests/streaming-and-escrow.ts` (4 P1 + 5 P9) are written but unverified at runtime. Run with `anchor test --skip-deploy`.

4. **Hand-maintained IDL.** When `anchor build` runs, it regenerates the IDL from Rust. I matched field ordering exactly, but verify field-by-field after the first build.

5. **Plan P2 (single-use OneShot pact flag) deferred to V0.4.** F10 ships off-chain via DB row-lock instead.

6. **Receipt cNFT transfer = collectible only**, not rights bundle. Voice-note decryption rights are pinned to original recipient — by design (Codex round-2 closed). V0.4 needs a viewing-key model.

7. **Indexer's escrow `expiry_slot` defaults to `dispute_deadline_slot`** because the OpenedEvent doesn't carry the actual `expiry_slot`. Acceptable: the on-chain Pact has its own correct expiry; the indexer mirror is for UI display only.

8. **Permissionless escrow cron is a thin HTTP client** of `/api/escrows/[id]/release` — lets the web app own the ix-build logic without duplication. Trade-off: cron requires the web app to be reachable.

9. **Dialect Actions Registry submission** not done. Phantom-in-X Blinks render only after registration.

10. **Lighthouse defense-in-depth** is currently only on `spend_via_pact` (proxy path). `claim_streaming` and `release_delivery_escrow` could carry the same `AssertTokenAccountAmount` ix — V0.4 hardening.

11. **Pyth Hermes pull oracle is wired** as of v0.3 polish — `/api/price/sol-usd` proxies Hermes with 30 s edge cache. `<PythPriceTicker>` lives on `/sandbox` + `/send` and shows stale-warn at 30 s. **Note:** this is the *display* path. We don't (yet) post Pyth price updates on-chain to gate any spend logic — that would be a v0.4 hardening for any feature that needs an on-chain authoritative price.

---

## 12. Pointers

- Build plan: `docs/v0.3-build-plan.md`.
- Program source: `programs/settle-agent-card/programs/settle-agent-card/src/`.
- IDL truth: `packages/sdk/src/idl.ts` (matches Rust exactly until first `anchor build`).
- Migration order: `infra/supabase/migrations/0001_init.sql` → `0016_collabs_and_split_bills.sql`.
- Web app: `apps/web/`.
- Indexer: `apps/indexer/`.
- This document: `docs/PRODUCT_SPEC.md`.
