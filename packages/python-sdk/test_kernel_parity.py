"""Python kernel-commit parity for ALL 7 receipt kinds.

Mirrors packages/rust-sdk/src/kernel.rs golden tests. Goldens are the
same TS-emitted hashes Rust locks; emitted by:
    pnpm tsx scripts/smoke-multikind-goldens.ts

If a parity test fails, fix Python (or, if the canonical schema changed
in TS, regenerate ALL goldens via the script and update both Python
+ Rust together — never edit a Python golden in isolation).

Run:
    cd packages/python-sdk
    python test_kernel_parity.py
"""

import sys

sys.path.insert(0, ".")

from settle_sdk import kernel_commit


SENDER = "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp"
RECIPIENT = "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY"
CARD = "8RTNZ3K7gK2nQfqkXCWNkD3FrM5pZ9TyVmLs4WsKZGZE"
PACT = "DnQYwGhAqJ7tPjKpQqZsXLg5Pi9MhT6cWnKnZJ2xY8WX"
CAPABILITY_HASH = (
    "a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b"
)


def assert_eq(label, got, want):
    if got != want:
        print(f"[FAIL] {label}")
        print(f"  got:  {got}")
        print(f"  want: {want}")
        sys.exit(1)
    print(f"[OK]  {label} = {got}")


def assert_kernel(label, result, expected):
    """Compare all 5 hash fields of a kernel commit against expected dict."""
    print(f"\n--- {label} ---")
    assert_eq("receipt_hash", result.receipt_hash, expected["receipt_hash"])
    assert_eq("reason_hash", result.reason_hash, expected["reason_hash"])
    assert_eq(
        "policy_snapshot_hash",
        result.policy_snapshot_hash,
        expected["policy_snapshot_hash"],
    )
    assert_eq("purpose_hash", result.purpose_hash, expected["purpose_hash"])
    assert_eq("context_hash", result.context_hash, expected["context_hash"])


# ─── 1. direct_send (already locked, included for cross-check) ───
direct_send = kernel_commit(
    {
        "kind": "direct_send",
        "request_id": "11111111-2222-3333-4444-555555555555",
        "amount_lamports": "500000",
        "sender": SENDER,
        "recipient": RECIPIENT,
        "decision_slot": 1000,
        "purpose_text": "coffee with alice",
    }
)
assert_kernel(
    "direct_send",
    direct_send,
    {
        "receipt_hash": "095a40c24988392828639b5621bf2dbfbb597dc63ef57ef562930d0e5b133126",
        "reason_hash": "320e5f7ee4bdfdeba756b3d1985962ee5e41f2bdeb315f8249e238ea71b5590a",
        "policy_snapshot_hash": "203bceb4b5d4af2624a79359818439c1a8895bacc9fc4fca70ffd8de59660d71",
        "purpose_hash": "ac9a1f2e6aad968b0da5a18309d916a7f69c2d6012f9ee123bf45d43663804dd",
        "context_hash": "6bb849195e1214908da2ed25c9e007bf91cc7ae68cdee63115fa693fa51dfaa8",
    },
)


# ─── 2. x402_spend (card-bound + http context) ───
x402 = kernel_commit(
    {
        "kind": "x402_spend",
        "request_id": "11111111-aaaa-bbbb-cccc-222222222222",
        "amount_lamports": "20000",
        "sender": SENDER,
        "recipient": RECIPIENT,
        "decision_slot": 5,
        "purpose_text": "translate this",
        "decision": "ALLOW",
        "deny_code": 0,
        "card_pubkey": CARD,
        "pact_pubkey": None,
        "capability_hash": CAPABILITY_HASH,
        "policy_version": 1,
        "daily_cap_lamports": "1000000",
        "per_call_max_lamports": "100000",
        "allowlist_count": 1,
        "expiry_slot": 1_000_000,
        "revoked": False,
        "cap_remaining_after": "980000",
        "http_method": "POST",
        "http_path": "/v1/translate",
    }
)
assert_kernel(
    "x402_spend",
    x402,
    {
        "receipt_hash": "80565ec9ad5af63cf6dc72ba47ce43cbcd0bd6c11fb038899caca60e7a82ad88",
        "reason_hash": "99708ab7e1fd3f88b36065aeac13eb165543c60d71f8718e59812296fc46dac3",
        "policy_snapshot_hash": "02d4ee78f62bcd12da76d6d22c5a97e9d67471ec89753eb3dd67a843b2da4529",
        "purpose_hash": "c1114fe7b1b956609d11724cd6900d65d0d15b23f06469a4f3f3ab624d415146",
        "context_hash": "71746a2f4969117aab4a65b670bbdeaf45dc70c69612a9b9afbae1539f090c1a",
    },
)


# ─── 3. link_send ───
link_send = kernel_commit(
    {
        "kind": "link_send",
        "request_id": "33333333-aaaa-bbbb-cccc-444444444444",
        "amount_lamports": "250000",
        "sender": SENDER,
        "recipient": RECIPIENT,
        "decision_slot": 100,
        "purpose_text": "claim from link",
        "link_token": "link-abc12345",
    }
)
assert_kernel(
    "link_send",
    link_send,
    {
        "receipt_hash": "edfbaeff1392131f6e01602d618c8e028a492b591befe241512eebc6b5c761d9",
        "reason_hash": "20eefb226225819fb419cbb16bd40378f4d06c99e28500810e94ac1f69ed453a",
        "policy_snapshot_hash": "203bceb4b5d4af2624a79359818439c1a8895bacc9fc4fca70ffd8de59660d71",
        "purpose_hash": "567f34f2645ef6accf8a0a0b9a6250cdeb4d3a01fb169abb9c0bd829dab6c3b9",
        "context_hash": "0539e2c195af3868c6795e8e850383c1d927a9ffe7f82e53a7bc77e83cd8e2d6",
    },
)


# ─── 4. streaming_claim (card-bound + pact_pubkey) ───
streaming = kernel_commit(
    {
        "kind": "streaming_claim",
        "request_id": "55555555-aaaa-bbbb-cccc-666666666666",
        "amount_lamports": "10000",
        "sender": SENDER,
        "recipient": RECIPIENT,
        "decision_slot": 500,
        "purpose_text": "10s of agent work",
        "decision": "ALLOW",
        "deny_code": 0,
        "card_pubkey": CARD,
        "pact_pubkey": PACT,
        "capability_hash": CAPABILITY_HASH,
        "policy_version": 1,
        "daily_cap_lamports": "500000",
        "per_call_max_lamports": "50000",
        "allowlist_count": 1,
        "expiry_slot": 1_000_000,
        "revoked": False,
        "cap_remaining_after": "490000",
        "billable_slots": 10,
    }
)
assert_kernel(
    "streaming_claim",
    streaming,
    {
        "receipt_hash": "1364f1962b4cfd348c4192a5df35eebf146f06c37bfb2efec4b79db4bfa12c19",
        "reason_hash": "68de38c35fee6b9866a924327133f9b80571360bbf3fb72fa303f6fc62f5c959",
        "policy_snapshot_hash": "38c0279b0fff1d31d5566f54421527a684fbcdfc43f4b0d0d77829c276eb6cfb",
        "purpose_hash": "0275f457a87414fb3a20c6a2f0bc2f63bb5936abd0a80c052c61cfa30dcafb1f",
        "context_hash": "1aea979027321818d0a83b7f20ddb2231e98fc9119ee1ab2071ad019995fec89",
    },
)


# ─── 5. escrow_release (card-bound, has buyer_confirmed) ───
escrow_release = kernel_commit(
    {
        "kind": "escrow_release",
        "request_id": "77777777-aaaa-bbbb-cccc-888888888888",
        "amount_lamports": "100000",
        "sender": SENDER,
        "recipient": RECIPIENT,
        "decision_slot": 200,
        "purpose_text": "buyer confirmed delivery",
        "decision": "ALLOW",
        "deny_code": 0,
        "card_pubkey": CARD,
        "pact_pubkey": PACT,
        "capability_hash": CAPABILITY_HASH,
        "policy_version": 1,
        "daily_cap_lamports": "1000000",
        "per_call_max_lamports": "200000",
        "allowlist_count": 1,
        "expiry_slot": 1_000_000,
        "revoked": False,
        "cap_remaining_after": "900000",
        "buyer_confirmed": True,
    }
)
assert_kernel(
    "escrow_release",
    escrow_release,
    {
        "receipt_hash": "b129df141dc35c96568e68ad99d267b438aefa57f6b11e190d1e2f4f62bec1cd",
        "reason_hash": "ae20631aa34d0c6b5d721786101c4c36efe1b5f8be76a08891b2d3bc79fcbabf",
        "policy_snapshot_hash": "9b4e4a38fdefb8189dddd4fe049c001a8904eb06d52ea6898c398721cee66f35",
        "purpose_hash": "33e4ae63234a2fdc0d99df440a2b7a4331ee87419dcc09809760b0d17c3c025d",
        "context_hash": "223186d7c194a131a36a20ca3bd85bc75aa478ca2e8db0919aa0bd9c5655a418",
    },
)


# ─── 6. escrow_dispute (card-bound) ───
escrow_dispute = kernel_commit(
    {
        "kind": "escrow_dispute",
        "request_id": "99999999-aaaa-bbbb-cccc-aaaaaaaaaaaa",
        "amount_lamports": "100000",
        "sender": SENDER,
        "recipient": RECIPIENT,
        "decision_slot": 250,
        "purpose_text": "buyer disputed delivery",
        "decision": "ALLOW",
        "deny_code": 0,
        "card_pubkey": CARD,
        "pact_pubkey": PACT,
        "capability_hash": CAPABILITY_HASH,
        "policy_version": 1,
        "daily_cap_lamports": "1000000",
        "per_call_max_lamports": "200000",
        "allowlist_count": 1,
        "expiry_slot": 1_000_000,
        "revoked": False,
        "cap_remaining_after": "900000",
    }
)
assert_kernel(
    "escrow_dispute",
    escrow_dispute,
    {
        "receipt_hash": "3c73cce2770024ca87fc69347ab9ace3d5564652a6dcd090a4f1e35136e06fb7",
        "reason_hash": "35170d9617721bbaf2b81e7eb7026ca64be3ab39e6ee7bd92956ab6345d6c1e3",
        "policy_snapshot_hash": "9b4e4a38fdefb8189dddd4fe049c001a8904eb06d52ea6898c398721cee66f35",
        "purpose_hash": "9b6b54e126b87c7b357dc48dd7d9bab2fdb19f4580daeea409236ec3dc3ad031",
        "context_hash": "0976a81e755d5dbf45544f1e98ee22e97a08acc991a7c5634c0e51146d3af609",
    },
)


# ─── 7. refund (no card, has refund_of_request_id + refund_reason) ───
refund = kernel_commit(
    {
        "kind": "refund",
        "request_id": "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
        "amount_lamports": "50000",
        "sender": SENDER,
        "recipient": RECIPIENT,
        "decision_slot": 300,
        "purpose_text": "refund: never delivered",
        "refund_of_request_id": "11111111-2222-3333-4444-555555555555",
        "refund_reason": "merchant agreed full refund",
    }
)
assert_kernel(
    "refund",
    refund,
    {
        "receipt_hash": "d0eb4dfe90a075a32661227b226659234c06cd8b60a7087e6cbf1f4fe3416731",
        "reason_hash": "8d434396696028e23f1a02fa154bd72108b358c970b1db729987e954479bf562",
        "policy_snapshot_hash": "203bceb4b5d4af2624a79359818439c1a8895bacc9fc4fca70ffd8de59660d71",
        "purpose_hash": "89eae6c490e19f807c95d5d1754a42c73d56408077122d1a3584954c5dffd602",
        "context_hash": "9091adf2af8062335c7f0af15c4cacec8ed9a6fb09181af6fa38714b59d111e5",
    },
)


print(
    "\n[OK]  all 7 kernel-commit kinds match TS golden bytes "
    "(Python == TS == Rust for receipt kernel)"
)
