# settle-sdk (Rust)

F5.3 — Rust port of the Settle SDK. Same canonical hashing as the
TypeScript and Python ports; outputs are byte-identical so a Rust
verifier can confirm a TS- or Python-emitted receipt and vice versa.

## Use

```toml
[dependencies]
settle-sdk = "0.1"
```

```rust
use settle_sdk::{kernel_commit, KernelCommitInput, compute_capability_hash_hex, capability_hash::Capability};

let cap = compute_capability_hash_hex(&Capability {
    domain: "translate.example.com",
    method: "POST",
    path: "/v1/translate",
    amount_lamports: "20000",
    version: 1,
});

let result = kernel_commit(&KernelCommitInput {
    kind: "direct_send".into(),
    request_id: "11111111-2222-3333-4444-555555555555".into(),
    amount_lamports: "500000".into(),
    sender: Some("B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp".into()),
    recipient: Some("C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY".into()),
    decision_slot: 1000,
    purpose_text: Some("test payment".into()),
    reason: None,
    policy_snapshot: None,
});

println!("receipt_hash: {}", result.hashes.receipt_hash);
println!("context_hash: {}", result.context_hash);
```

## What's parity-proven against TS + Python

- `stable_json` — canonical JSON (sorted keys, no whitespace).
- `compute_capability_hash_hex` — byte-identical capability hashes.
  Locked golden:
  `a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b`
- `kernel_commit` for `direct_send` kind — full schema port. Locked
  goldens for receipt_hash, reason_hash, policy_snapshot_hash,
  purpose_hash, context_hash. See `kernel.rs::parity_direct_send_golden`.
- `verify_receipt` — accepts canonical objects (TS-emitted or
  Rust-emitted, either work) and recomputes hashes for comparison.

## Full kernel parity locked

As of C36, all 7 receipt kinds have golden tests pinned to
TS-emitted hashes:

- `direct_send`
- `x402_spend`
- `link_send`
- `streaming_claim`
- `escrow_release`
- `escrow_dispute`
- `refund`

Run `pnpm smoke:multikind` to regenerate the TS goldens, then `cargo
test` to verify Rust still matches. If any test drifts, fix Rust
(or, if the canonical schema changed in TS, regenerate ALL goldens
via the script and update both ports together — never edit a Rust
golden in isolation).

## What's NOT in this port at all

- Solana transaction building (use `solana-sdk` directly).
- Anchor IDL builders for `record_receipt` (build manually from
  `programs/settle-agent-card/target/idl/settle_agent_card.json`).
- Sealed-box encryption (X25519 + XChaCha20 — use `crypto_secretbox`
  directly with the same parameters as `@settle/sdk`).

## Cross-implementation parity

Run `cargo test` then run the parity smoke from the repo root:

```
pnpm tsx scripts/smoke-python-parity.ts        # TS hash output
cd packages/python-sdk && python test_parity.py # Python hash output
cd ../rust-sdk && cargo test                    # Rust hash output
```

All three should produce the same `receipt_hash`, `context_hash`,
and capability-hash hex strings for the same input.

## License

MIT.
