# settle-sdk (Python)

F5.2 — Python port of the Settle TypeScript SDK. Same canonical hashing
algorithm; outputs are byte-identical so a Python verifier can confirm a
TS-emitted receipt and vice versa.

## Install

```
pip install settle-sdk
```

(Until first PyPI publish, install from this repo:
`pip install -e packages/python-sdk` from a Settle clone.)

Requires `blake3` (auto-installed).

## Quick start

```python
from settle_sdk import kernel_commit, verify_receipt, compute_capability_hash_hex

# Compute a capability hash for a tool spec
hash_hex = compute_capability_hash_hex({
    "domain": "translate.example.com",
    "method": "POST",
    "path": "/v1/translate",
    "amount_lamports": "20000",
    "version": 1,
})

# Compute the 4-hash kernel commit for a payment
result = kernel_commit({
    "kind": "direct_send",
    "request_id": "11111111-2222-3333-4444-555555555555",
    "amount_lamports": "500000",
    "sender": "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp",
    "recipient": "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY",
    "decision_slot": 1000,
    "purpose_text": "test payment",
})

print("receipt_hash:", result.receipt_hash)
print("context_hash:", result.context_hash)

# Verify a receipt by re-deriving its hashes
v = verify_receipt({
    "receipt": result.canonical_receipt,
    "reason": result.canonical_reason,
    "policy_snapshot": result.canonical_policy_snapshot,
    "http": { "method": "POST", "path": "/_kernel/direct_send" },
    "expected": {
        "receipt_hash": result.receipt_hash,
        "reason_hash": result.reason_hash,
        "policy_snapshot_hash": result.policy_snapshot_hash,
        "purpose_hash": result.purpose_hash,
    },
})
assert v.ok, f"verification failed: {v.mismatches}"
```

## What's in this port

- `purpose_text_hash`, `canonical_receipt_hash`, `canonical_reason_hash`,
  `canonical_policy_snapshot_hash`, `canonical_purpose_hash` — the 5 canonical
  hash functions.
- `compute_capability_hash_hex` — capability hash derivation.
- `kernel_commit` — F2.0 universal receipt kernel for any kind
  (x402_spend, direct_send, link_send, streaming_claim, escrow_*, refund).
- `verify_receipt` — recompute and compare against expected hashes.

## What's NOT in this port (yet)

- Solana transaction building (use `solders` / `solana-py` directly).
- On-chain `record_receipt` ix builder (build manually from the IDL JSON
  in `programs/settle-agent-card/target/idl/settle_agent_card.json`).
- Sealed-box encryption (use `pynacl` directly with the same X25519 + XChaCha20
  parameters as `@settle/sdk`).

These will land in subsequent versions if there's demand. The hashing core
ships first because it's what every verifier needs.

## Cross-implementation parity

If you compute a hash in TypeScript and a hash in Python from the same
canonical object, **you must get the same bytes**. This is enforced by:

1. JSON serialization: sorted keys, no whitespace, both runtimes use the
   exact same algorithm in `_stable_json`.
2. NFC Unicode normalization for purpose text in both runtimes.
3. BLAKE3 — both runtimes use the reference `blake3` implementation.

If you find a parity bug, file an issue with reproducer inputs from
both sides.

## License

MIT.
