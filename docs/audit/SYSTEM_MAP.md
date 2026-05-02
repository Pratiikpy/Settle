# SYSTEM_MAP.md — Phase 0

Snapshot of the codebase as of audit run 2026-05-02.

## Workspaces

| Path | Name | Version | Purpose |
|------|------|---------|---------|
| apps/web | @settle/web | 0.1.0 | Next.js 15 App Router — all UI surfaces (user/merchant/admin/agent) |
| apps/indexer | @settle/indexer | 0.1.0 | Anchor event subscriber → Supabase mirror |
| apps/demo-agent | @settle/demo-agent | 0.1.0 | Agent SDK demo |
| apps/demo-merchants | @settle/demo-merchants | 0.1.0 | Merchant SDK demo |
| packages/sdk | @settle/sdk | 0.1.0 | TS canonical SDK |
| packages/types | @settle/types | 0.1.0 | Shared types |
| packages/ui | @settle/ui | 0.2.0 | Design system |
| packages/mcp-middleware | @settle/mcp-middleware | 0.1.0 | MCP protocol wrapper |
| packages/python-sdk | settle-sdk | (pyproject) | Python parity |
| packages/rust-sdk | settle-sdk (cargo) | (Cargo.toml) | Rust parity |
| programs/settle-agent-card | (Anchor) | (Anchor.toml) | On-chain program |

## Anchor Program — 15 instructions (PROJECT_STATUS says 13; STRATEGY says 14 — DOC_DRIFT)

Source: `programs/settle-agent-card/programs/settle-agent-card/src/lib.rs`

1. `create_card`
2. `spend`
3. `spend_via_pact`
4. `revoke`
5. `record_denial`
6. `open_pact`
7. `close_pact`
8. `open_streaming_pact`
9. `claim_streaming`
10. `pause_streaming`
11. `resume_streaming`
12. `open_delivery_escrow`
13. `release_delivery_escrow`
14. `dispute_delivery_escrow`
15. `record_receipt`

Per-instruction module files exist under `src/instructions/` (16 .rs files; mod.rs + 15 instruction files).

## Anchor Events — 13 (PROJECT_STATUS says 14 — DOC_DRIFT)

Source: `programs/settle-agent-card/programs/settle-agent-card/src/events.rs`

1. PolicyDecisionEvent
2. CardCreatedEvent
3. CardRevokedEvent
4. PactOpenedEvent
5. PactClosedEvent
6. PactSpendEvent
7. StreamingPactOpenedEvent
8. PactStreamClaimEvent
9. PactStreamPauseEvent
10. DeliveryEscrowOpenedEvent
11. DeliveryEscrowReleasedEvent
12. DeliveryEscrowDisputedEvent
13. ReceiptRecordedEvent

Note: no `StreamingPactResumedEvent` despite `resume_streaming` instruction existing — needs Phase 3 verification.

## Supabase Migrations — 45 confirmed (matches PROJECT_STATUS claim)

```
0001_init                          0024_imported_receipts
0002_handles                       0025_capability_registry
0003_privacy_toggle                0026_idempotency_keys
0004_push_subscriptions            0027_bookkeeper_categories
0005_agent_templates               0028_autorefill_and_fraud
0006_canonical_persistence         0029_phase5_consumer_breadth
0007_refund_requests               0030_receipt_federation
0008_receipt_attachments           0031_phase5_executions
0009_pricelist                     0032_federation_origin_keys
0010_payment_links                 0033_federation_webhook_delivery
0011_streaming_pacts               0034_scheduled_send_pact
0012_follows                       0035_phase5_executions_dedup
0013_request_timing                0036_gift_pact
0014_capability_leaderboard        0037_group_spend_requests
0015_delivery_escrow               0038_refund_decisions
0016_collabs_and_split_bills       0039_allowance_schedule_link
0017_reputation_badges             0040_round_up_queue
0018_compressed_receipts           0041_auto_refill_v2
0019_receipt_kernel                0042_merchant_webhooks
0020_receipt_narration_and_emoji   0043_refund_linkage
0021_trust_scores                  0044_domain_verification_tokens
0022_receipt_search                0045_streaming_claim_queue
0023_receipt_tags
```

## API Routes — 124 total

Top-level groupings (sample; full list in route enumeration):
- /api/actions/* (Solana Actions for hire/request/revoke/router)
- /api/admin/* (cron, federation)
- /api/agents/* (create-card, credential, spawn)
- /api/allowances/* (CRUD + spawn-kid-card + attach-kid-card)
- /api/audit/phase5
- /api/auth/challenge (wallet sign-in)
- /api/auto-refill/* (rules + spawn-pact + attach-pact)
- /api/bookkeeper/categorize
- /api/capabilities
- /api/cards/* (per-card management, bulk-close, list, delegated)
- /api/cnft/* (cNFT metadata for compressed receipts)
- /api/collabs/* (collab payments)
- /api/cron/phase5-tick + phase5-signer
- /api/dashboard
- /api/disputes/draft (AI draft)
- /api/escrows/* (delivery escrow)
- /api/federation/* (import + list + origin keys)
- /api/feed
- /api/follows/*
- /api/fraud/scan
- /api/gift-sends/* (CRUD + claim + spawn-pact + attach-pact)
- /api/graphql
- /api/group-accounts/* (CRUD + approve + request-spend)
- /api/handles/* (CRUD + claim + by-pubkey)
- /api/health
- /api/import/solana-pay
- /api/intent/parse (NL intent parser)
- /api/internal/push (push notification trigger)
- /api/leaderboard/*
- /api/ledger
- /api/merchants/* ([handle]/* — analytics, disputes, profile, webhook + verify-domain)
- /api/notifications/subscribe (web-push)
- /api/payment-links/*
- /api/preflight (config gates)
- /api/price/sol-usd

(continues — full enumeration in detailed route file as Phase 6 progresses)

## UI Routes — 66 total

```
/                      /allowances/           /at/[handle]/
/activity/             /audit/                /blink/[slug]/
/admin/cron/           /admin/federation/origins/
/admin/health/         /admin/preflight/
/agents/               /agents/collab/        /agents/streaming/
/agents/templates/     /agents/templates/[slug]/
/agents/templates/new/
/capabilities/         /cards/                /cards/[id]/
/cards/new/            /claim/[escrow]/       /collab/[id]/
/control-center/       /dashboard/            /docs/
/docs/mcp/             /docs/pay-component/   /docs/verify-component/
/docs/webhooks/        /feed/                 /groups/
/help/                 /import/               /leaderboard/
/leaderboard/[capabilityHash]/                /ledger/
/m/[handle]/           /m/[handle]/analytics/
/m/[handle]/capabilities/
/m/[handle]/disputes/
/m/[handle]/manage/    /m/[handle]/verify/
/m/[handle]/webhook/
/onboarding/           /pay/                  /pay/[token]/
/pay/widget/           /public-goods/         /qr/[merchant]/[slug]/
/receipts/[requestId]/
/receipts/[requestId]/print/
/request/              /sandbox/              /security/
/send/                 /send/link/            /send/voice/
/settings/             /settings/relayer/     /spending/
/split-bill/           /split-bill/[id]/      /stats/
/verify/[hash]/        /verify-build/         /wishes/
```

**Routes NOT mentioned in PROJECT_STATUS:** `/at/[handle]`, `/blink/[slug]`, `/qr/[merchant]/[slug]`, `/onboarding`, `/control-center`, `/help`, `/security`, `/import`, `/sandbox`, `/activity`, `/agents/collab`, `/agents/streaming`, `/agents/templates`, `/cards/new`, `/claim/[escrow]`, `/collab/[id]`, `/docs/mcp`, `/docs/pay-component`, `/docs/verify-component`, `/docs/webhooks`, `/leaderboard`, `/leaderboard/[capabilityHash]`, `/feed`, `/public-goods`, `/request`, `/split-bill`, `/split-bill/[id]`, `/verify-build`, `/verify/[hash]`, `/pay/[token]`, `/pay/widget`. **31 unclaimed routes.** Need Phase 8 reachability + Phase 13 dead-code sweep.

## Scripts — 41 files in scripts/

Categorized:
- **Devnet harnesses:** e2e-payment-flow.ts, phase5-live-test.ts, phase5-live-all-intents.ts, phase5-idempotency-drill.ts, smoke-path-a-direct-send.ts, smoke-record-receipt.ts
- **Parity smoke:** smoke-multikind-goldens.ts, smoke-ix-data-parity.ts, smoke-python-parity.ts, rust-parity-smoke.rs
- **Keygens:** vapid-keygen.ts, seal-keygen.ts, badge-keygen.ts, deployer-keygen.ts, zk-receipt-keygen.ts
- **Funding:** airdrop-facilitator.ts, transfer-sol.ts, fund-test-wallet-sol.ts
- **Verification:** verify-idl.ts, verify-migrations.ts, smoke-verify-build.ts, check-idl-drift.ts, check-test-wallet.ts, check-usdc-balances.ts
- **Setup:** seed-supabase.ts, seed-demo-card.ts, seed-capabilities.ts, cnft-setup.ts, zk-receipt-mint-setup.ts, create-settle-merchant.ts, bootstrap-test-wallet.ts
- **Audit:** audit-indexer-handlers.ts, compute-program-hash.ts, debug-tx-shape.ts, probe-ddl.ts
- **Federation:** federation-attest.ts, federation-bridge-solana-pay.ts, smoke-receipt-importer.ts
- **Maintenance:** consolidate-sol-to-deployer.ts
- **Migrations:** supabase-apply-migrations.mjs

## Doc surface

Root: `README.md`, `PROJECT_STATUS.md`, `MAINNET_MIGRATION.md`, `SECURITY.md`, `SETUP.md`, `submission.md`, `THIRD_PARTY_NOTICES.md`, `codex_strategry.md`.

`docs/`: `STRATEGY.md` (~150 features, 14 disciplines), `BUILD_ORDER.md` (week-by-week), `PRODUCT_SPEC.md` (v0.3 spec), `DEVNET_PRODUCT_CAPABILITY_SPEC.md`, `TESTING.md`, `v0.3-build-plan.md`, `project-knowledge/` subdir, `audit/` (this directory).

## Recent commits (top 10)

```
17ddb08 fix: indexer handleCardCreated was logging only, not upserting to agent_cards
b1d72fe fix: 5 audit-pass bugs blocking devnet bring-up
4367396 fix: 0014 view FILTER syntax + add Management API migration runner
790be4f deploy program to devnet — HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD
6734981 spec: document F23/F24/F25 + P11/P12/P13 (next-level wave)
ecdc350 audit pass: surface next-level features in README + homepage + docs
42487dc add ZK Compression mirror for ALLOW receipts via Light Protocol
f13d9d4 add soulbound reputation badges via MPL Core
dca5ccb feat: capability heatmap on /leaderboard — live market view
d85ea50 feat: receipt-as-story forensic timeline
```

Note: a recent fix commit (`17ddb08`) acknowledges that indexer's `handleCardCreated` was previously logging-only without upserting — confirming the audit's emphasis on doc-vs-runtime drift.

## Known surface mismatches (Phase 0 preliminary)

Things claimed by docs but no top-level evidence:
- **Chrome extension** — no apps/* or packages/* match. NOT mentioned in PROJECT_STATUS but worth confirming via spec docs.
- **Mobile app** — no native app. PROJECT_STATUS doesn't claim one.
- **CLI** — no `bin/` or apps/cli — PROJECT_STATUS doesn't claim one.

Things in code but undocumented in PROJECT_STATUS (preliminary list — verify in Phase 1):
- 31 UI routes listed above
- /api/graphql endpoint
- /api/auth/challenge (wallet-sig auth)
- /api/intent/parse (NL parsing)
- /api/fraud/scan
- /api/bookkeeper/categorize
- /api/cnft/* (compressed NFT metadata)
- /api/disputes/draft (AI draft)
- /api/handles/* (multiple endpoints)
- /api/follows/*
- /api/payment-links
- /api/import/solana-pay

## Initial findings deferred to FINDINGS.md

- AU-00-001: instruction count drift (15 actual vs 13/14 claimed)
- AU-00-002: event count drift (13 actual vs 14 claimed)
- AU-00-003: 31 unclaimed UI routes
- AU-00-004: missing StreamingPactResumedEvent (or unification with Pause event needs verification)
