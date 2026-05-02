"""Cross-language ix-data parity test.

Verifies the Python ix builders produce the EXACT same bytes as
the TS reference (apps/web/lib/anchor-client.ts) and the Rust port
(packages/rust-sdk/src/ix_data.rs). Locked goldens are the same hex
strings asserted in both.

Run:
    cd packages/python-sdk
    python -m pytest test_ix_data_parity.py -v
or:
    python test_ix_data_parity.py
"""

import sys

from settle_sdk import (
    AllowlistEntry,
    anchor_discriminator,
    BorshWriter,
    build_ix_data,
    ix_claim_streaming,
    ix_close_pact,
    ix_create_card,
    ix_dispute_delivery_escrow,
    ix_open_delivery_escrow,
    ix_open_pact,
    ix_open_streaming_pact,
    ix_pause_streaming,
    ix_record_denial,
    ix_record_receipt,
    ix_release_delivery_escrow,
    ix_resume_streaming,
    ix_revoke,
    ix_spend,
    ix_spend_via_pact,
)


def _hex(b: bytes) -> str:
    return b.hex()


def assert_eq(label: str, got, want):
    if got != want:
        print(f"[FAIL] {label}")
        print(f"  got:  {got}")
        print(f"  want: {want}")
        sys.exit(1)
    print(f"[OK]  {label}")


# ─── Borsh writer primitives ────────────────────────────────────────


def test_primitives():
    w = BorshWriter()
    w.u8(0xAB)
    w.u32(0x12345678)
    w.u64(0x0123456789abcdef)
    w.bool_(True)
    bytes_ = w.to_bytes()
    # Same expected bytes as the Rust borsh_writer test:
    #   0xAB, 0x78 0x56 0x34 0x12, 0xef cd ab 89 67 45 23 01, 0x01
    assert_eq(
        "primitives",
        _hex(bytes_),
        "ab78563412efcdab896745230101",
    )


def test_vec():
    w = BorshWriter()
    w.vec([1, 2, 3], lambda ww, b: ww.u8(b))
    assert_eq("vec[u8]", _hex(w.to_bytes()), "03000000010203")


def test_option_none():
    w = BorshWriter()
    w.option(None, lambda _w, _v: None)
    assert_eq("option None", _hex(w.to_bytes()), "00")


def test_option_some():
    w = BorshWriter()
    w.option(0x42, lambda ww, v: ww.u8(v))
    assert_eq("option Some", _hex(w.to_bytes()), "0142")


def test_string():
    w = BorshWriter()
    w.string("hi")
    assert_eq("string", _hex(w.to_bytes()), "020000006869")


# ─── Cross-language byte goldens ────────────────────────────────────
# Hex strings copied from scripts/smoke-ix-data-parity.ts output.
# Same goldens locked in packages/rust-sdk/src/ix_data.rs.


def test_revoke_golden():
    assert_eq("revoke", _hex(ix_revoke()), "aa171f2285ad5df2")


def test_close_pact_golden():
    assert_eq("close_pact", _hex(ix_close_pact()), "95dd15fa9a0ed19c")


def test_spend_golden():
    bytes_ = ix_spend(
        amount=0x123456789abcdef0,
        capability_hash=bytes([0x11] * 32),
        receipt_hash=bytes([0x22] * 32),
        reason_hash=bytes([0x33] * 32),
        policy_snapshot_hash=bytes([0x44] * 32),
    )
    assert_eq(
        "spend",
        _hex(bytes_),
        "f2cdff5765d9f539f0debc9a785634121111111111111111111111111111111111111111111111111111111111111111222222222222222222222222222222222222222222222222222222222222222233333333333333333333333333333333333333333333333333333333333333334444444444444444444444444444444444444444444444444444444444444444",
    )


def test_spend_via_pact_golden():
    bytes_ = ix_spend_via_pact(
        amount=0x123456789abcdef0,
        capability_hash=bytes([0x11] * 32),
        receipt_hash=bytes([0x22] * 32),
        reason_hash=bytes([0x33] * 32),
        policy_snapshot_hash=bytes([0x44] * 32),
    )
    assert_eq(
        "spend_via_pact",
        _hex(bytes_),
        "09dc4ea6083057fff0debc9a785634121111111111111111111111111111111111111111111111111111111111111111222222222222222222222222222222222222222222222222222222222222222233333333333333333333333333333333333333333333333333333333333333334444444444444444444444444444444444444444444444444444444444444444",
    )


def test_open_pact_golden():
    bytes_ = ix_open_pact(
        scope_label_hash=bytes([0xAB] * 32),
        cap_lamports=1_000_000,
        allowlist=[
            AllowlistEntry(merchant=bytes([0xCD] * 32), capability_hash=None),
        ],
        expiry_slot=12345,
    )
    assert_eq(
        "open_pact",
        _hex(bytes_),
        "66c5d07ffa7f5eb7abababababababababababababababababababababababababababababababab40420f000000000001000000cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd003930000000000000",
    )


def test_create_card_golden():
    bytes_ = ix_create_card(
        agent_pubkey=bytes([0x01] * 32),
        label_hash=bytes([0x02] * 32),
        daily_cap_lamports=100_000_000,
        per_call_max_lamports=5_000_000,
        allowlist=[
            AllowlistEntry(merchant=bytes([0x03] * 32), capability_hash=None),
            AllowlistEntry(
                merchant=bytes([0x04] * 32),
                capability_hash=bytes([0x05] * 32),
            ),
        ],
        expiry_slot=10_000,
        policy_version=1,
    )
    assert_eq(
        "create_card",
        _hex(bytes_),
        "1df27f08f16ddb640101010101010101010101010101010101010101010101010101010101010101020202020202020202020202020202020202020202020202020202020202020200e1f50500000000404b4c0000000000020000000303030303030303030303030303030303030303030303030303030303030303000404040404040404040404040404040404040404040404040404040404040404010505050505050505050505050505050505050505050505050505050505050505102700000000000001000000",
    )


def test_open_streaming_pact_golden():
    bytes_ = ix_open_streaming_pact(
        scope_label_hash=bytes([0xA1] * 32),
        rate_lamports_per_slot=100,
        max_total_lamports=1_000_000,
        allowlist=[AllowlistEntry(merchant=bytes([0xB1] * 32), capability_hash=None)],
        expiry_slot=99999,
    )
    assert_eq(
        "open_streaming_pact",
        _hex(bytes_),
        "0cbe893138af554ea1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1640000000000000040420f000000000001000000b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1009f86010000000000",
    )


def test_claim_streaming_golden():
    bytes_ = ix_claim_streaming(
        capability_hash=bytes([0xC1] * 32),
        receipt_hash=bytes([0xC2] * 32),
        reason_hash=bytes([0xC3] * 32),
        policy_snapshot_hash=bytes([0xC4] * 32),
    )
    assert_eq(
        "claim_streaming",
        _hex(bytes_),
        "ece290fec4dd439fc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4",
    )


def test_pause_streaming_golden():
    assert_eq("pause_streaming", _hex(ix_pause_streaming()), "6993b17119f87055")


def test_resume_streaming_golden():
    assert_eq("resume_streaming", _hex(ix_resume_streaming()), "c271876c0e96dd21")


def test_open_delivery_escrow_golden():
    bytes_ = ix_open_delivery_escrow(
        scope_label_hash=bytes([0xD1] * 32),
        amount=500,
        merchant=bytes([0xD2] * 32),
        capability_hash=bytes([0xD3] * 32),
        confirm_deadline_slot=1000,
        dispute_deadline_slot=2000,
        expiry_slot=3000,
    )
    assert_eq(
        "open_delivery_escrow",
        _hex(bytes_),
        "80a68f5876ec8d2ed1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1f401000000000000d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3e803000000000000d007000000000000b80b000000000000",
    )


def test_release_delivery_escrow_golden():
    assert_eq(
        "release_delivery_escrow",
        _hex(ix_release_delivery_escrow()),
        "8228e62e124b24e8",
    )


def test_dispute_delivery_escrow_golden():
    assert_eq(
        "dispute_delivery_escrow",
        _hex(ix_dispute_delivery_escrow()),
        "a774eba467c40dab",
    )


def test_discriminator_no_collision():
    names = [
        "create_card",
        "spend",
        "spend_via_pact",
        "open_pact",
        "close_pact",
        "revoke",
        "open_streaming_pact",
        "claim_streaming",
        "pause_streaming",
        "resume_streaming",
        "open_delivery_escrow",
        "release_delivery_escrow",
        "dispute_delivery_escrow",
    ]
    discs = [anchor_discriminator("global", n) for n in names]
    seen = {}
    for n, d in zip(names, discs):
        if d in seen:
            print(f"[FAIL] discriminator collision: {n} == {seen[d]}")
            sys.exit(1)
        seen[d] = n
        assert len(d) == 8
    print(f"[OK]  no discriminator collisions across {len(names)} ix")


if __name__ == "__main__":
    test_primitives()
    test_vec()
    test_option_none()
    test_option_some()
    test_string()
    test_revoke_golden()
    test_close_pact_golden()
    test_spend_golden()
    test_spend_via_pact_golden()
    test_open_pact_golden()
    test_create_card_golden()
    test_open_streaming_pact_golden()
    test_claim_streaming_golden()
    test_pause_streaming_golden()
    test_resume_streaming_golden()
    test_open_delivery_escrow_golden()
    test_release_delivery_escrow_golden()
    test_dispute_delivery_escrow_golden()
    test_discriminator_no_collision()
    print(
        "\n[OK]  all 19 ix-data parity tests passed "
        "(Python == Rust == TS for 13/13 Anchor ix)"
    )


# ─────────────────────────────────────────────────────────────────────
# AU-03-008 — record_denial + record_receipt parity
# ─────────────────────────────────────────────────────────────────────


def test_record_denial_byte_count():
    """169 = 8 disc + 1 deny_code + 5×32 hashes."""
    bytes_out = ix_record_denial(
        deny_code=1,
        merchant=bytes(32).rjust(32, b"\xaa"[:1]) if False else b"\xaa" * 32,
        pact=b"\xbb" * 32,
        receipt_hash=b"\xcc" * 32,
        reason_hash=b"\xdd" * 32,
        policy_snapshot_hash=b"\xee" * 32,
    )
    assert len(bytes_out) == 169


def test_record_denial_disc_matches_anchor():
    """Discriminator = sha256('global:record_denial')[:8]."""
    bytes_out = ix_record_denial(
        deny_code=0,
        merchant=b"\x00" * 32,
        pact=b"\x00" * 32,
        receipt_hash=b"\x00" * 32,
        reason_hash=b"\x00" * 32,
        policy_snapshot_hash=b"\x00" * 32,
    )
    expected_disc = anchor_discriminator("global", "record_denial")
    assert bytes_out[:8] == expected_disc


def test_record_receipt_byte_count():
    """169 = 8 disc + 1 kind + 5×32 hashes."""
    bytes_out = ix_record_receipt(
        kind=0,
        receipt_hash=b"\x11" * 32,
        reason_hash=b"\x22" * 32,
        policy_snapshot_hash=b"\x33" * 32,
        purpose_hash=b"\x44" * 32,
        context_hash=b"\x55" * 32,
    )
    assert len(bytes_out) == 169


def test_record_receipt_disc_matches_anchor():
    bytes_out = ix_record_receipt(
        kind=0,
        receipt_hash=b"\x00" * 32,
        reason_hash=b"\x00" * 32,
        policy_snapshot_hash=b"\x00" * 32,
        purpose_hash=b"\x00" * 32,
        context_hash=b"\x00" * 32,
    )
    expected_disc = anchor_discriminator("global", "record_receipt")
    assert bytes_out[:8] == expected_disc
