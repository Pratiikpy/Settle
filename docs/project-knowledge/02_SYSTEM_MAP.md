# System Map

## Repository Shape

| Area | Path | Role |
|---|---|---|
| Web app | `apps/web` | Next.js App Router UI plus API routes. Main product surface. |
| Indexer/workers | `apps/indexer` | Program log indexing, webhook worker, badge/compression/escrow/federation workers. |
| Demo agent | `apps/demo-agent` | Autonomous demo client that spends through Settle. |
| Demo merchants | `apps/demo-merchants` | Demo merchant services for agent spend. |
| TypeScript SDK | `packages/sdk` | Canonical hashes, receipt kernel, verifier, IDL, handles, webhook verification. |
| Shared types | `packages/types` | Receipt, envelope, deny-code, badge types. |
| UI package | `packages/ui` | Reusable product UI components. |
| MCP middleware | `packages/mcp-middleware` | MCP/payment adapter surface. |
| Python SDK | `packages/python-sdk` | Python parity implementation and tests. |
| Rust SDK | `packages/rust-sdk` | Rust parity implementation and examples. |
| Anchor program | `programs/settle-agent-card` | On-chain AgentCard, Pact, streaming, escrow, receipt instructions. |
| Supabase infra | `infra/supabase` | Migrations and seed data. |
| Scripts | `scripts` | Deploy, seed, smoke, verify, setup, keygen, parity, federation utilities. |
| Docs | `docs` | Strategy, build order, specs, testing, knowledge base. |

## App Inventory

### `apps/web`

Owns:

- User-facing pages.
- Internal admin/preflight pages.
- Payment, receipt, merchant, agent, and consumer API routes.
- Solana Actions/Blinks routes.
- Receipt verification and narration routes.
- Dashboard, settings, send, pay, split, groups, merchants, docs.

### `apps/indexer`

Owns:

- Program log decoding.
- Postgres mirrors of on-chain state.
- Badge mint worker.
- ZK/compressed receipt worker.
- Escrow cron.
- Webhook delivery worker.
- Federation polling.

### Demo apps

- `apps/demo-agent`: proves autonomous agent spend.
- `apps/demo-merchants`: test merchant endpoints.

## Package Inventory

### `packages/sdk`

Core shared truth for:

- Capability hash.
- Canonical JSON.
- Receipt kernel.
- Receipt verification.
- Sealed box helper.
- IDL constant.
- PDA helpers.
- Webhook verification.
- Preflight/status helpers.

### `packages/ui`

Reusable app primitives:

- Receipt card.
- Pact card.
- Settle card.
- Trust gesture.
- Hash-chain animation.
- Empty state.
- Draggable receipt.
- Badges.

### `packages/mcp-middleware`

Connects agent/MCP flows to Settle payment enforcement.

### `packages/python-sdk` and `packages/rust-sdk`

Parity implementations for cross-language verification and developer adoption.

## Not Present In Current Tree

Chrome extension files were not found in the current repository scan. If a Chrome extension is intended, add a clear app/package path, for example:

- `apps/extension`
- `packages/extension-shared`

Until then, any claim that a Chrome extension exists should be marked `PLANNED` or `MISSING`.

