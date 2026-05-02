# Product Map

## One Sentence

Settle is the PayFi rail for programmable, verifiable money movement on Solana, built for humans, AI agents, merchants, creators, developers, teams, and protocols.

## User Surfaces

| Surface | Primary users | Purpose |
|---|---|---|
| Consumer payments | Consumers | Send money, links, split bills, gifts, groups, scheduled sends, wishes. |
| Agent economy | Humans + AI agents | AgentCards, Pacts, streaming pacts, delivery escrow, autonomous spend with bounded authority. |
| Merchant/creator | Merchants, creators | Public handles, merchant pages, pricelists, QR, disputes, analytics, webhooks. |
| Trust/receipt | Everyone | Receipt pages, hash verification, attachments, tags, refunds, compressed mirrors, badges. |
| Developer | Developers | SDKs, MCP middleware, web components, GraphQL/API, webhook verification. |
| Treasury/org | Teams | Group accounts, allowances, approvals, auto-refill, cost/spend surfaces. |
| Protocol/public | Ecosystem | Leaderboards, stats, proof pages, capability registry, federation/import. |

## Product Status Signals

Use the same tags as `docs/STRATEGY.md`:

- `SHIPPED`: implemented and verified enough to be treated as working.
- `PARTIAL`: primitive exists, but UX/integration/verification incomplete.
- `PLANNED`: designed but not built.
- `SIMULATED`: UI or flow mocked honestly.
- `MAINNET_ONLY`: cannot be fully real on devnet.
- `FUNDED_FUTURE`: requires capital, partner, audit firm, KYC, card issuing, or similar.

## Non-Negotiable Spine

Big is allowed. Random is not.

Every feature must improve one or more:

- Programmability: caps, pacts, streams, schedules, approvals.
- Verifiability: receipts, hash chains, cNFT/compressed proof, audit logs, exports.
- Trust: revocation, refund, escrow, reputation, merchant verification.
- Utility: send, receive, pay, hire, split, claim, export, verify.
- Solana nativeness: PDAs, SPL transfers, low fees, instant settlement, Blinks, Solana Pay.
- UX clarity: user understands the action in one sentence.

## Current Product Layers

1. Core shell: homepage, dashboard, nav, settings, onboarding.
2. Trust and receipt: receipt object, verify, attachments, refunds, narration, search.
3. Agent economy: AgentCards, Pacts, streaming, escrow, templates.
4. Merchant and creator: handles, merchant pages, QR, webhooks, disputes, analytics.
5. Developer: SDKs, MCP middleware, docs, web components.
6. Treasury/org: groups, allowances, scheduled sends, auto-refill.
7. Consumer: send, pay links, split bills, gifts, round-up, wishes.
8. UX polish: theme, command palette, animations, live presence, mobile/Phantom.
9. Protocol/future: registry, federation, verifiable build, stats.

