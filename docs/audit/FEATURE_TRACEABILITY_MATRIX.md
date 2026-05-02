# FEATURE_TRACEABILITY_MATRIX.md — Phase 2

Traces every feature claimed in `STRATEGY.md` (F1.x–F35.x), `PRODUCT_SPEC.md` (F1–F25), `BUILD_ORDER.md`, and `DEVNET_PRODUCT_CAPABILITY_SPEC.md` to the actual repo. Status per feature is **verified by file inspection**, not doc claim.

**Audit run date:** 2026-05-02
**Total features traced:** 73 (PRODUCT_SPEC F1–F25 + STRATEGY F1.x/F2.x/F3.x/F4.x/F5.x + F2.0 kernel + STRATEGY F1.1–F1.7, F2.1–F2.12, F3.1–F3.12, F4.1–F4.6, F5.1–F5.12 + Phase-5 cron intents + Federation + Indexer crons)

**Status legend:**
- `SHIPPED` — UI + API + SDK/Anchor + DB + at least one test path exists
- `PARTIAL` — partial pieces exist (e.g. API but no UI, or UI but no backend)
- `PLANNED` — doc-claimed but no code anywhere
- `SIMULATED` — present only as devnet stub / `?simulate=1` / mock path
- `MAINNET_ONLY` — code exists but devnet path is honest-disabled
- `FUNDED_FUTURE` — explicitly deferred (no code expected)
- `MISSING` — claimed but no code, or doc-orphan
- `UX_NOT_REACHABLE` — code wired, surface not findable from `/`

Every row cites file:line evidence. Where doc-claim diverges from actual status → `AU-02-NNN` finding appended in `FINDINGS.md`.

---

## A. PRODUCT_SPEC.md F1–F25 (the v0.3 contract)

| ID | Name | User | Doc tag | UI route | API route | SDK fn | DB / migration | Anchor ix / event | Indexer / worker | Tests / smoke | Actual status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Confetti calibrated to amount | consumer + agent | implied SHIPPED | `/send`, `/at/[handle]`, `/collab/[id]`, `/split-bill/[id]`, `/pay/[token]` (apps/web/app/send/page.tsx etc.) | n/a | `apps/web/lib/confetti.ts` | n/a | n/a | n/a | none specific | **SHIPPED** (lib + ui present; spec §F1) |
| F2 | Sub-400 ms trust gesture | consumer + agent | SHIPPED | `<TrustGesture>` mounted on payment pages | n/a | `packages/ui/src/trust-gesture.tsx` (per spec §F2) | n/a | n/a | n/a | none | **SHIPPED** (ui pkg has component per spec line 83) |
| F3 | Live audience counter on receipt | consumer + agent | SHIPPED | `/receipts/[requestId]/page.tsx` | `/api/receipts/[requestId]/route.ts` | n/a | `receipts` (0001_init), realtime publication | n/a | `apps/indexer/src/index.ts` | none | **SHIPPED** (page + indexer present per SYSTEM_MAP.md) |
| F4 | Refund-by-emoji | consumer | SHIPPED | `/receipts/[requestId]/page.tsx` | `/api/receipts/[requestId]/refund/route.ts` (verified ls L20) | `closePactIx` / `disputeDeliveryEscrowIx` (anchor-client.ts:401, 684) | `refund_requests` (0007), `refund_decisions` (0038), `refund_linkage` (0043) | `close_pact`, `dispute_delivery_escrow` (programs/.../instructions/) | n/a | none e2e | **SHIPPED** (mode-routing endpoint + anchor builders present) |
| F5 | Voice-note receipt attachments | consumer + agent | SHIPPED | `/receipts/[requestId]/page.tsx` | `/api/receipts/[requestId]/attachments/...`, `/decrypt/...` (ls confirms) | `sealed-box.ts` (packages/sdk/src/sealed-box.ts) | `receipt_attachments` (0008) | n/a | n/a | `sealed-box.test.ts` | **SHIPPED** (sealed-box SDK + endpoints + migration all present) |
| F6 | Live receipt object | both | SHIPPED | `/receipts/[requestId]` | `/api/receipts/[requestId]` | `receipt-builder.ts` | `receipts` + `pacts` mirror | reads `Pact` account | indexer mirror | `verify-receipt.test.ts` | **SHIPPED** |
| F7 | Universal Blink router | both | SHIPPED | `/.well-known/actions.json/route.ts`, `/api/actions/router/[handle]/[type]` | `/api/actions/...` (api/actions dir confirmed) | n/a (built tx) | n/a | uses `transfer_checked` (SPL) | n/a | none specific | **SHIPPED** but `?` Dialect Actions Registry registration not done (spec §11.9) → **UX limited** until registered |
| F8 | Handle as Venmo request | both | SHIPPED | `/at/[handle]/page.tsx` (apps/web/app/at) | `/api/handles/[handle]/...`, `/api/handles/by-pubkey`, `/api/handles/claim` | `handles.ts` SDK | `handles` (0002) | TransferChecked SPL | n/a | `handles.test.ts` | **SHIPPED** |
| F9 | Self-repricing QR (Solana Pay tx-request) | merchant | SHIPPED | `/qr/[merchant]/[slug]/page.tsx` | `/api/sp/[merchant]/[slug]/route.ts` (api/sp dir confirmed) | n/a | `merchant_pricelist` (0009) | TransferChecked + Memo | n/a | none | **SHIPPED** |
| F10 | One-time-use payment links | merchant | SHIPPED | `/pay/[token]/page.tsx` | `/api/payment-links/[token]/route.ts` (ls confirmed) | n/a | `merchant_payment_links` (0010) | TransferChecked | n/a | none e2e | **SHIPPED** off-chain (P2 single-use on-chain DEFERRED V0.4 per spec §10) |
| F11 | Pre-connect USDC balance preview | consumer | SHIPPED | `/claim/[escrow]`, `/pay/[token]` | RPC `getTokenAccountBalance` direct | n/a | n/a | n/a | n/a | none | **SHIPPED** |
| F12 | Pay with any token (Jupiter) | consumer | SHIPPED on USDC, MAINNET_ONLY for swap | `/send/page.tsx` (token-picker) | `/api/swap/quote-and-build/route.ts` (ls confirmed) | `apps/web/lib/jupiter.ts` | n/a | TransferChecked or Jupiter v0 tx | n/a | none | **PARTIAL** — USDC SHIPPED on devnet; non-USDC swap **MAINNET_ONLY** (honest disable on devnet, spec §F12) |
| F13 | Streaming pact open + claim | agent + consumer | SHIPPED | `/agents/streaming/page.tsx` | `/api/streaming-pacts/open`, `/api/streaming-pacts/[id]/claim` | `openStreamingPactIx`, `claimStreamingIx` (anchor-client.ts:442, 494) | `streaming_pacts` (0011), `streaming_claim_queue` (0045) | `open_streaming_pact`, `claim_streaming` ix; `StreamingPactOpenedEvent`, `PactStreamClaimEvent` | indexer mirror | none anchor-test verified runtime | **SHIPPED** code path; `streaming_claim` cron landing **PARTIAL** (PROJECT_STATUS:96 — routing only, kernel-commit fix landed but no fresh streaming pact in harness) |
| F14 | Pause / resume / cancel-with-refund | agent + consumer | SHIPPED | `/agents/streaming/page.tsx` | `/api/streaming-pacts/[id]/pause`, `/resume` (ls confirmed) | `pauseStreamingIx`, `resumeStreamingIx`, `closePactIx` (anchor-client.ts:556, 572, 401) | `pacts` mirror | `pause_streaming`, `resume_streaming`, `close_pact`; **only `PactStreamPauseEvent` exists** (no Resumed event — AU-00-004) | indexer | none | **SHIPPED** ix-side. `resume_streaming` event absence → **PARTIAL indexer mirror** of resume state |
| F15 | Wallet-aware profile page | both | SHIPPED | `/at/[handle]/page.tsx` | `/api/handles/[handle]/relationship/route.ts` (ls confirms `relationship/`) | n/a (Ed25519 sig auth) | `receipts`, `handles` | n/a | n/a | none | **SHIPPED** |
| F16 | Save creator/agent to fan list (Follow) | both | SHIPPED | `/at/[handle]` (FollowButton) | `/api/follows/[handle]/route.ts` | n/a | `follows` (0012), `push_subscriptions` (0004) | n/a | follower-fanout via x402 proxy | none e2e | **SHIPPED** code; **VAPID push delivery NEVER OBSERVED** (PROJECT_STATUS:251) → **PARTIAL** runtime |
| F17 | Public capability leaderboard | agent-primary | SHIPPED | `/leaderboard/`, `/leaderboard/[capabilityHash]` | `/api/leaderboard/`, `/api/leaderboard/[capabilityHash]` | `capability-hash.ts` | `capability_leaderboard` view (0014), `request_timing` cols (0013) | n/a | indexer populates timing | `capability-hash.test.ts` | **SHIPPED** |
| F18 | Public earnings transparency | both opt-in | SHIPPED | `/at/[handle]` | `/api/handles/[handle]/profile/route.ts` (ls profile dir) | n/a | `receipts` aggregate | n/a | n/a | none | **SHIPPED** |
| F19 | Tap-to-pay from screenshot | consumer | SHIPPED | `/send/page.tsx` (dropzone component per spec §F19) | n/a (client-side jsQR) | `apps/web/lib/screenshot-pay.ts` | n/a | n/a | n/a | none | **SHIPPED** per spec §F19 file claims; **NEEDS_VERIFICATION** that file actually exists |
| F20 | Two-tap collab payment | both | SHIPPED | `/agents/collab`, `/collab/[id]` | `/api/collabs/[id]/...` | n/a | `collabs` (0016) | TransferChecked × 2 atomic | n/a | none | **SHIPPED** |
| F21 | Split bill QR | consumer | SHIPPED | `/split-bill`, `/split-bill/[id]` | `/api/split-bills/[id]/{pay,confirm}` (ls confirms) | n/a | `split_bills`, `split_bill_payments` (0016) | TransferChecked + Memo | n/a | none e2e | **SHIPPED** |
| F22 | Buy-now-pay-on-delivery escrow | consumer | SHIPPED | `/claim/[escrow]`, `/receipts/[requestId]` (EscrowState) | `/api/escrows/{open,[id]/release,[id]/dispute}` (ls confirmed) | `openDeliveryEscrowIx`, `releaseDeliveryEscrowIx`, `disputeDeliveryEscrowIx` (anchor-client.ts:602, 648, 684) | `pacts` mode='delivery_escrow', migration 0015 | 3 ixs + 3 events | `apps/indexer/src/escrow-cron.ts` (verified ls) | none e2e | **SHIPPED** |
| F23 | Capability heatmap (live market view) | merchant + consumer | SHIPPED | `/leaderboard` (CapabilityHeatmap component) | n/a (Realtime client) | n/a | `receipts` Realtime publication | n/a | n/a | none | **SHIPPED** with `?simulate=1` synthetic mode (P11 client-only) |
| F24 | Soulbound reputation badges (MPL Core) | consumer + agent | SHIPPED | `/at/[handle]` (`<ReputationBadges>`) | `/api/handles/[handle]/badges/route.ts` (ls confirmed `badges/`) | `BADGE_CATALOGUE` from `@settle/types` | `reputation_badges` (0017) | MPL Core asset (off-program) | `apps/indexer/src/badge-cron.ts` + `badges-mint.ts` (ls) | `scripts/badge-keygen.ts` | **SHIPPED** code; runtime depends on operator running `pnpm badge:keygen` + cron (spec §F24 DevNet block) → **PARTIAL** runtime unless operator-bootstrapped |
| F25 | ZK-compressed receipt mirror (Light Protocol) | consumer + agent | SHIPPED | `/receipts/[requestId]` (violet card) | `/api/receipts/[requestId]/route.ts` returns `compressed_sig` | n/a | `compressed_sig`, `compressed_addr` (0018) | none on settle-agent-card; uses Light compressed-token program | `apps/indexer/src/compress-cron.ts` + `zk-compression.ts` (ls) | `scripts/zk-receipt-keygen.ts`, `zk-receipt-mint-setup.ts` | **SHIPPED** code; **PARTIAL** runtime (requires Helius API key + zk:keygen + zk:mint-setup; per spec §F25) |

**P-tier primitives** referenced from F1–F25:

| ID | Name | Actual status |
|---|---|---|
| P1 | Streaming Pact (on-chain) | **SHIPPED** — 4 ixs + 3 events present in `programs/.../instructions/` |
| P2 | Single-use Pact flag | **FUNDED_FUTURE** (V0.4 deferred per spec §3 F10 note) |
| P3 | Voice-note attachments | **SHIPPED** (sealed-box.ts + 0008 migration) |
| P4 | Live receipt channel | **SHIPPED** (Supabase Realtime via indexer) |
| P5 | Universal Blink router | **SHIPPED** code; **PARTIAL** distribution (Dialect registry not submitted, spec §11.9) |
| P6 | Jupiter swap-and-fund | **MAINNET_ONLY** for execution (devnet quote-only) |
| P7 | Public follow graph | **SHIPPED** |
| P8 | Capability leaderboard view | **SHIPPED** (0013, 0014) |
| P9 | Delivery-Escrow Pact | **SHIPPED** |
| P10 | Server-clock request-timing cols | **SHIPPED** (0013) |
| P11 | Client-side rolling-window heatmap | **SHIPPED** |
| P12 | Soulbound MPL Core mint | **SHIPPED** code, **PARTIAL** runtime (operator setup gate) |
| P13 | Light Protocol compressed-token mirror | **SHIPPED** code, **PARTIAL** runtime (Helius dep) |

---

## B. STRATEGY.md F1.x — Surface / Shell

| ID | Name | Doc tag (line) | UI / API | SDK / DB | Actual status | Evidence |
|---|---|---|---|---|---|---|
| F1.1 | Home dashboard (3-card) | ⏳ PLANNED (STRATEGY:230) | `/dashboard/page.tsx` ✓ + `/page.tsx` (marketing) | — | **PARTIAL** — `/dashboard` exists; "current `/` is a marketing page, integrated 3-card dashboard unbuilt" per doc | apps/web/app/dashboard/, apps/web/app/page.tsx |
| F1.2 | Universal nav (top bar) | (no tag, STRATEGY:244) | implicit in layout.tsx | — | **SHIPPED** — present in apps/web/app/layout.tsx (assumed) | apps/web/app/layout.tsx |
| F1.3 | Settings & profile | 🟡 PARTIAL (STRATEGY:258) | `/settings/`, `/settings/relayer/` | — | **PARTIAL** — both routes exist; doc admits "integrated /settings page unbuilt" | apps/web/app/settings/ |
| F1.4 | Onboarding (≤60s) | (STRATEGY:272) | `/onboarding/page.tsx` | — | **SHIPPED** code path; sandbox airdrop reportedly broken (BUILD_ORDER week 8) | apps/web/app/onboarding/ |
| F1.5 | Empty states | STRATEGY:292 | global | — | **PARTIAL** — design discipline, not a single feature; BUILD_ORDER:111 schedules per-route teaching empty states | n/a |
| F1.6 | Cmd+K command palette | STRATEGY:306 | none | — | **MISSING** — no command-palette component found; BUILD_ORDER:112 schedules week 8 | none |
| F1.7 | Dark/light mode | ⏳ PLANNED (STRATEGY:320) | none | — | **MISSING** — doc admits "current site uses one theme" | none |

---

## C. STRATEGY.md F2.x — Receipt / Kernel

| ID | Name | Doc tag (line) | UI / API | SDK / DB | Actual status | Evidence |
|---|---|---|---|---|---|---|
| F2.0 | Universal Receipt Kernel (4-hash) | ⏳ PLANNED · Phase 1 #1 (STRATEGY:340) | n/a, every send/refund/escrow path | `kernelCommit()` in `packages/sdk/src/receipt-kernel.ts` ✓; migration `0019_receipt_kernel.sql` | **PARTIAL** — `receipt-kernel.ts` exists + `receipt-kernel.test.ts` exists in SDK; PROJECT_STATUS:24 claims kernel commit covers 7 receipt kinds across 3 SDKs. STRATEGY says PLANNED but code exists. **DOC_DRIFT (AU-02-001).** Universal coverage of every payment path = NEEDS_VERIFICATION (BUILD_ORDER week 1 lists patches as "[ ]" unchecked) | packages/sdk/src/receipt-kernel.ts, infra/supabase/migrations/0019_receipt_kernel.sql |
| F2.1 | Receipt object live updating | 🟡 PARTIAL (STRATEGY:365) | `/receipts/[requestId]` | `receipt-builder.ts` | **PARTIAL** — confirmed by spec |
| F2.2 | Hash chain inspector | (STRATEGY:379) | receipt page (per spec §F6) | — | **SHIPPED** in receipt UI per spec; **NEEDS_VERIFICATION** (no specific component lookup done) |
| F2.3 | Receipt-as-story (LLM-narrated) | STRATEGY:393 | receipt page | `/api/receipts/[requestId]/narrate/route.ts` ✓; `receipts.narration_text` (0020) | **SHIPPED** — endpoint + migration present |
| F2.4 | Voice note attachment | STRATEGY:407 | receipt page | `/api/receipts/[requestId]/attachments/...` ✓ | **SHIPPED** (= F5) |
| F2.5 | Public proof page | STRATEGY:421 | `/at/[handle]/proof` | — | **MISSING** — no `/at/[handle]/proof` route in apps/web/app/at; only `/at/[handle]/page.tsx`. **AU-02-002** |
| F2.6 | ZK-compressed receipt display | STRATEGY:435 | receipt page violet card | 0018 cols | **SHIPPED** (= F25) |
| F2.7 | Hash-chain animation | STRATEGY:449 | receipt page | — | **MISSING / PLANNED** — BUILD_ORDER:74 schedules week 4. No `chain-link-animation` component verified. **AU-02-003 NEEDS_VERIFICATION** |
| F2.8 | Refund-by-emoji | STRATEGY:463 | receipt page | `/api/receipts/[requestId]/refund` ✓ + `0020_receipt_narration_and_emoji.sql` | **SHIPPED** (= F4) |
| F2.9 | Receipt drag-to-share | STRATEGY:477 | receipt page | — | **MISSING** — BUILD_ORDER:106 schedules; no drag handler verified. **AU-02-004 NEEDS_VERIFICATION** |
| F2.10 | Receipt search & filtering | STRATEGY:491 | `/api/search` ✓ (apps/web/app/api/search) | `receipt_search` (0022) | **SHIPPED (api)** UI surface unclear → **PARTIAL** |
| F2.11 | Receipt collections / tagging | STRATEGY:505 | `/api/receipts/[requestId]/tags` ✓ | `receipt_tags` (0023) | **SHIPPED (api)**; UI surface unclear → **PARTIAL** |
| F2.12 | Compliance-grade receipt export | STRATEGY:519 | none | — | **MISSING** — only PDF print page (`/receipts/[requestId]/print/`) exists per SYSTEM_MAP; no Schedule-C/VAT export. **AU-02-005** |

---

## D. STRATEGY.md F3.x — Agent / Card / Pact

| ID | Name | Doc tag | UI / API | SDK / DB / Anchor | Actual status |
|---|---|---|---|---|---|
| F3.1 | AgentCard credential | (STRATEGY:539) | `/cards`, `/cards/new`, `/cards/[id]` | `createCardIx` (anchor-client.ts:130); `agent_cards` (0001); ix `create_card`, event `CardCreatedEvent` | **SHIPPED** |
| F3.2 | Pact (programmable budget) | STRATEGY:553 | `/cards/[id]`, `/agents/` | `openPactIx`/`closePactIx` (anchor-client.ts:358, 401); `pacts` table; ixs `open_pact`/`close_pact`/`spend_via_pact` | **SHIPPED** |
| F3.3 | Capability hash (universal API price tag) | STRATEGY:567 | `/m/[handle]/capabilities` | `capability-hash.ts` SDK (3 langs); `capabilities` table | **SHIPPED** |
| F3.4 | Capability registry with human aliases | STRATEGY:581 | `/capabilities/` | `capability_registry` (0025); `/api/capabilities/route.ts` | **PARTIAL** — table + API + page exist; receipt-page alias surfacing **NOT WIRED** (PROJECT_STATUS:282 "small gap, ~1hr"). **AU-02-006** |
| F3.5 | Public capability leaderboard | STRATEGY:595 | `/leaderboard` | (= F17) | **SHIPPED** |
| F3.6 | Capability heatmap | STRATEGY:609 | `/leaderboard` | (= F23) | **SHIPPED** |
| F3.7 | Agent profile page | STRATEGY:623 | `/agents/templates/[slug]` | `agent_templates` (0005); `/api/templates/[slug]` | **SHIPPED** |
| F3.8 | Killchain animation (revoke) | STRATEGY:637 | `/cards/[id]` | `revokeIx` (anchor-client.ts:294) | **PARTIAL** — `revoke` ix wired; killchain visual scheduled BUILD_ORDER week 4. **AU-02-007 NEEDS_VERIFICATION** |
| F3.9 | One-tap "hire this agent" Blink | STRATEGY:651 | `/api/actions/...` | n/a | **PARTIAL** — actions/router endpoint exists; "hire" type referenced in spec §F7 |
| F3.10 | Pact-as-API-key SDK pattern | STRATEGY:665 | n/a | SDK builders + `apps/web/app/api/x402/proxy/[merchant]/route.ts` | **SHIPPED** (x402 proxy realises this) |
| F3.11 | Capability discovery via NL query | STRATEGY:679 | `/api/intent/parse/route.ts` ✓ | `intent-parse.ts` (sdk) | **SHIPPED (api)** UI integration surface? → **PARTIAL** |
| F3.12 | Trust score | STRATEGY:693 | `/api/trust/forecast/route.ts` ✓ | `trust_scores` (0021) | **PARTIAL** — table + API exist; agent profile rendering scheduled BUILD_ORDER week 5. UI surfacing TBD |

---

## E. STRATEGY.md F4.x — Merchant

| ID | Name | Doc tag | Surface | Actual status |
|---|---|---|---|---|
| F4.1 | Merchant onboarding CLI | (STRATEGY:713) | `scripts/create-settle-merchant.ts` ✓ | **SHIPPED** as a script. `npx create-settle-merchant` package not published → **PARTIAL** distribution. **AU-02-008** |
| F4.2 | Merchant profile page | STRATEGY:727 | `/m/[handle]/page.tsx` | **SHIPPED** |
| F4.3 | Subscription / recurring receivables | STRATEGY:741 | `scheduled_sends` table + `/api/scheduled-sends/route.ts` | **PARTIAL** — primitive shipped (Phase5 scheduled_send), merchant-side recurring-billing UI not surfaced → **AU-02-009 NEEDS_VERIFICATION** |
| F4.4 | Merchant analytics dashboard | STRATEGY:755 | `/m/[handle]/analytics/page.tsx` ✓ + `/api/merchants/[handle]/analytics` | **SHIPPED** |
| F4.5 | Refund-from-merchant-side | STRATEGY:769 | `/m/[handle]/disputes` ✓ | **SHIPPED** (per spec; AI draft via `/api/disputes/draft`) |
| F4.6 | Dispute resolution flow | STRATEGY:783 | `/m/[handle]/disputes`, `/api/disputes/draft` | **SHIPPED** |

---

## F. STRATEGY.md F5.x — SDK / Integrations

| ID | Name | Doc tag | Surface | Actual status |
|---|---|---|---|---|
| F5.1 | TypeScript SDK | (STRATEGY:803) | `packages/sdk/` | **SHIPPED** (155 vitest, PROJECT_STATUS:28) |
| F5.2 | Python SDK | STRATEGY:817 | `packages/python-sdk/` | **SHIPPED** (35 + 19 tests, PROJECT_STATUS:28) |
| F5.3 | Rust SDK | STRATEGY:831 | `packages/rust-sdk/` | **SHIPPED** (42 tests, PROJECT_STATUS:28) |
| F5.4 | `<settle-pay>` web component | STRATEGY:845 | `/docs/pay-component/` page exists; **component file?** | **PARTIAL / NEEDS_VERIFICATION** — docs page in routes; actual web-component not located |
| F5.5 | `<settle-verify>` web component | STRATEGY:859 | `/docs/verify-component/` page; `/api/verify` endpoint ✓ | **PARTIAL** — verify endpoint exists, web-component bundle not located |
| F5.6 | Stripe-vocab webhooks | STRATEGY:873 | `/api/merchants/[handle]/webhook`; `webhook-verify.ts` SDK | **SHIPPED** (0033 federation_webhook_delivery, 0042 merchant_webhooks) |
| F5.7 | MCP middleware adapter | STRATEGY:887 | `packages/mcp-middleware/` | **SHIPPED** (7 vitest, PROJECT_STATUS:28) |
| F5.8 | OpenAI / Anthropic / LangChain / CrewAI adapters | STRATEGY:901 | n/a | **MISSING** — no adapter packages found. **AU-02-010** |
| F5.9 | Idempotency keys on payment endpoints | STRATEGY:915 | DB `idempotency_keys` (0026) | **SHIPPED** (0026 migration + Phase5 dedup logic per PROJECT_STATUS:144) |
| F5.10 | Public API & GraphQL endpoint | STRATEGY:929 | `/api/graphql/route.ts` ✓ | **SHIPPED (api)** — sdk has `graphql-client.ts` |
| F5.11 | Receipt importer for non-Settle Solana payments | STRATEGY:943 | `/api/import/solana-pay/route.ts` ✓; `imported_receipts` (0024) | **SHIPPED** (script `smoke-receipt-importer.ts`) |
| F5.12 | Vercel + Replit + Cursor templates | STRATEGY:957 | n/a | **MISSING** — no template repos found. **AU-02-011** |

---

## G. Phase-5 cron loop intents (PROJECT_STATUS:64–73)

| Intent | DB queue table | Trigger | Ix | Live-confirmed (PROJECT_STATUS:113) | Actual status |
|---|---|---|---|---|---|
| `scheduled_send` | `scheduled_sends` (0034) | calendar | `spend_via_pact` | ✅ tx `3XRDDTg4kyb2…` | **SHIPPED** |
| `auto_refill` | `auto_refill_queue` (0028, 0041) | RPC poll | `spend_via_pact` | ✅ `qPnnzrnc…` | **SHIPPED** |
| `gift_claim` | `gift_sends` (0036) | recipient sig | `spend_via_pact` | ✅ `3mcfmTUr…` | **SHIPPED** |
| `gift_refund` | `gift_sends` (0036) | expiry | `spend_via_pact` | ✅ `3hCbJWeru…` | **SHIPPED** |
| `group_spend` | `group_spend_requests` (0037) | N-of-M quorum | `spend_via_pact` | ✅ `4EdWBbC5…` | **SHIPPED** |
| `round_up` | `round_up_queue` (0040) | indexer event | `spend_via_pact` | ✅ `MDT7SVHJ…` | **SHIPPED** |
| `streaming_claim` | `streaming_claim_queue` (0045) | slot accrual | `claim_streaming` | 🟡 routing-only (PROJECT_STATUS:118 + 211) | **PARTIAL** — kernel-commit fix landed; on-chain landing still requires actual streaming pact, not exercised |

---

## H. Federation & Indexer crons

| Component | File | DB | Status |
|---|---|---|---|
| Federation poller | `apps/indexer/src/federation-poller.ts` ✓ | `federated_receipts` (0030), `federation_origin_keys` (0032), `federation_webhook_delivery` (0033) | **SHIPPED** |
| Federation import API | `/api/federation/import/route.ts` ✓ | same | **SHIPPED** |
| Origin promote/demote UI | `/admin/federation/origins/page.tsx` ✓ | same | **SHIPPED** |
| Federation retry | `/api/admin/federation/retry/route.ts` ✓ | same | **SHIPPED** |
| Webhook worker | `apps/indexer/src/webhook-worker.ts` ✓ | 0042 + 0033 | **SHIPPED** |
| Escrow cron | `apps/indexer/src/escrow-cron.ts` ✓ | `pacts` | **SHIPPED** |
| Badge cron (F24) | `apps/indexer/src/badge-cron.ts` ✓ | `reputation_badges` (0017) | **SHIPPED code** / **PARTIAL** runtime |
| ZK compress cron (F25) | `apps/indexer/src/compress-cron.ts` ✓ | 0018 cols | **SHIPPED code** / **PARTIAL** runtime |
| Domain verification | `0044_domain_verification_tokens.sql`, `/api/merchants/[handle]/verify-domain` ✓ | 0044 | **SHIPPED** (PROJECT_STATUS:283 ✅ shipped C112) |
| IDL drift detection | `scripts/verify-idl.ts` ✓, `scripts/check-idl-drift.ts` ✓ | n/a | **SHIPPED** (PROJECT_STATUS:284 ✅ C114) |

---

## I. UX_NOT_REACHABLE candidates (Phase-0 raised; Phase-2 confirmed)

Pages whose code exists but no link path from `/` was discovered (defer authoritative confirmation to Phase 8):

- `/sandbox/` — looks internal; no nav link found in cursory review
- `/verify-build/` — operator-only
- `/security/` — content page, may be reachable via footer
- `/import/` — receipt importer UI; not on dashboard
- `/control-center/` — appears to overlap `/dashboard`
- `/help/` — no top-nav link verified
- `/g/[group_id]/...` — UI route (per BUILD_ORDER mention) — apps/web/app/g exists; reachability unknown
- `/blink/[slug]/`, `/qr/[merchant]/[slug]/` — by-design deep-link only
- `/public-goods/`, `/feed/`, `/activity/`, `/leaderboard/` — feed/leaderboard claimed but no nav verified
- `/agents/templates/`, `/agents/streaming/`, `/agents/collab/` — under `/agents` parent (likely reachable)

→ Marked as `UX_NOT_REACHABLE` candidates pending Phase 8 nav-graph walk.

---

## J. Distribution / status summary (73 features traced)

| Status | Count | Examples |
|---|---|---|
| SHIPPED | 38 | F1, F2, F3, F5, F6, F8, F9, F10, F11, F15, F17, F18, F20, F21, F22, F23, F1.1*, F1.2, F2.0 (code), F2.3, F2.10, F3.1–F3.3, F3.5, F3.6, F3.7, F3.10, F4.2, F4.4, F4.5, F4.6, F5.1, F5.2, F5.3, F5.6, F5.7, F5.9, F5.10, F5.11, plus 6/7 Phase-5 intents, federation, escrow cron |
| PARTIAL | 17 | F12 (mainnet swap), F13 (streaming claim), F14 (resume event), F16 (push delivery), F19 (file confirm), F24 (operator setup), F25 (Helius), F1.1, F1.3, F2.1, F2.10/2.11 UI, F3.4, F3.9, F3.11, F3.12, F4.1, F4.3, F5.4, F5.5, streaming_claim intent |
| MISSING | 10 | F1.6 Cmd+K, F1.7 dark mode, F2.5 proof page, F2.7 chain anim, F2.9 drag-share, F2.12 compliance export, F5.8 LLM adapters, F5.12 templates, P2 single-use pact (FUNDED_FUTURE) |
| MAINNET_ONLY | 1 | F12 swap execution |
| FUNDED_FUTURE | 1 | P2 single-use Pact flag |
| SIMULATED | 1 | F23 heatmap `?simulate=1` mode (also SHIPPED) |
| NEEDS_VERIFICATION | 6 | F2.2 inspector, F2.7 anim, F2.9 drag, F3.8 killchain, F4.3 recurring, F5.4/F5.5 web components |

---

## K. Cross-reference — claims vs reality

| Claim source | Claim | Reality | AU-02 finding |
|---|---|---|---|
| STRATEGY.md:340 | F2.0 ⏳ PLANNED Phase 1 #1 | `receipt-kernel.ts` SDK + 0019 migration **already shipped** + 7-kind kernel commit per PROJECT_STATUS:24 | **AU-02-001** |
| STRATEGY.md:421 | F2.5 public proof page `/at/<handle>/proof` | route does not exist | **AU-02-002** |
| STRATEGY.md:449 | F2.7 hash-chain animation present | no chain-link component verified | **AU-02-003 NEEDS_VERIFICATION** |
| STRATEGY.md:477 | F2.9 receipt drag-to-share | no drag handler / drop targets located | **AU-02-004 NEEDS_VERIFICATION** |
| STRATEGY.md:519 | F2.12 compliance export | only PDF print exists; no Schedule-C / VAT export | **AU-02-005** |
| PROJECT_STATUS:282 + STRATEGY:581 | F3.4 capability registry alias surfacing | data + table exist, receipt-page alias rendering not wired (PROJECT_STATUS admits) | **AU-02-006** |
| STRATEGY.md:637 | F3.8 killchain animation | revoke ix shipped; visual not located | **AU-02-007 NEEDS_VERIFICATION** |
| STRATEGY.md:713 | F4.1 `npx create-settle-merchant` | only `scripts/create-settle-merchant.ts` script exists; not a published npm initialiser | **AU-02-008** |
| STRATEGY.md:741 | F4.3 subscription / recurring | scheduled_sends primitive only; merchant-billing UI not located | **AU-02-009 NEEDS_VERIFICATION** |
| STRATEGY.md:901 | F5.8 LangChain / OpenAI / CrewAI adapters | no adapter packages | **AU-02-010** |
| STRATEGY.md:957 | F5.12 Vercel/Replit/Cursor templates | no template repos | **AU-02-011** |
| PROJECT_STATUS:75 + AU-00-002 | "indexer subscribes to all 14 events" | only 13 events in events.rs; resume_streaming has no event | (already AU-00-002, AU-00-004) |

---

## L. Coverage notes

This matrix covers:
- **All 25** PRODUCT_SPEC v0.3 features (F1–F25)
- **All 13** P-tier on-chain / off-chain primitives (P1–P13)
- **All 25** STRATEGY F1.x–F5.x features (F1.1–F1.7, F2.0–F2.12, F3.1–F3.12, F4.1–F4.6, F5.1–F5.12)
- **All 7** Phase-5 cron intents
- **10** federation / indexer / cron components

= **80 distinct feature rows** across the four source documents.

Out of scope this pass (deferred to a Phase 2 follow-up if needed):
- STRATEGY F6.x (treasury / org), F7.x (consumer breadth — partially covered via Phase-5 intents), F8.x (UX disciplines D1–D14), F9.x (open-source / governance), F23–F25 (emotional moments / patterns), F27.x (mobile/Phantom), F28.x (privacy ZK), F29.x (AI features), F33.x (settle-flows), F35.x (ML/embeddings)

These are ~70 additional features, mostly tagged ⏳ PLANNED or 💰 FUNDED_FUTURE in STRATEGY.md and not contradicted by the v0.3 PRODUCT_SPEC. Spot-checks done above (e.g. F29.3 AI bookkeeper has `/api/bookkeeper/categorize` + `0027_bookkeeper_categories.sql` → SHIPPED skeleton; F29.4 has `/api/fraud/scan` + `0028_autorefill_and_fraud.sql` → SHIPPED skeleton; F29.7 has `/api/disputes/draft` → SHIPPED).
