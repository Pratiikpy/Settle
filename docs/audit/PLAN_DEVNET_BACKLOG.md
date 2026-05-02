# PLAN_DEVNET_BACKLOG.md — finishing every devnet-buildable item

> **APPROVED 2026-05-02.** No scope cuts (build all 27). Wave order: 1 → 2 → 3.
> AI to attempt `anchor deploy` (CLI + keypair confirmed present). NVIDIA NIM = canonical LLM provider. Self-review between waves. No compromise.

**Total devnet-buildable items:** 26 across 6 work streams + Wave 4 full E2E test pass + Wave 5 convergence. (i18n F6 deferred.)
**Total effort estimate:** ~104 hrs implementation + ~25 hrs testing + ~variable fix-after-test = **~130-150 hrs total**.
**Hard dependencies:** Wave 4 tests Wave 1-3 features; otherwise streams can run in parallel.
**Operator-only items separated** at the bottom.

---

## ⚙️ Canonical decisions (lock these — don't drift)

### LLM provider: NVIDIA NIM (free, multi-model)

For every feature that needs an LLM call (F2.3 receipt narration, F3.11 NL capability discovery, F4.6 AI-drafted dispute responses, F1.6 command-palette command parsing, anything else discovered) — **use the NVIDIA NIM endpoint:**

```
base_url: https://integrate.api.nvidia.com/v1
api_key:  NVIDIA_NIM_API_KEY (env var; user has provided one)
default_model: z-ai/glm-5.1
streaming: true
extra_body: { chat_template_kwargs: { enable_thinking: true, clear_thinking: false } }
```

OpenAI-compatible API shape — drop-in replacement for `openai.chat.completions.create`. The user has provided a working key. Other NVIDIA-hosted models also available (glm, llama, mixtral, etc.) — pick per-feature based on cost/quality.

**Add to env:** `NVIDIA_NIM_API_KEY=nvapi-...` in both `.env.local` files.

**Implementation pattern** — create `apps/web/lib/nvidia-nim.ts` as the canonical helper:
```ts
import OpenAI from "openai";
export const nvidia = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_NIM_API_KEY!,
});
```
Every LLM-using feature imports from this module. Single source of truth, easy to swap if NVIDIA's free tier changes.

**First action of Wave 1:** smoke-test the endpoint with a simple completion before any feature relies on it. If the key has rate limits / model availability issues, surface them now, not mid-implementation.

### Anchor deploy: AI attempts, operator backstops

`anchor` CLI is installed at `/c/Users/prate/.cargo/bin/anchor`. Program keypair exists at `programs/settle-agent-card/target/deploy/settle_agent_card-keypair.json`. **AI will attempt `anchor deploy --provider.cluster devnet` itself** as part of Stream E1. If the deploy fails (insufficient deployer SOL, upgrade authority mismatch, network) — surface the exact error, document remediation in `HUMAN_ACTIONS.md`, continue the rest of the plan. The user can run the deploy after.

### Devnet SOL budget: unlimited per user direction

Spend whatever's needed. Track total in the final report. Estimate: 0.5 SOL across the plan; comfortable margin.

### No compromise

- No "we'll do that later" inside the AI scope.
- No `as any`, no silent catches, no skipped tests.
- Every stream has explicit completion criteria (see § per-stream).
- Self-review checkpoint AFTER each wave (see § Self-review).

---

## 🧭 Self-review checkpoint protocol (run between every wave)

After Wave 1, before starting Wave 2 (and same after Wave 2):

1. **Typecheck all 9 workspaces** — must be green.
2. **Re-run all keypair harnesses** — `e2e-payment-flow`, `phase5-idempotency-drill` — must pass.
3. **Re-run full Playwright suite** — must be green (regression net).
4. **Re-run all 3 SDK test runners** — must be green.
5. **Re-grep Cycle 1 + FINISH_IT closures** (per `audit pass 3` patterns) — must hold.
6. **Honest progress write** to `WAVE_<N>_REVIEW.md` — what shipped, what didn't, what surprised, devnet SOL spent so far.
7. **Decide Wave N+1 start** — if regressions found, fix before continuing.

Goal: never accumulate broken state across waves.

---

## Stream A — Visible quick wins (3 items, ~10 hrs)

These are visible to every user and produce demoable moments. Do these FIRST so the product looks sharper while bigger streams run in the background.

### A1. F2.7 — Hash-chain animation on receipt page (~3 hrs)
**What:** the 4 receipt hashes visually link together as chain links when receipt page loads. SVG animation, ~3s, plays once per session per receipt.
**Files to add:** `apps/web/components/hash-chain-animation.tsx` (SVG component) + state in `apps/web/app/receipts/[requestId]/page.tsx`.
**Risk:** none — pure render component. No DB / no on-chain.
**Verify:** Playwright spec asserts animation mounts, tracks completion via animation event.

### A2. F2.9 — Receipt drag-to-share (~4 hrs)
**What:** drag a receipt card → drop on a contact / handle → sends a verifiable copy via deep-link.
**Files to add:**
- Migration `0049_shared_receipts.sql` (sender_pubkey, recipient_pubkey, request_id, message, created_at + RLS)
- `apps/web/app/api/shared-receipts/route.ts` (POST = share, GET = inbox)
- `apps/web/components/receipt-drag-handle.tsx`
- Inbox surface inside `/dashboard` or new `/inbox` route
**Risk:** low — pure off-chain. Receipt URL is already shareable.
**Verify:** Playwright spec drags + drops + asserts row inserted.

### A3. F3.8 — Killchain revoke animation (~3 hrs)
**What:** clicking "Revoke card" triggers a frost-then-shatter animation on all child Pact tiles before the on-chain `revoke` ix fires.
**Files to add:** `apps/web/components/killchain-animation.tsx` + slide-to-confirm modal + integration in `apps/web/app/cards/[id]/page.tsx`.
**Risk:** none — pure UI; the revoke ix already exists.
**Verify:** Playwright triggers revoke → assert animation classes applied → no JS errors.

---

## Stream B — Receipt features (4 items, ~15 hrs)

Receipts are the wedge. Closing these makes Settle's core feel finished.

### B1. F2.10 — Receipt search via Postgres FTS (~4 hrs)
**What:** activity feed gets a search bar; full-text across receipt notes + capability + date/amount filters.
**Files:**
- Migration `0050_receipt_fts_index.sql` — add `tsvector` index on `receipts(canonical_reason_json + purpose_text_decoded)`.
- `apps/web/app/api/receipts/search/route.ts` — server FTS endpoint with filters.
- `apps/web/components/receipt-search.tsx` — debounced search bar + filter chips on `/feed` and `/ledger`.
**Risk:** low — pure read-side index.
**Verify:** seed N receipts, search by note text, assert hit.

### B2. F2.11 — Receipt tagging UI (~3 hrs)
**Note:** migration `0023_receipt_tags.sql` already exists; only UI + endpoint missing.
**Files:**
- `apps/web/app/api/receipts/[requestId]/tags/route.ts` (already exists; verify functions; otherwise add POST/DELETE)
- `apps/web/components/receipt-tag-pills.tsx` (autocomplete from existing tags)
- Filter-by-tag in `/feed` activity surface.
**Risk:** low — table already exists.
**Verify:** add tag → list filtered → delete tag → no orphans.

### B3. F2.12 — Compliance export (PDF + CSV) (~6 hrs)
**What:** Settings → Exports → "Download tax export" with year + jurisdiction picker. Generates PDF + CSV with all receipts + hash-chain proofs.
**Files:**
- `apps/web/app/api/exports/receipts/route.ts` — generates CSV + PDF
- `apps/web/app/settings/exports/page.tsx` — UI
- Use `@react-pdf/renderer` or similar for PDF. CSV native.
- Currency conversion via Pyth or static USDC=USD assumption (devnet).
**Risk:** medium — large output, need to test with N=1000 receipts.
**Verify:** export a year, confirm CSV row count matches receipts in range, PDF opens.

### B4. Native receipt webhook retry (~2 hrs)
**What:** mirror C44 federation retry mechanism for native receipts. Failed deliveries past MAX_ATTEMPTS get a "retry" admin button.
**Files:**
- `apps/web/app/api/admin/webhooks/retry/route.ts`
- `apps/web/app/admin/webhooks/page.tsx`
- Worker: `apps/indexer/src/webhook-worker.ts` — already retries; just need the admin reset endpoint.
**Risk:** none.
**Verify:** mark a delivery failed-max → click retry → row resets to pending.

---

## Stream C — Discovery + trust surfaces (5 items, ~22 hrs)

These are the public surfaces that turn Settle into a network.

### C1. F2.5 — Public proof page `/at/[handle]/proof` (~6 hrs)
**What:** a public verifiable lifetime activity page per user. Hero (name, badges, joined-date). Three sections: (1) capability usage breakdown, (2) public receipts feed, (3) reputation graph.
**Files:**
- Migration `0051_public_proof_view.sql` — view `public_proof_stats` aggregating per-pubkey metrics
- `apps/web/app/at/[handle]/proof/page.tsx`
- `apps/web/app/api/handles/[handle]/proof/route.ts`
- `apps/web/components/proof-page-hero.tsx`
**Risk:** low — pure read.
**Verify:** load a known handle's proof page; counts match raw queries.

### C2. F3.12 — Trust score per agent / per capability (~3 hrs)
**Note:** migration `0021_trust_scores.sql` already exists; cron + UI missing.
**Files:**
- `apps/indexer/src/trust-score-cron.ts` — recompute periodically
- Surface on `/at/[handle]` as a single number with hover-explainer
- Formula: `log(unique_counterparties) × allow_rate × inverse_dispute_rate` × 10
**Risk:** low.
**Verify:** seed receipts, run cron, assert score updates.

### C3. F3.11 — NL capability discovery (~4 hrs)
**What:** `/capabilities/discover` with input box. AI ranks the leaderboard view by query, returns top 5 with reasoning.
**Files:**
- `apps/web/app/capabilities/discover/page.tsx`
- `apps/web/app/api/capabilities/discover/route.ts` (calls NVIDIA NIM via `lib/nvidia-nim.ts` helper)
- Uses NVIDIA NIM canonical helper (see § LLM provider above)
**Risk:** low.
**Verify:** seed 10 fake capabilities, query → top 5 returned with reasoning. Smoke-test the NIM endpoint before wiring.

### C3-bis. Receipt narration via NVIDIA NIM (~3 hrs, folded into Stream C)
**What:** F2.3 — receipt page shows an LLM-generated plain-English forensic timeline ("@aria sent 5.00 USDC to @zoro at slot 459460038. Card 'creator-tips' allowed it within $50/day cap. Confirmed in 0.42s. Verifiable independently.").
**Files:**
- `apps/web/app/api/receipts/[requestId]/narrate/route.ts` — already exists per repo grep; **verify** it uses NVIDIA NIM not OpenAI.
- If using a paid provider, swap to `lib/nvidia-nim.ts`.
**Risk:** low.
**Verify:** load a receipt, narration renders, cost = $0 (NIM is free).

### C3-ter. Dispute draft via NVIDIA NIM (~2 hrs, folded into Stream C)
**What:** F4.6 — `/m/[handle]/disputes` AI-drafts merchant response to dispute.
**Files:**
- `apps/web/app/api/disputes/draft/route.ts` — already exists per repo grep; **verify** it uses NVIDIA NIM.
- Swap if needed.
**Risk:** low.
**Verify:** open a dispute, draft button → coherent reply rendered.

### C4. Capability registry → /verify alias rendering (~1 hr)
**What:** receipt page shows merchant's human alias when capability_hash matches a registry row, instead of raw hash.
**Files:** `apps/web/app/receipts/[requestId]/page.tsx` — add lookup against `capability_registry` table (already exists).
**Risk:** none.
**Verify:** receipt with known hash renders alias text.

### C5. F1.1 — Home dashboard rewrite (~6 hrs)
**Note:** STRATEGY says current `/` is marketing; integrated 3-card dashboard unbuilt.
**What:** post-connect home shows 3 cards: Money (USDC + SOL balances + recent in/out), Programs (active Pacts + AgentCards + streaming), Activity (last 10 receipts + badges + follower notifications). Mini capability heatmap at bottom linking to `/leaderboard`.
**Files:**
- `apps/web/app/dashboard/page.tsx` (verify if already integrated; if marketing-only, rebuild)
- 3 new card components in `apps/web/components/`
**Risk:** medium — touches the most-used route.
**Verify:** Playwright assert all 3 cards visible post-connect.

---

## Stream D — Developer / SDK surfaces (5 items, ~26 hrs)

These ship Settle as infrastructure. Highest external-leverage stream.

### D1. F4.1 — `npx create-settle-merchant` published to npm (~3 hrs)
**Note:** local script `scripts/create-settle-merchant.ts` exists; needs to be published as a real CLI.
**Files:**
- `packages/create-settle-merchant/` new workspace
  - `package.json` with `bin` field
  - Move existing script logic in
  - Add interactive prompts (capability name, USDC price, target endpoint)
  - Generate complete starter repo (Express + x402 + Solana Pay + Vercel deploy config)
- Verify locally via `pnpm dlx ./packages/create-settle-merchant my-app`
**Risk:** medium — first npm-publishable package; needs README + CI publish lane.
**Verify:** scaffold a test merchant; run it locally; receive a payment.

### D2. F5.4 — `<settle-pay>` web component (~6 hrs)
**What:** drop-in `<settle-pay merchant="..." amount="...">` for any non-React site. Renders checkout button → opens iframe modal → handles connect/pay/receipt → emits `settle-pay-complete` event.
**Files:**
- `packages/web-components/` new workspace
  - `settle-pay.ts` Custom Element extending HTMLElement
  - Iframe targeting `https://settle.so/pay-component-frame`
  - `apps/web/app/pay-component-frame/page.tsx` — minimal payment UI for the iframe
- Build to ESM + UMD; publish to npm + jsDelivr
**Risk:** medium — postMessage protocol + cross-origin auth.
**Verify:** test page outside the monorepo; embed; pay; receipt URL emitted.

### D3. F5.5 — `<settle-verify>` web component (~4 hrs)
**What:** `<settle-verify receipt="...">` renders ✓/✗ for any Settle receipt; recomputes 4 hashes client-side.
**Files:**
- `packages/web-components/settle-verify.ts`
- Reuses `verifyReceipt()` from `@settle/sdk`
**Risk:** low.
**Verify:** drop tag on test page with known sig; correct ✓ rendered; tampered receipt → ✗.

### D4. F5.8 — Agent framework adapters (4 adapters, ~8 hrs)
**What:** thin wrappers so OpenAI Agents / Anthropic / LangChain / CrewAI users can declare a Pact and have all tool calls auto-route through Settle's x402 + receipt commitment.
**Files:**
- `packages/adapters-openai/` — `SettlePactTool` wrapping the SDK
- `packages/adapters-anthropic/`
- `packages/adapters-langchain/`
- `packages/adapters-crewai/` (Python — extends `packages/python-sdk`)
- Each: README with copy-paste example.
**Risk:** medium — needs working knowledge of each framework's tool-call shape.
**Verify:** for each, run their example notebook against devnet; receipt lands; capability_hash binds.

### D5. F5.12 — Templates (Vercel + Replit + Cursor) (~5 hrs)
**What:** ready-to-deploy starter repos for each platform, demonstrating an x402-paid endpoint.
**Files:**
- 3 new top-level repos OR `examples/` subdir with platform-specific configs
- Each: README showing deploy in <60s
**Risk:** low.
**Verify:** click-through deploy on each platform results in a working merchant.

---

## Stream E — Mainnet-deferred features that ARE devnet-buildable (3 items, ~10 hrs)

Items the audit flagged but that work fine on devnet.

### E1. AU-03-006 — `claim_streaming` partial-claim deploy (AI attempts)
**Note:** Anchor source already fixed in Cycle 1. Needs `anchor deploy --provider.cluster devnet`.
**Status:** AI attempts. CLI present at `/c/Users/prate/.cargo/bin/anchor`. Program keypair at `programs/settle-agent-card/target/deploy/settle_agent_card-keypair.json`. Deployer wallet should have SOL on devnet.
**Process:**
1. `anchor build --provider.cluster devnet` — build .so
2. `anchor deploy --provider.cluster devnet` — push upgrade
3. Verify on-chain via `solana program show <PROGRAM_ID> --url devnet`
4. Re-run `phase5-streaming-harness.ts` (Stream E2) to confirm `claim_streaming` lands confirmed.
**Failure modes (document if hit):**
- Insufficient SOL on deployer wallet → airdrop or transfer
- Upgrade authority mismatch → operator must run with the right authority
- Network blip → retry
If any failure persists, flag in `HUMAN_ACTIONS.md` for operator and **continue the rest of the plan.**

### E2. Streaming claim full landing harness on devnet (~3 hrs)
**What:** extend `phase5-live-all-intents.ts` to spawn a real streaming pact via `open_streaming_pact` (currently uses regular `open_pact` for all 7 intents — streaming claim therefore can't land).
**Files:**
- `scripts/phase5-streaming-harness.ts` — spawns streaming pact, primes claimable state, fires claim
**Risk:** low — additive harness.
**Verify:** harness reports `streaming_claim` confirmed on-chain.

### E3. F23 capability heatmap real-data mode (~3 hrs)
**What:** the heatmap currently renders only with `?simulate=1`. Wire the real-data mode (Supabase Realtime → 60s rolling aggregation of public_feed ALLOW receipts).
**Files:**
- `apps/web/components/capability-heatmap.tsx` — replace simulation seed with real subscription
- `apps/web/app/api/heatmap/feed/route.ts` if needed
**Risk:** low — Realtime channel already exists.
**Verify:** seed receipts, watch heatmap cells light up.

---

## Stream F — Polish + hardening (5 items, ~25 hrs)

Quality bar items.

### F1. F1.6 — Cmd+K command palette (~6 hrs)
**What:** keyboard-driven launcher. Search receipts (Postgres FTS), jump to pages, run pre-fill commands ("pay alice 5").
**Files:**
- `apps/web/components/command-palette.tsx` (already exists per repo grep — verify completeness)
- Wire to `/api/receipts/search` (added in B1)
- Keyboard hooks app-wide
**Risk:** low.
**Verify:** Playwright presses Cmd+K, types query, asserts results.

### F2. F1.7 — Dark / light mode (~4 hrs)
**What:** Auto / Light / Dark in settings. localStorage + `handles.theme_pref` for cross-device sync. 200ms color crossfade transition.
**Files:**
- Migration `0052_handles_theme_pref.sql` — add column
- `apps/web/components/theme-switcher.tsx`
- `apps/web/lib/theme.ts` — system pref detection
- CSS variables across stylesheets
**Risk:** medium — touches every page's color tokens.
**Verify:** toggle → instant transition → reload preserves.

### F3. F1.3 — Settings page integration (~4 hrs)
**What:** unified `/settings` with left rail (Profile / Privacy / Notifications / Sessions / Developer / Exports / Theme) + right pane.
**Files:**
- `apps/web/app/settings/page.tsx` — currently single-section; rebuild as left-rail layout
- Existing sub-pages (`/settings/relayer`, etc.) integrated
**Risk:** medium — refactor of existing surface.
**Verify:** every settings concern reachable in <2 clicks from `/settings`.

### F4. Card revoke → orphaned-schedules cleanup UX (~2 hrs)
**What:** when a card is revoked, surface a "this card is revoked; pick a new one OR delete the schedule" prompt on every page that lists schedules using that card.
**Files:**
- `apps/web/components/revoked-card-banner.tsx`
- Integration on `/wishes`, `/spending`, `/allowances`
**Risk:** low.
**Verify:** revoke a card with active schedules; banner appears.

### F5. Mobile layout polish (~6 hrs)
**What:** Phase 5 surfaces (groups, allowances, wishes, spending) cramped on phones. Audit at iPhone 14 + Pixel 7 widths. Add bottom-nav OR sticky-top so primary CTAs stay reachable.
**Files:**
- `apps/web/components/bottom-nav.tsx` (new — appears on mobile only)
- Per-page mobile fixes
**Risk:** medium — touches many pages.
**Verify:** Playwright at 390×844 — primary CTA visible without scroll on every Phase 5 surface.

### F6. i18n one full non-EN locale — **DEFERRED** (user direction 2026-05-02)
Skipped for now. Translation work pushed to a future cycle. The `attach_failed_409`-style error-toast codes will be addressed when i18n returns. Out of Wave 3 scope.

---

## Stream G — Verification (NEEDS_VERIFICATION items, ~5 hrs)

Items the audit flagged as "claimed but couldn't verify" — need a 30-min check each, then either close or rebuild.

- F1.5 empty states everywhere — audit each route's empty state; fill gaps.
- F2.2 receipt hash inspector — check it's actually present + functional on `/receipts/[requestId]`.
- F4.3 recurring receivables (subscription via streaming pact) — verify the merchant Subscribe CTA exists; if not, add it.
- F19 tap-to-pay-from-screenshot — verify `apps/web/lib/screenshot-pay.ts` exists; build if missing.
- F4.6 dispute resolution flow — verify `/m/[handle]/disputes` actually drafts + commits the on-chain refund.

These take the form: read code → if present, mark VERIFIED in matrix; if absent, fold into Stream A or B based on size.

---

## Operator-only items (AI cannot perform — for your awareness)

1. **`anchor deploy --provider.cluster devnet`** — AI will attempt first (Stream E1). If AI cannot complete (auth keypair mismatch, etc.), operator runs after AI work finishes.
2. **Sentry org + DSN provisioning** — set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`. 15 min. Free tier sufficient.
3. **Third-party Anchor program audit firm engagement** (cantina / sherlock / OtterSec). 4-8 weeks lead. $20K-$60K. Mainnet prerequisite.
4. **npm publish for new packages** (Stream D — `create-settle-merchant`, web-components, adapters). Needs your npm token. AI prepares packages + tests them locally; you run `npm publish` when ready.
5. **Add NVIDIA_NIM_API_KEY to env files** — AI will add the key (provided by user) but env files at runtime are operator-controlled in production deploys.

---

## Execution order — APPROVED

Run in 3 waves with self-review checkpoints between.

### Wave 0 — pre-flight (~30 min, must pass before any wave)
- Verify NVIDIA NIM endpoint with a smoke completion (use canonical helper).
- Add `NVIDIA_NIM_API_KEY` to `.env.local` and `apps/web/.env.local`.
- Confirm anchor CLI + program keypair available (verified: ✓).
- Confirm devnet RPC + facilitator wallet have SOL (auto-airdrop or transfer if needed).
- Run baseline regression (typecheck + harnesses + Playwright) — must be green.

### Wave 1 — quick wins + infrastructure (~30 hrs)
- Stream A (A1, A2, A3) — hash-chain anim, drag-share, killchain anim.
- Stream B (B1, B2, B3, B4) — FTS search, tagging UI, compliance export, native webhook retry.
- Stream G — verify the 5 NEEDS_VERIFICATION items.
- Stream F4 — revoke banner.
- **Self-review checkpoint** → write `WAVE_1_REVIEW.md`.

### Wave 2 — discovery + trust + dev surfaces (~50 hrs)
- Stream C (C1–C5 + C3-bis + C3-ter) — proof page, trust score, NL discovery, narration, dispute drafts, heatmap, capability alias rendering, home dashboard rewrite.
- Stream D (D1–D5) — npx CLI, web components, 4 framework adapters, 3 templates.
- **Self-review checkpoint** → write `WAVE_2_REVIEW.md`.

### Wave 3 — polish + activation (~24 hrs)
- Stream E (E1, E2, E3) — anchor deploy attempt, streaming harness, heatmap real-data.
- Stream F (F1, F2, F3, F4, F5) — Cmd+K, dark mode, settings page, revoke banner, mobile polish. (F6 i18n DEFERRED.)
- **Self-review checkpoint** → write `WAVE_3_REVIEW.md`.

Streams INSIDE a wave can parallelize via sub-agents (B + G + F4 are independent in Wave 1; C + D are independent in Wave 2; E + F are independent in Wave 3).

### Wave 4 — FULL END-TO-END TEST PASS (~25 hrs)

**The non-negotiable convergence wave.** Every feature built in Waves 1-3 gets tested as a real user would test it. Every flow gets exercised end-to-end. Every failure mode gets injected. Every regression net runs. Same rigor as TEST_BRIEF.md and FINISH_IT.md — no compromise, no easy way, no skipped tests.

**The hard rule** (carried from TEST_BRIEF): **do not give up on a test because it's hard.** If a feature was built, it has a way to be tested. Find it. The 8-step DON'T-GIVE-UP CHECKLIST applies before flagging anything HUMAN_ACTION_REQUIRED:

1. Did you try Playwright with the burner adapter?
2. Did you try a keypair-based programmatic harness?
3. Did you try direct Supabase service-role write to set up state, then trigger flow?
4. Did you try `page.route()` interception to mock missing dependencies?
5. Did you try setting `NEXT_PUBLIC_E2E_*` env flags?
6. Did you try writing a small test-only seeding helper?
7. Did you try sub-agents in parallel?
8. Did you check if the credential is already in `.env.local`?

Only after all 8 fail with documented reasoning is something flagged operator-only.

#### Wave 4 phases (all required)

**T-W4-1 — Static + parity regression (~30 min)**
- `pnpm -r typecheck` across 9 workspaces — must be green
- All 3 SDK test runners — must be green
- `smoke-multikind-goldens.ts` + `smoke-ix-data-parity.ts` + `check-idl-drift.ts` — must produce identical hashes 3 langs, no drift
- Capture pass/fail/duration per suite

**T-W4-2 — On-chain integration (live devnet, ~1 hr)**
- `e2e-payment-flow.ts` — fresh card + pact + spend, sigs confirmed
- `phase5-live-test.ts` — single scheduled_send fires
- `phase5-live-all-intents.ts` — all 7 intents (now including `streaming_claim` post-deploy)
- `phase5-idempotency-drill.ts` — replay rejected
- `phase5-streaming-harness.ts` (built in Wave 3 E2) — streaming_claim lands confirmed
- All sigs persisted in `logs/`; verifiable on Solscan

**T-W4-3 — Per-feature Playwright suite (~6 hrs)**
For every feature built in Waves 1-3, write a Playwright spec exercising the user flow with the burner adapter:

Stream A:
- Hash-chain animation plays + completes on receipt page (T-W4-A1)
- Receipt drag-to-share inserts row + appears in inbox (T-W4-A2)
- Killchain animation triggers on revoke flow (T-W4-A3)

Stream B:
- Receipt search returns matching receipts via FTS (T-W4-B1)
- Receipt tagging adds + filters tags (T-W4-B2)
- Compliance export downloads PDF + CSV (T-W4-B3)
- Native receipt webhook retry resets failed → pending (T-W4-B4)

Stream C:
- `/at/[handle]/proof` public page renders for known handle (T-W4-C1)
- Trust score appears on agent profile + hover-explainer renders (T-W4-C2)
- NL capability discovery returns ranked merchants for a query (T-W4-C3)
- Receipt narration loads via NVIDIA NIM (T-W4-C3-bis)
- Dispute draft loads via NVIDIA NIM (T-W4-C3-ter)
- Capability registry alias renders on receipt page (T-W4-C4)
- Home dashboard 3-card layout renders post-connect (T-W4-C5)

Stream D:
- `npx create-settle-merchant test-app` scaffolds working repo (T-W4-D1)
- `<settle-pay>` web component embeds + completes payment in test page (T-W4-D2)
- `<settle-verify>` web component validates a known receipt (T-W4-D3)
- Each framework adapter (OpenAI/Anthropic/LangChain/CrewAI) runs example successfully (T-W4-D4 × 4)
- Each template (Vercel/Replit/Cursor) deploys (T-W4-D5 × 3)

Stream E:
- `claim_streaming` ix lands confirmed on devnet (post-deploy) (T-W4-E1)
- Streaming harness produces confirmed receipt (T-W4-E2)
- Capability heatmap real-data mode renders Realtime updates (T-W4-E3)

Stream F:
- Cmd+K opens, types query, returns FTS results (T-W4-F1)
- Dark mode toggles + persists across reload (T-W4-F2)
- Settings page left-rail navigation works (T-W4-F3)
- Revoke banner appears on schedule pages when card revoked (T-W4-F4)
- Mobile 390×844 + tablet 768×1024 — no horizontal overflow on every Phase 5 surface (T-W4-F5)
- (T-W4-F6 i18n locale switching — DEFERRED with stream F6)

**T-W4-4 — Visual regression (~1 hr)**
- Re-run visual baselines for all 9 Phase 5 surfaces × 3 viewports = 27 screenshots
- Plus any new public surfaces (proof page, capabilities discover, capability registry)
- Diff against existing baselines under `apps/web/e2e/__screenshots__/`
- Threshold: zero pixel changes outside expected dynamic regions
- Update baselines for legitimate new content (don't blindly accept)

**T-W4-5 — Failure mode injection (~3 hrs)**
For every flow with a wallet sig + on-chain step, deliberately inject failure and verify the UI fails gracefully — no fake success, no silent failure:

- Wallet disconnect mid-sign
- Insufficient SOL on user wallet
- Insufficient USDC
- Revoked card path (mark revoked in Supabase mirror, attempt spend)
- Closed pact path
- Cap exceeded path
- Network failure (`page.route(/\/api\//, route => route.abort())`)
- Slow network (5s delay via `page.route`)
- Indexer lag (set last receipt timestamp 1h old, verify health page shows lag warning)
- NVIDIA NIM rate-limited / 503 (mock the response, verify UI shows fallback not crash)
- Anchor program revert (force-set state that triggers a known revert)

**T-W4-6 — Race condition + concurrency (~2 hrs)**
- Spawn 5 concurrent browser contexts firing the same scheduled_send. Assert: 1 phase5_executions row, 1 on-chain spend.
- Tick + signer interleaved via `Promise.all`. Assert: no race in last_fired_at advancement.
- Two browsers, same wallet, attempt `create_card` with same label simultaneously. Assert: one succeeds, one fails cleanly.
- Two browsers attempt to claim a streaming pact simultaneously after entitlement accrues. Assert: only one claim succeeds; second sees "nothing to claim".
- Group spend with N members all voting at the same instant. Assert: quorum threshold reached exactly once, fire happens once.

**T-W4-7 — Accessibility (~1.5 hrs)**
- Install `@axe-core/playwright` if not already
- Run axe scan on every Phase 5 surface (consumer + merchant + agent + admin + public)
- Zero violations target on critical / serious; 0 violations as ideal
- Document any ACCEPTED violations with reasoning (e.g., third-party widget contrast we don't control)

**T-W4-8 — Performance budget (~1 hr)**
- Playwright `page.metrics()` on every Phase 5 surface
- Budget: LCP < 2.5s, FID/INP < 200ms (where measurable in Playwright)
- Bundle size: total `apps/web/.next/static` JS < 1.5MB after Wave 3 features added
- Document any regression > 10% over Cycle 1 baseline (some additions are unavoidable)

**T-W4-9 — Multi-language SDK consumer parity (~30 min)**
- TS + Python + Rust each compute a kernel commit for an identical input
- Assert byte-identical hashes across all 3
- Verify the 15 ix-data builders all produce byte-identical output

**T-W4-10 — MCP middleware E2E (~1 hr)**
- Existing 7 vitest tests + write 1 new spec covering both envelope and params `_meta` placement against a mock MCP client
- Verify the credential read path works for spec-compliant Claude Desktop / Cursor pattern

**T-W4-11 — Final E2E orchestration (~1.5 hrs)**
A single Playwright test walking the entire happy path from cold start:
1. Connect (burner)
2. Claim handle
3. Set theme (dark)
4. Spawn AgentCard
5. Open Pact
6. Schedule a daily send
7. Wait for cron tick
8. Wait for cron signer (curl with CRON_SECRET)
9. See receipt in `/feed`
10. Verify receipt via SDK
11. Tag the receipt
12. Search receipts by tag
13. Drag-share the receipt
14. Add capability hash to allowlist
15. Open NL capability discovery
16. View public proof page
17. View capability heatmap
18. Test Cmd+K
19. Disconnect
20. Reconnect
21. Verify state preserved (theme, schedules visible)

If this passes, the product works end-to-end for a fully-empowered user.

**T-W4-12 — Test report (~1 hr)**
Write `docs/audit/WAVE_4_TEST_REPORT.md`:
- Per test ID: PASS / FAIL / SKIPPED (with reason) / HUMAN_ACTION_REQUIRED (with the 8-step justification)
- Total devnet SOL spent
- Total wall-clock time
- Failure list with exact reproduction steps
- Performance budget compliance
- Accessibility violation count
- Visual regression delta count
- Cross-reference every FAIL with a finding ID in `FINDINGS.md` (creating new IDs if a NEW bug surfaced)

**T-W4-13 — Fix new findings + re-converge (~variable, scope = bugs found)**
Any FAIL or new finding from T-W4-1 through T-W4-12 → open a fix pass per FIX_BRIEF Step 1-7. Iterate until:
- TEST_REPORT shows zero FAIL/HARD_FAIL
- FINDINGS.md shows zero non-CLOSED, non-ACCEPTED, non-HUMAN_ACTION_REQUIRED entries
- One full audit→test→fix cycle ran clean

**Wave 4 completion criterion:** every feature built in Waves 1-3 has a passing test in TEST_REPORT.md. Zero FAIL. Zero new HIGH-severity findings.

### Wave 5 — Final convergence (~30 min)
- Re-run audit pass 4 (re-grep all closures + check for regressions)
- Update `PROJECT_STATUS.md` to reflect everything shipped + tested
- Update `FINDINGS.md` with Wave 4 closure logs
- Overwrite `SHIP_READY.md` with the new convergence state
- Final report: total devnet SOL, total wall time, total tests added, total LOC, mainnet readiness verdict

---

## ✅ APPROVALS RECORD (locked 2026-05-02)

1. **Wave order:** Wave 1 → Wave 2 → Wave 3. ✓
2. **Scope cuts:** none. Build all 27 items. No compromise. ✓
3. **Anchor deploy:** AI attempts in Stream E1. If fails, operator backstops. ✓
4. **i18n locale:** DEFERRED. Translation work (F6) skipped this cycle per user direction (2026-05-02). Out of all wave scopes.
5. **Devnet SOL:** unlimited per user. Track total in final report. ✓
6. **No drops.** Everything stays. ✓

## 🛡️ Bulletproof completion criteria (per stream)

Each stream is CLOSED only when ALL of:

- Files listed in stream entry exist + typecheck clean.
- Verification step listed in stream entry executed + passing.
- New tests added (where stream creates user-visible feature).
- `FINDINGS.md` updated with closure log if the stream addresses an audit finding.
- `PROJECT_STATUS.md` updated to reflect the new shipped state.
- The wave's self-review checkpoint passes after the stream lands.

## ⚠️ Anti-drift rules (read every wave)

- **Do not skip the NVIDIA NIM smoke test** in Wave 0. If it fails, fix before proceeding.
- **Do not use OpenAI / Anthropic / paid APIs anywhere** — NVIDIA NIM is canonical. If existing code uses paid APIs, swap to NIM.
- **Do not ship a stream with a "TODO follow-up"** — file a new finding instead.
- **Do not skip cross-language SDK parity** — any change to ix data / kernel commit / canonical JSON updates TS + Python + Rust + their goldens together.
- **Do not let the regression net rot** — rerun all keypair harnesses + Playwright + parity smokes between waves. If anything breaks, fix before moving on.
- **Do not push to main / git** unless explicitly told. AI works on the local tree.
- **Do not rotate / publish / deploy outside devnet** — mainnet rotation + npm publishes are operator actions.

## 🎬 Ready to start

User said: **"reply when plan is done — I'm ready."**

This plan is now bulletproof:
- Every decision locked above.
- LLM provider standardized (NVIDIA NIM).
- Anchor deploy AI-attemptable.
- Self-review between waves.
- Anti-drift rules listed.
- Completion criteria explicit per stream.
- Operator-only items separated cleanly.

**Total: ~130-150 hrs, 26 implementation items + 13 test phases + final convergence, 6 waves (0-5). (i18n F6 deferred.)**

Awaiting GO signal to execute. On GO: I'll run Wave 0 (pre-flight + NIM smoke) and proceed straight through Waves 1 → 2 → 3 (implementation) → **Wave 4 (full E2E test pass — non-negotiable convergence)** → Wave 5 (final convergence + SHIP_READY) without pausing for permission, per FINISH_IT autonomy rules.

**Wave 4 is the proof.** No "we built it but didn't test it." Every feature gets exercised. The 8-step DON'T-GIVE-UP checklist enforces no easy-way-out.
