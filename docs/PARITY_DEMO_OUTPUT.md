# Three-runtime BLAKE3 parity — captured output

This is a static capture of `pnpm demo:parity` running against the locked
golden input. It exists so reviewers can paste this into a slide deck,
blog post, or social post without re-running the demo.

To regenerate, run `pnpm demo:parity` from the repo root. Captured 2026-05-06.

## Locked input

| Field             | Value                                            |
| ----------------- | ------------------------------------------------ |
| kind              | `direct_send`                                    |
| amount_lamports   | `500000`                                         |
| sender            | `B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp`   |
| recipient         | `C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY`   |
| decision_slot     | `1000`                                           |
| purpose_text      | `coffee with alice`                              |

## Output

```
════════════════════════════════════════════════════════════════════════
Settle · three-runtime BLAKE3 parity demo
════════════════════════════════════════════════════════════════════════

Same canonical input. Three runtimes. Compare.

> running TypeScript (packages/sdk via tsx)...
> running Python (settle-protocol-sdk via test_kernel_parity)...
> running Rust (settle-sdk crate via cargo run --example parity_smoke)...

hash                  TypeScript        Python            Rust              match
─────────────────────────────────────────────────────────────────────────────────
receipt_hash          095a40c24988…     095a40c24988…     095a40c24988…       ✓
reason_hash           320e5f7ee4bd…     320e5f7ee4bd…     320e5f7ee4bd…       ✓
policy_snapshot_hash  203bceb4b5d4…     203bceb4b5d4…     203bceb4b5d4…       ✓
purpose_hash          ac9a1f2e6aad…     ac9a1f2e6aad…     ac9a1f2e6aad…       ✓
context_hash          6bb849195e12…     6bb849195e12…     6bb849195e12…       ✓

✓ All 5 hashes match across TypeScript, Python, and Rust.
```

## Full hashes (for receipt forensics)

```
receipt_hash         = 095a40c24988392828639b5621bf2dbfbb597dc63ef57ef562930d0e5b133126
reason_hash          = 320e5f7ee4bdfdeba756b3d1985962ee5e41f2bdeb315f8249e238ea71b5590a
policy_snapshot_hash = 203bceb4b5d4af2624a79359818439c1a8895bacc9fc4fca70ffd8de59660d71
purpose_hash         = ac9a1f2e6aad968b0da5a18309d916a7f69c2d6012f9ee123bf45d43663804dd
context_hash         = 6bb849195e1214908da2ed25c9e007bf91cc7ae68cdee63115fa693fa51dfaa8
```

## Why this is the wow moment

Most multi-SDK projects diverge over time: one runtime's JSON encoder
adds a trailing newline, another normalizes Unicode differently, a third
serializes BigInt as a number, and within months the "shared SDK" is
producing different hashes for the same payment.

Settle's three SDKs:

- TypeScript (`@settle/sdk` in monorepo)
- Python (`settle-protocol-sdk` on PyPI)
- Rust (`packages/rust-sdk`)

…produce **identical** BLAKE3 hashes for every receipt. Enforced by:

- shared fixture parity tests in CI
- `packages/python-sdk/test_kernel_parity.py` (locks 7 receipt kinds)
- `packages/rust-sdk/tests/kernel_*.rs` (locks the same fixtures)
- this `pnpm demo:parity` command (any reviewer can re-run in 60s)

When a payment receipt goes on-chain, anyone can pull the canonical
JSON and re-derive the four BLAKE3 hashes in the language of their
choice. The bytes are the same. The hash is the same. The trust model
collapses to "do you trust BLAKE3" — not "do you trust Settle."
