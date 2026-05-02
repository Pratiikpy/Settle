# Feature Traceability Matrix

This file maps product features to code surfaces. A feature is not fully shipped unless it has the required UI/API/data/chain/test path for its scope.

## Core Rule

Do not mark a feature `SHIPPED` because one file exists. Trace it.

Required trace columns:

- Product feature.
- User surface.
- UI route/page.
- API route.
- Database/migration.
- On-chain instruction/event.
- SDK/package support.
- Worker/indexer support.
- Tests/smoke scripts.
- Current truth status.

## High-Level Matrix

| Feature group | UI | API | DB | Chain | SDK/worker | Status note |
|---|---|---|---|---|---|---|
| Dashboard | `/dashboard` | `/api/dashboard` | reads receipts/cards/pacts/stats | none | none | Present; verify data completeness. |
| Settings/profile | `/settings`, `/settings/relayer` | handles, notifications, privacy, relayer APIs | handles, push, privacy columns | mostly none | wallet auth | Present; audit all settings persistence. |
| Send money | `/send`, `/send/link`, `/send/voice` | send/link/claim, intent, swap quote | receipts, payment links, related tables | SPL TransferChecked, memo/reference | SDK receipt builder/kernel | Present; verify universal receipt coverage. |
| AgentCards | `/cards`, `/cards/new`, `/cards/[id]` | cards list/revoke/privacy/pacts/receipts | agent_cards, pacts | create_card, revoke, spend | anchor-client, IDL | Present; runtime chain verification required. |
| OneShot Pact spend | `/agents`, `/cards/[id]` | x402 proxy, cards pacts | pacts, receipts | open_pact, spend_via_pact, close_pact | indexer + SDK | Present; strongest path is x402. |
| Streaming Pact | `/agents/streaming` | streaming-pacts open/claim/pause/resume | streaming/pact migrations, claim queue | open_streaming_pact, claim_streaming, pause/resume | indexer | Present; verify receipt kernel coverage. |
| Delivery escrow | `/claim/[escrow]`, receipt actions | escrows open/release/dispute | delivery escrow migrations | open/release/dispute_delivery_escrow | escrow cron/indexer | Present; verify UX and receipt linkage. |
| Refund-by-emoji | receipt page | receipts refund/refund-links | refund_requests, refund_decisions/linkage | close_pact or dispute_delivery_escrow | receipt UI | Present/partial; verify all mode branches. |
| Receipt object | `/receipts/[requestId]`, print | receipts route, verify, tags, narrate, decrypt, attachments | receipts, tags, narration, attachments | policy/receipt events | SDK verifier, indexer | Present; universal kernel remains key risk. |
| Receipt imports/federation | `/import`, admin federation | import, federation list/origins/retry | imported/federation migrations | imported Solana Pay proofs | federation scripts/workers | Present; verify trust model. |
| Merchant profile | `/m/[handle]/*` | merchants profile/analytics/disputes/webhook | merchant tables, pricelist, webhooks | payments/refunds as applicable | webhooks | Present; audit end-to-end UX. |
| Public handle/profile | `/at/[handle]` | handles profile/relationship/badges | handles, follows, badges | payments via links/actions | Blink router | Present; verify route/API consistency. |
| Blinks/Actions | `/blink/[slug]`, actions API | actions router/request/revoke/hire | handles/templates/pricelist | Solana Actions tx building | anchor-client | Present; requires registry/domain for distribution. |
| Split bill | `/split-bill`, `/split-bill/[id]` | split-bills routes | split_bills, split_bill_payments | SPL payments; possibly pact flows | scripts/tests | Present; verify duplicate payment prevention. |
| Collab | `/agents/collab`, `/collab/[id]` | collabs routes | collabs | split/collab ix or payment logic | anchor/client | Present; verify actual chain settlement. |
| Group accounts | `/groups`, `/g/[group_id]/request/[request_id]` | group-accounts routes | group migrations | approval/payment paths | phase workers | Present; verify authority model. |
| Allowances | `/allowances` | allowances routes | allowance migrations | AgentCard/Pact framing | scheduled/phase workers | Present; verify user framing. |
| Scheduled sends | routes in API | scheduled-sends routes | scheduled_send_pact migration | Pact/top-up/spawn flows | cron phase workers | Present; verify timing semantics. |
| Gift sends | API + claim flow | gift-sends routes | gift migrations | Pact/payment claim | phase workers | Present; verify claim auth. |
| Auto-refill | API routes | auto-refill routes | auto_refill migrations | top-up/spawn flows | phase workers | Present; verify cap safety. |
| Round-up/save-for/wishes | pages/API | round-up, save-for | phase5 migrations | mostly payment/accounting | phase workers | Present; likely needs deep UX audit. |
| Leaderboard/capabilities | `/leaderboard`, `/capabilities` | leaderboard, capabilities | capability_leaderboard, registry | receipt-derived | indexer/stats | Present; verify public/private filters. |
| Badges | components/profile | handles badges, cnft metadata | reputation_badges | MPL Core/badge mint | badge cron | Present; verify signer/key setup. |
| ZK/compressed receipts | receipt/card surfaces | cnft metadata routes | compressed_receipts migration | Light/Photon | compress cron | Present; requires Helius/Photon config. |
| Developer docs | `/docs/*` | GraphQL, verify, webhook | none | none | SDK/MCP | Present; audit docs-code accuracy. |
| MCP middleware | no UI required | package API | none | payment adapter | package tests | Present; verify protocol correctness. |
| Python/Rust SDKs | no UI | package APIs | none | verification/parity | parity tests | Present; verify parity scripts. |
| Chrome extension | none found | none found | none | none | none | Missing/not present in repo. |

## Highest-Priority Traceability Risk

Universal Receipt Kernel: all payment kinds must converge to the same receipt commit/verify model. Any flow that writes money movement without the kernel should remain `PARTIAL`.

