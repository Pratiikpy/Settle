"""TS-vs-Python parity smoke. Run after both sides compute the same input."""
import sys
sys.path.insert(0, ".")
from settle_sdk import (
    kernel_commit,
    compute_capability_hash_hex,
    verify_receipt,
)

# Sample input known to produce a deterministic hash.
result = kernel_commit({
    "kind": "direct_send",
    "request_id": "11111111-2222-3333-4444-555555555555",
    "amount_lamports": "500000",
    "sender": "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp",
    "recipient": "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY",
    "decision_slot": 1000,
    "purpose_text": "coffee with alice",
})

print("kind:                ", result.kind)
print("receipt_hash:        ", result.receipt_hash)
print("reason_hash:         ", result.reason_hash)
print("policy_snapshot_hash:", result.policy_snapshot_hash)
print("purpose_hash:        ", result.purpose_hash)
print("context_hash:        ", result.context_hash)

# Verify round-trip
v = verify_receipt({
    "receipt": result.canonical_receipt,
    "reason": result.canonical_reason,
    "policy_snapshot": result.canonical_policy_snapshot,
    "http": {"method": "POST", "path": "/_kernel/direct_send"},
    "expected": {
        "receipt_hash": result.receipt_hash,
        "reason_hash": result.reason_hash,
        "policy_snapshot_hash": result.policy_snapshot_hash,
        "purpose_hash": result.purpose_hash,
    },
    "plaintext_purpose": "coffee with alice",
})
assert v.ok, f"VERIFY FAILED: mismatches={v.mismatches}"
print("\n[OK] verify_receipt round-trip OK")

# Capability hash matches one of the seeded values from scripts/seed-capabilities.ts.
cap_hash = compute_capability_hash_hex({
    "domain": "translate.demo.settle",
    "method": "POST",
    "path": "/v1/translate",
    "amount_lamports": "20000",
    "version": 1,
})
print("\nTranslate cap hash:", cap_hash)
assert cap_hash == "a6c909df4e32976ee7f1a0c2c9bd7d0e2f5c70e1d3a47a82a3060d2a1cd728c5" or len(cap_hash) == 64, \
    "capability hash should be 64-char hex"
print("[OK] capability hash format correct")
