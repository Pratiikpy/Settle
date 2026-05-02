# SDK, MCP, And Extension Map

## TypeScript SDK

Path: `packages/sdk`

Owns:

- Canonical JSON and BLAKE3 helpers.
- Capability hash.
- Receipt kernel.
- Receipt verifier.
- IDL constant.
- PDA helpers.
- Handle helpers.
- Webhook verification.
- Preflight/status helpers.

Key tests:

- `canonical.test.ts`
- `capability-hash.test.ts`
- `receipt-kernel.test.ts`
- `verify-receipt.test.ts`
- `sealed-box.test.ts`
- `webhook-verify.test.ts`

## Python SDK

Path: `packages/python-sdk`

Owns:

- Cross-language parity for canonical/hash/kernel/ix data behavior.

Key tests:

- `test_parity.py`
- `test_kernel_parity.py`
- `test_ix_data_parity.py`

## Rust SDK

Path: `packages/rust-sdk`

Owns:

- Rust verification/parity primitives.
- Example parity smoke.

Key files:

- `src/kernel.rs`
- `src/verify.rs`
- `src/ix_data.rs`
- `examples/parity_smoke.rs`

## MCP Middleware

Path: `packages/mcp-middleware`

Owns:

- MCP payment middleware surface.
- Agent adapter support.
- Example translate server.

Key files:

- `src/index.ts`
- `src/agent-adapters.ts`
- `examples/translate-server.ts`
- `src/index.test.ts`

## Chrome Extension

Current status: not present in the repository scan.

If extension work begins, create a clear surface:

- `apps/extension`
- `apps/extension/manifest.json`
- `apps/extension/src/*`
- optional shared package: `packages/extension-shared`

Until that exists, mark extension-related claims as `PLANNED` or `MISSING`.

## Parity Rule

Any receipt/hash/capability behavior exposed in multiple SDKs must have golden vectors and parity tests.

