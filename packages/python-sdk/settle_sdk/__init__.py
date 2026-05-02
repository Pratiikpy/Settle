"""Settle Python SDK — F5.2

Minimal port of the @settle/sdk TypeScript primitives. Same canonical
hashing algorithm; outputs are byte-identical to the TS implementation
so a Python verifier can confirm a TS-emitted receipt and vice versa.

Public surface:
  - canonical_receipt_hash(obj) -> bytes
  - canonical_reason_hash(obj) -> bytes
  - canonical_policy_snapshot_hash(obj) -> bytes
  - canonical_purpose_hash(obj) -> bytes
  - purpose_text_hash(text) -> bytes
  - compute_capability_hash_hex(spec) -> str
  - kernel_commit(input) -> KernelCommitResult
  - verify_receipt(input) -> VerifyResult

Hashing: BLAKE3 via the `blake3` package on PyPI (`pip install blake3`).
Canonical JSON: sorted keys, no whitespace, reject undefined/NaN/BigInt.

This is intentionally a single-file lib so a Python user can pip-install
and `from settle_sdk import kernel_commit, verify_receipt` with no deeper
import paths to remember.
"""

from __future__ import annotations

import json
import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, TypedDict, Union

try:
    from blake3 import blake3 as _blake3
except ImportError as e:
    raise ImportError(
        "settle_sdk requires the `blake3` package. "
        "Install with: pip install blake3"
    ) from e

__version__ = "0.1.0"

# ─────────────────────────────────────────────────────────────────────────────
# Canonical JSON — sorted keys, reject undefined / NaN / BigInt-like
# ─────────────────────────────────────────────────────────────────────────────


class CanonicalError(ValueError):
    """Raised when an input violates the canonical-JSON contract."""


def _stable_json(value: Any) -> str:
    """Stable JSON: sorted keys, ASCII-safe escaping, reject special values."""
    return json.dumps(
        _normalize(value),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _normalize(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
            raise CanonicalError("non-finite numbers are not allowed")
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if not isinstance(k, str):
                raise CanonicalError(f"object keys must be strings, got {type(k).__name__}")
            if v is None:
                # Per the TS canonical contract, explicit nulls are allowed
                # but not undefined. Python doesn't distinguish — accept None.
                out[k] = None
                continue
            out[k] = _normalize(v)
        return out
    if isinstance(value, (list, tuple)):
        return [_normalize(v) for v in value]
    raise CanonicalError(f"unsupported value type: {type(value).__name__}")


# ─────────────────────────────────────────────────────────────────────────────
# Hashing primitives
# ─────────────────────────────────────────────────────────────────────────────


def _blake3_bytes(payload: bytes) -> bytes:
    return _blake3(payload).digest()


def _bytes_to_hex(b: bytes) -> str:
    return b.hex()


# Field validators — kept lightweight; raise CanonicalError on bad input.

_PUBKEY_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
_DEC_RE = re.compile(r"^\d+$")
_HTTP_PATH_RE = re.compile(r"^/[^\s]*$")


def _check_pubkey(name: str, val: Any) -> None:
    if not isinstance(val, str) or not _PUBKEY_RE.match(val):
        raise CanonicalError(f"{name} must be a base58 pubkey")


def _check_hex64(name: str, val: Any) -> None:
    if not isinstance(val, str) or not _HEX64_RE.match(val):
        raise CanonicalError(f"{name} must be 32-byte lowercase hex (64 chars)")


def _check_decimal(name: str, val: Any) -> None:
    if not isinstance(val, str) or not _DEC_RE.match(val):
        raise CanonicalError(f"{name} must be a non-negative decimal string")


# ─────────────────────────────────────────────────────────────────────────────
# Canonical hashes — match @settle/sdk byte-for-byte
# ─────────────────────────────────────────────────────────────────────────────


def purpose_text_hash(text: str) -> bytes:
    """BLAKE3 of NFC-normalized + trimmed purpose text."""
    if not isinstance(text, str):
        raise CanonicalError("purpose text must be a string")
    canonical = unicodedata.normalize("NFC", text).strip()
    return _blake3_bytes(canonical.encode("utf-8"))


def canonical_receipt_hash(receipt: Dict[str, Any]) -> bytes:
    """Hash of a CanonicalReceipt object."""
    required = [
        "request_id",
        "card_pubkey",
        "pact_pubkey",
        "merchant_pubkey",
        "amount_lamports",
        "capability_hash",
        "purpose_text_hash",
        "decision_slot",
        "policy_version",
    ]
    for f in required:
        if f not in receipt:
            raise CanonicalError(f"missing field: {f}")
    _check_pubkey("card_pubkey", receipt["card_pubkey"])
    if receipt["pact_pubkey"] is not None:
        _check_pubkey("pact_pubkey", receipt["pact_pubkey"])
    _check_pubkey("merchant_pubkey", receipt["merchant_pubkey"])
    _check_decimal("amount_lamports", receipt["amount_lamports"])
    _check_hex64("capability_hash", receipt["capability_hash"])
    _check_hex64("purpose_text_hash", receipt["purpose_text_hash"])
    return _blake3_bytes(_stable_json(receipt).encode("utf-8"))


def canonical_reason_hash(reason: Dict[str, Any]) -> bytes:
    required = [
        "decision",
        "deny_code",
        "cap_remaining_after",
        "per_call_max",
        "allowlist_match",
        "capability_pinned",
        "merchant_verified",
        "expiry_slot",
        "current_slot",
    ]
    for f in required:
        if f not in reason:
            raise CanonicalError(f"missing field: {f}")
    if reason["decision"] not in ("ALLOW", "DENY", "REVIEW"):
        raise CanonicalError("decision must be ALLOW | DENY | REVIEW")
    return _blake3_bytes(_stable_json(reason).encode("utf-8"))


def canonical_policy_snapshot_hash(snap: Dict[str, Any]) -> bytes:
    required = [
        "policy_version",
        "daily_cap",
        "per_call_max",
        "allowlist_count",
        "expiry_slot",
        "revoked",
    ]
    for f in required:
        if f not in snap:
            raise CanonicalError(f"missing field: {f}")
    _check_decimal("daily_cap", snap["daily_cap"])
    _check_decimal("per_call_max", snap["per_call_max"])
    return _blake3_bytes(_stable_json(snap).encode("utf-8"))


def canonical_purpose_hash(input_dict: Dict[str, Any]) -> bytes:
    required = [
        "request_id",
        "agent_card_pubkey",
        "pact_pubkey",
        "merchant_pubkey",
        "capability_hash",
        "method",
        "path",
        "amount_lamports",
        "receipt_hash",
        "reason_hash",
        "policy_snapshot_hash",
    ]
    for f in required:
        if f not in input_dict:
            raise CanonicalError(f"missing field: {f}")
    _check_pubkey("agent_card_pubkey", input_dict["agent_card_pubkey"])
    if input_dict["pact_pubkey"] is not None:
        _check_pubkey("pact_pubkey", input_dict["pact_pubkey"])
    _check_pubkey("merchant_pubkey", input_dict["merchant_pubkey"])
    _check_decimal("amount_lamports", input_dict["amount_lamports"])
    _check_hex64("capability_hash", input_dict["capability_hash"])
    _check_hex64("receipt_hash", input_dict["receipt_hash"])
    _check_hex64("reason_hash", input_dict["reason_hash"])
    _check_hex64("policy_snapshot_hash", input_dict["policy_snapshot_hash"])
    if input_dict["method"] not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
        raise CanonicalError("method must be a valid HTTP verb")
    if not isinstance(input_dict["path"], str) or not _HTTP_PATH_RE.match(input_dict["path"]):
        raise CanonicalError("path must start with '/' and contain no whitespace")
    return _blake3_bytes(_stable_json(input_dict).encode("utf-8"))


# ─────────────────────────────────────────────────────────────────────────────
# Capability hash
# ─────────────────────────────────────────────────────────────────────────────


def compute_capability_hash_hex(spec: Dict[str, Any]) -> str:
    """Compute the canonical capability hash for a tool specification.

    spec keys: domain, method, path, amount_lamports, version
    """
    if not all(k in spec for k in ("domain", "method", "path", "amount_lamports", "version")):
        raise CanonicalError("spec must include domain, method, path, amount_lamports, version")
    if not _DEC_RE.match(spec["amount_lamports"]):
        raise CanonicalError("amount_lamports must be non-negative decimal string")
    if not isinstance(spec["version"], int) or spec["version"] < 1:
        raise CanonicalError("version must be a positive integer")
    normalized = {
        "domain": unicodedata.normalize("NFC", spec["domain"]),
        "method": spec["method"],
        "path": spec["path"],
        "amount_lamports": spec["amount_lamports"],
        "version": spec["version"],
    }
    return _bytes_to_hex(_blake3_bytes(_stable_json(normalized).encode("utf-8")))


# ─────────────────────────────────────────────────────────────────────────────
# Kernel commit — F2.0 universal receipt
# ─────────────────────────────────────────────────────────────────────────────


KIND_TAG: Dict[str, int] = {
    "x402_spend": 1,
    "direct_send": 2,
    "link_send": 3,
    "streaming_claim": 4,
    "escrow_release": 5,
    "escrow_dispute": 6,
    "refund": 7,
}

ZERO_HASH_HEX = "0" * 64


@dataclass
class KernelCommitResult:
    kind: str
    purpose_text_hash: str
    receipt_hash: str
    reason_hash: str
    policy_snapshot_hash: str
    purpose_hash: str
    context_hash: str
    canonical_receipt: Dict[str, Any]
    canonical_reason: Dict[str, Any]
    canonical_policy_snapshot: Dict[str, Any]


def kernel_commit(input_dict: Dict[str, Any]) -> KernelCommitResult:
    """Compute the 4-hash kernel commit for any payment kind.

    Mirrors @settle/sdk kernelCommit byte-for-byte. Pass a dict with at
    least: kind, request_id, amount_lamports, sender, recipient,
    decision_slot, purpose_text. Card-bound kinds also need card context.
    """
    kind = input_dict.get("kind")
    if kind not in KIND_TAG:
        raise CanonicalError(f"unknown kind: {kind}")
    for f in (
        "request_id",
        "amount_lamports",
        "sender",
        "recipient",
        "decision_slot",
        "purpose_text",
    ):
        if f not in input_dict:
            raise CanonicalError(f"missing field: {f}")
    try:
        uuid.UUID(input_dict["request_id"])
    except Exception:
        raise CanonicalError("request_id must be a UUID")
    _check_pubkey("sender", input_dict["sender"])
    _check_pubkey("recipient", input_dict["recipient"])

    purpose_text_hash_hex = purpose_text_hash(input_dict["purpose_text"]).hex()

    is_card_bound = "card_pubkey" in input_dict
    receipt = {
        "request_id": input_dict["request_id"],
        "card_pubkey": input_dict.get("card_pubkey", input_dict["sender"]),
        "pact_pubkey": input_dict.get("pact_pubkey"),
        "merchant_pubkey": input_dict["recipient"],
        "amount_lamports": input_dict["amount_lamports"],
        "capability_hash": input_dict.get("capability_hash", ZERO_HASH_HEX),
        "purpose_text_hash": purpose_text_hash_hex,
        "decision_slot": input_dict["decision_slot"],
        "policy_version": input_dict.get("policy_version", 0),
    }

    reason = {
        "decision": input_dict.get("decision", "ALLOW"),
        "deny_code": input_dict.get("deny_code", 0),
        "cap_remaining_after": input_dict.get("cap_remaining_after", "0") if is_card_bound else "0",
        "per_call_max": input_dict.get("per_call_max_lamports", "0") if is_card_bound else "0",
        "allowlist_match": True,
        "capability_pinned": is_card_bound and "capability_hash" in input_dict,
        "merchant_verified": False,
        "expiry_slot": int(input_dict.get("expiry_slot", 0)) if is_card_bound else 0,
        "current_slot": int(input_dict["decision_slot"]),
    }

    if is_card_bound:
        snap = {
            "policy_version": int(input_dict["policy_version"]),
            "daily_cap": input_dict["daily_cap_lamports"],
            "per_call_max": input_dict["per_call_max_lamports"],
            "allowlist_count": int(input_dict["allowlist_count"]),
            "expiry_slot": int(input_dict["expiry_slot"]),
            "revoked": bool(input_dict["revoked"]),
        }
    else:
        snap = {
            "policy_version": 0,
            "daily_cap": "0",
            "per_call_max": "0",
            "allowlist_count": 0,
            "expiry_slot": 0,
            "revoked": False,
        }

    receipt_hash_hex = canonical_receipt_hash(receipt).hex()
    reason_hash_hex = canonical_reason_hash(reason).hex()
    policy_snapshot_hash_hex = canonical_policy_snapshot_hash(snap).hex()

    http_method = input_dict.get("http_method", "POST")
    http_path = input_dict.get("http_path", f"/_kernel/{kind}")

    purpose_hash_input = {
        "request_id": receipt["request_id"],
        "agent_card_pubkey": receipt["card_pubkey"],
        "pact_pubkey": receipt["pact_pubkey"],
        "merchant_pubkey": receipt["merchant_pubkey"],
        "capability_hash": receipt["capability_hash"],
        "method": http_method,
        "path": http_path,
        "amount_lamports": receipt["amount_lamports"],
        "receipt_hash": receipt_hash_hex,
        "reason_hash": reason_hash_hex,
        "policy_snapshot_hash": policy_snapshot_hash_hex,
    }
    purpose_hash_hex = canonical_purpose_hash(purpose_hash_input).hex()

    context_input = {
        "kind": kind,
        "sender": input_dict["sender"],
        "recipient": input_dict["recipient"],
        "amount_lamports": input_dict["amount_lamports"],
        "request_id": input_dict["request_id"],
    }
    context_hash_hex = _blake3_bytes(_stable_json(context_input).encode("utf-8")).hex()

    return KernelCommitResult(
        kind=kind,
        purpose_text_hash=purpose_text_hash_hex,
        receipt_hash=receipt_hash_hex,
        reason_hash=reason_hash_hex,
        policy_snapshot_hash=policy_snapshot_hash_hex,
        purpose_hash=purpose_hash_hex,
        context_hash=context_hash_hex,
        canonical_receipt=receipt,
        canonical_reason=reason,
        canonical_policy_snapshot=snap,
    )


# ─────────────────────────────────────────────────────────────────────────────
# verify_receipt — recompute and compare
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class VerifyResult:
    ok: bool
    mismatches: List[str] = field(default_factory=list)


def verify_receipt(args: Dict[str, Any]) -> VerifyResult:
    """Recompute the 4-hash chain from canonical objects and compare to expected.

    args:
      receipt: dict (CanonicalReceipt)
      reason: dict (CanonicalReason)
      policy_snapshot: dict (CanonicalPolicySnapshot)
      http: { "method": ..., "path": ... }
      expected: { "receipt_hash", "reason_hash", "policy_snapshot_hash", "purpose_hash" }
      plaintext_purpose: optional str
    """
    mismatches: List[str] = []
    expected = args["expected"]
    receipt = args["receipt"]
    reason = args["reason"]
    snap = args["policy_snapshot"]
    http = args["http"]

    if "plaintext_purpose" in args and args["plaintext_purpose"] is not None:
        if purpose_text_hash(args["plaintext_purpose"]).hex() != receipt["purpose_text_hash"]:
            mismatches.append("purpose_text_hash")

    if canonical_receipt_hash(receipt).hex() != expected["receipt_hash"]:
        mismatches.append("receipt_hash")
    if canonical_reason_hash(reason).hex() != expected["reason_hash"]:
        mismatches.append("reason_hash")
    if canonical_policy_snapshot_hash(snap).hex() != expected["policy_snapshot_hash"]:
        mismatches.append("policy_snapshot_hash")

    purpose_hash_input = {
        "request_id": receipt["request_id"],
        "agent_card_pubkey": receipt["card_pubkey"],
        "pact_pubkey": receipt["pact_pubkey"],
        "merchant_pubkey": receipt["merchant_pubkey"],
        "capability_hash": receipt["capability_hash"],
        "method": http["method"],
        "path": http["path"],
        "amount_lamports": receipt["amount_lamports"],
        "receipt_hash": expected["receipt_hash"],
        "reason_hash": expected["reason_hash"],
        "policy_snapshot_hash": expected["policy_snapshot_hash"],
    }
    if canonical_purpose_hash(purpose_hash_input).hex() != expected["purpose_hash"]:
        mismatches.append("purpose_hash")

    return VerifyResult(ok=len(mismatches) == 0, mismatches=mismatches)


__all__ = [
    "CanonicalError",
    "KernelCommitResult",
    "VerifyResult",
    "purpose_text_hash",
    "canonical_receipt_hash",
    "canonical_reason_hash",
    "canonical_policy_snapshot_hash",
    "canonical_purpose_hash",
    "compute_capability_hash_hex",
    "kernel_commit",
    "verify_receipt",
    "KIND_TAG",
    "anchor_discriminator",
    "BorshWriter",
    "build_ix_data",
    "ix_create_card",
    "ix_spend",
    "ix_spend_via_pact",
    "ix_open_pact",
    "ix_close_pact",
    "ix_revoke",
    "ix_open_streaming_pact",
    "ix_claim_streaming",
    "ix_pause_streaming",
    "ix_resume_streaming",
    "ix_open_delivery_escrow",
    "ix_release_delivery_escrow",
    "ix_dispute_delivery_escrow",
    "ix_record_denial",
    "ix_record_receipt",
    "AllowlistEntry",
    "__version__",
]


# ─────────────────────────────────────────────────────────────────────
# C85 — Anchor instruction data builders.
#
# Mirrors packages/rust-sdk/src/{borsh_writer,ix_data}.rs and
# apps/web/lib/{borsh,anchor-client}.ts. Returns `bytes` ready to wrap
# in a solders/solana-py Instruction. We deliberately don't depend on
# either of those — keeps the lib lightweight and lets callers pick
# their preferred Solana client.
# ─────────────────────────────────────────────────────────────────────

import hashlib
from dataclasses import dataclass as _ix_dataclass


def anchor_discriminator(kind: str, name: str) -> bytes:
    """Anchor's standard discriminator: sha256("kind:name")[:8].

    `kind` is "global" for instructions, "account" for accounts,
    "event" for events. Returns an 8-byte string identical to the
    TS + Rust ports for the same input.
    """
    seed = f"{kind}:{name}".encode("utf-8")
    return hashlib.sha256(seed).digest()[:8]


class BorshWriter:
    """Minimal Borsh encoder. Mirrors the TS + Rust ports byte-for-byte.

    Supported primitives:
      u8 / u32 / u64 (little-endian)
      bool (1 byte 0/1)
      fixed_bytes (raw, no length prefix)
      string (4-byte LE length + UTF-8)
      vec[T] (4-byte LE count + items via callback)
      option[T] (1-byte tag + value if Some)
    """

    def __init__(self) -> None:
        self._buf = bytearray()

    def to_bytes(self) -> bytes:
        return bytes(self._buf)

    def u8(self, v: int) -> "BorshWriter":
        self._buf.append(v & 0xFF)
        return self

    def u32(self, v: int) -> "BorshWriter":
        self._buf.extend((v & 0xFFFFFFFF).to_bytes(4, "little"))
        return self

    def u64(self, v: int) -> "BorshWriter":
        self._buf.extend((v & 0xFFFFFFFFFFFFFFFF).to_bytes(8, "little"))
        return self

    def bool_(self, v: bool) -> "BorshWriter":
        return self.u8(1 if v else 0)

    def bytes_(self, b: bytes) -> "BorshWriter":
        self._buf.extend(b)
        return self

    def fixed_bytes(self, b: bytes, n: int) -> "BorshWriter":
        if len(b) != n:
            raise ValueError(f"expected {n} bytes, got {len(b)}")
        return self.bytes_(b)

    def string(self, s: str) -> "BorshWriter":
        utf8 = s.encode("utf-8")
        return self.u32(len(utf8)).bytes_(utf8)

    def vec(self, items, write_item) -> "BorshWriter":
        """Borsh Vec<T>: 4-byte LE count + items via callback."""
        self.u32(len(items))
        for item in items:
            write_item(self, item)
        return self

    def option(self, value, write_some) -> "BorshWriter":
        """Borsh Option<T>: 1-byte tag (0=None, 1=Some) + value if Some."""
        if value is None:
            return self.u8(0)
        self.u8(1)
        write_some(self, value)
        return self


def build_ix_data(ix_name: str, write_body) -> bytes:
    """Convenience: discriminator + body bytes."""
    disc = anchor_discriminator("global", ix_name)
    w = BorshWriter()
    write_body(w)
    return disc + w.to_bytes()


# ─────────────────────────────────────────────────────────────────────
# Allowlist entry shared between create_card + open_pact.
# ─────────────────────────────────────────────────────────────────────


@_ix_dataclass
class AllowlistEntry:
    """One entry in a card / pact allowlist.

    `merchant`: 32-byte raw pubkey (caller decodes from base58).
    `capability_hash`: optional 32-byte hash; None = any capability.
    """

    merchant: bytes
    capability_hash: Optional[bytes] = None


def _write_allowlist_entry(w: BorshWriter, e: AllowlistEntry) -> None:
    w.fixed_bytes(e.merchant, 32)
    w.option(e.capability_hash, lambda ww, h: ww.fixed_bytes(h, 32))


# ─────────────────────────────────────────────────────────────────────
# 1. create_card
# ─────────────────────────────────────────────────────────────────────


def ix_create_card(
    *,
    agent_pubkey: bytes,
    label_hash: bytes,
    daily_cap_lamports: int,
    per_call_max_lamports: int,
    allowlist: List[AllowlistEntry],
    expiry_slot: int,
    policy_version: int,
) -> bytes:
    """Build the data bytes for the `create_card` Anchor ix.

    Required accounts (in order, attached by caller):
      0. authority (signer, mut)
      1. card PDA (mut) — derived as ["agent-card", authority, label_hash]
      2. usdc_mint
      3. system_program
    """

    def write(w: BorshWriter) -> None:
        w.fixed_bytes(agent_pubkey, 32)
        w.fixed_bytes(label_hash, 32)
        w.u64(daily_cap_lamports)
        w.u64(per_call_max_lamports)
        w.vec(allowlist, _write_allowlist_entry)
        w.u64(expiry_slot)
        w.u32(policy_version)

    return build_ix_data("create_card", write)


# ─────────────────────────────────────────────────────────────────────
# 2. spend / 3. spend_via_pact — same arg layout, different discriminator
# ─────────────────────────────────────────────────────────────────────


def _spend_args(
    w: BorshWriter,
    *,
    amount: int,
    capability_hash: bytes,
    receipt_hash: bytes,
    reason_hash: bytes,
    policy_snapshot_hash: bytes,
) -> None:
    w.u64(amount)
    w.fixed_bytes(capability_hash, 32)
    w.fixed_bytes(receipt_hash, 32)
    w.fixed_bytes(reason_hash, 32)
    w.fixed_bytes(policy_snapshot_hash, 32)


def ix_spend(
    *,
    amount: int,
    capability_hash: bytes,
    receipt_hash: bytes,
    reason_hash: bytes,
    policy_snapshot_hash: bytes,
) -> bytes:
    """Authority-signed direct spend.

    Required accounts:
      0. authority (signer, mut)
      1. card (mut)
      2. usdc_mint
      3. authority_usdc (mut)
      4. merchant_usdc (mut)
      5. merchant_owner
      6. token_program
    """
    return build_ix_data(
        "spend",
        lambda w: _spend_args(
            w,
            amount=amount,
            capability_hash=capability_hash,
            receipt_hash=receipt_hash,
            reason_hash=reason_hash,
            policy_snapshot_hash=policy_snapshot_hash,
        ),
    )


def ix_spend_via_pact(
    *,
    amount: int,
    capability_hash: bytes,
    receipt_hash: bytes,
    reason_hash: bytes,
    policy_snapshot_hash: bytes,
) -> bytes:
    """Agent-signed spend via Pact PDA. Same args as ix_spend.

    Required accounts:
      0. agent (signer)
      1. fee_payer (signer, mut)
      2. card (mut)
      3. pact (mut)
      4. vault (PDA)
      5. usdc_mint
      6. vault_usdc (mut)
      7. merchant_usdc (mut)
      8. merchant_owner
      9. token_program
     10. associated_token_program
    """
    return build_ix_data(
        "spend_via_pact",
        lambda w: _spend_args(
            w,
            amount=amount,
            capability_hash=capability_hash,
            receipt_hash=receipt_hash,
            reason_hash=reason_hash,
            policy_snapshot_hash=policy_snapshot_hash,
        ),
    )


# ─────────────────────────────────────────────────────────────────────
# 4. open_pact
# ─────────────────────────────────────────────────────────────────────


def ix_open_pact(
    *,
    scope_label_hash: bytes,
    cap_lamports: int,
    allowlist: List[AllowlistEntry],
    expiry_slot: int,
) -> bytes:
    """Open a fresh Pact under a parent card.

    Required accounts:
      0. authority (signer, mut)
      1. parent_card
      2. pact (mut)
      3. vault (PDA)
      4. usdc_mint
      5. authority_usdc (mut)
      6. vault_usdc (mut)
      7. token_program
      8. associated_token_program
      9. system_program
    """

    def write(w: BorshWriter) -> None:
        w.fixed_bytes(scope_label_hash, 32)
        w.u64(cap_lamports)
        w.vec(allowlist, _write_allowlist_entry)
        w.u64(expiry_slot)

    return build_ix_data("open_pact", write)


# ─────────────────────────────────────────────────────────────────────
# 5. close_pact / 6. revoke — empty bodies
# ─────────────────────────────────────────────────────────────────────


def ix_close_pact() -> bytes:
    """Close a pact + drain vault USDC back to authority. Empty body.

    Required accounts:
      0. authority (signer, mut)
      1. pact (mut)
      2. vault (PDA)
      3. usdc_mint
      4. vault_usdc (mut)
      5. authority_usdc (mut)
      6. token_program
    """
    return build_ix_data("close_pact", lambda _w: None)


def ix_revoke() -> bytes:
    """Authority kills the card. Future spends fail with deny_code 1.

    Required accounts:
      0. authority (signer, mut)
      1. card (mut)
    """
    return build_ix_data("revoke", lambda _w: None)


# ─────────────────────────────────────────────────────────────────────
# 7. open_streaming_pact — streaming Pact funded with rate × max_total
# ─────────────────────────────────────────────────────────────────────


def ix_open_streaming_pact(
    *,
    scope_label_hash: bytes,
    rate_lamports_per_slot: int,
    max_total_lamports: int,
    allowlist: List[AllowlistEntry],
    expiry_slot: int,
) -> bytes:
    """Open a streaming Pact with a per-slot rate cap.

    Required accounts (in order):
      0. authority (signer, mut)
      1. parent_card
      2. pact (mut)
      3. vault (PDA)
      4. usdc_mint
      5. authority_usdc (mut)
      6. vault_usdc (mut)
      7. token_program
      8. associated_token_program
      9. system_program
    """

    def write(w: BorshWriter) -> None:
        w.fixed_bytes(scope_label_hash, 32)
        w.u64(rate_lamports_per_slot)
        w.u64(max_total_lamports)
        w.vec(allowlist, _write_allowlist_entry)
        w.u64(expiry_slot)

    return build_ix_data("open_streaming_pact", write)


# ─────────────────────────────────────────────────────────────────────
# 8. claim_streaming — agent draws accrued entitlement.
# ─────────────────────────────────────────────────────────────────────


def ix_claim_streaming(
    *,
    capability_hash: bytes,
    receipt_hash: bytes,
    reason_hash: bytes,
    policy_snapshot_hash: bytes,
) -> bytes:
    """Claim accrued USDC from a streaming Pact. Agent-signed.

    Required accounts (in order):
      0. agent (signer)
      1. fee_payer (signer, mut)
      2. card (mut)
      3. pact (mut)
      4. vault (PDA)
      5. usdc_mint
      6. vault_usdc (mut)
      7. merchant_usdc (mut)
      8. merchant_owner
      9. token_program
     10. associated_token_program
    """

    def write(w: BorshWriter) -> None:
        w.fixed_bytes(capability_hash, 32)
        w.fixed_bytes(receipt_hash, 32)
        w.fixed_bytes(reason_hash, 32)
        w.fixed_bytes(policy_snapshot_hash, 32)

    return build_ix_data("claim_streaming", write)


# ─────────────────────────────────────────────────────────────────────
# 9 + 10. pause_streaming / resume_streaming — empty bodies
# ─────────────────────────────────────────────────────────────────────


def ix_pause_streaming() -> bytes:
    """Authority-only pause toggle on a streaming Pact.

    Required accounts:
      0. authority (signer)
      1. pact (mut)
    """
    return build_ix_data("pause_streaming", lambda _w: None)


def ix_resume_streaming() -> bytes:
    """Authority-only resume toggle on a streaming Pact.

    Required accounts:
      0. authority (signer)
      1. pact (mut)
    """
    return build_ix_data("resume_streaming", lambda _w: None)


# ─────────────────────────────────────────────────────────────────────
# 11. open_delivery_escrow — buyer signs, vault funded, merchant pinned
# ─────────────────────────────────────────────────────────────────────


def ix_open_delivery_escrow(
    *,
    scope_label_hash: bytes,
    amount: int,
    merchant: bytes,
    capability_hash: bytes,
    confirm_deadline_slot: int,
    dispute_deadline_slot: int,
    expiry_slot: int,
) -> bytes:
    """Open a delivery-escrow Pact: buyer locks funds, merchant + capability pinned.

    Required accounts (in order):
      0. authority (signer, mut)
      1. parent_card
      2. pact (mut)
      3. vault (PDA)
      4. usdc_mint
      5. authority_usdc (mut)
      6. vault_usdc (mut)
      7. token_program
      8. associated_token_program
      9. system_program
    """

    def write(w: BorshWriter) -> None:
        w.fixed_bytes(scope_label_hash, 32)
        w.u64(amount)
        w.fixed_bytes(merchant, 32)
        w.fixed_bytes(capability_hash, 32)
        w.u64(confirm_deadline_slot)
        w.u64(dispute_deadline_slot)
        w.u64(expiry_slot)

    return build_ix_data("open_delivery_escrow", write)


# ─────────────────────────────────────────────────────────────────────
# 12 + 13. release_delivery_escrow / dispute_delivery_escrow — empty bodies
# ─────────────────────────────────────────────────────────────────────


def ix_release_delivery_escrow() -> bytes:
    """Buyer-confirm OR permissionless after deadline.

    Caller must attach merchant + vault + ATA accounts in the standard
    Anchor order; see programs/settle-agent-card for the canonical list.
    """
    return build_ix_data("release_delivery_escrow", lambda _w: None)


def ix_dispute_delivery_escrow() -> bytes:
    """Buyer-only dispute, before dispute_deadline_slot.

    Refunds vault USDC back to buyer ATA.
    """
    return build_ix_data("dispute_delivery_escrow", lambda _w: None)


# ─────────────────────────────────────────────────────────────────────
# 14. record_denial — facilitator/agent records an on-chain DENY ledger
# ─────────────────────────────────────────────────────────────────────
# AU-03-008 fix — added to close 3-language SDK parity gap.


def ix_record_denial(
    *,
    deny_code: int,
    merchant: bytes,
    pact: bytes,
    receipt_hash: bytes,
    reason_hash: bytes,
    policy_snapshot_hash: bytes,
) -> bytes:
    """Record a DENY decision for unified ledger (pact-mode + non-pact).

    Required accounts (in order):
      0. signer (facilitator OR card.authority OR card.agent_pubkey)
      1. card

    Args layout:
      u8 deny_code
      32-byte merchant
      32-byte pact
      32-byte receipt_hash
      32-byte reason_hash
      32-byte policy_snapshot_hash
    Total ix data: 8 disc + 1 + 5×32 = 169 bytes.
    """

    def write(w: BorshWriter) -> None:
        w.u8(deny_code)
        w.fixed_bytes(merchant, 32)
        w.fixed_bytes(pact, 32)
        w.fixed_bytes(receipt_hash, 32)
        w.fixed_bytes(reason_hash, 32)
        w.fixed_bytes(policy_snapshot_hash, 32)

    return build_ix_data("record_denial", write)


# ─────────────────────────────────────────────────────────────────────
# 15. record_receipt — F2.0 universal receipt kernel attestation
# ─────────────────────────────────────────────────────────────────────


def ix_record_receipt(
    *,
    kind: int,
    receipt_hash: bytes,
    reason_hash: bytes,
    policy_snapshot_hash: bytes,
    purpose_hash: bytes,
    context_hash: bytes,
) -> bytes:
    """Record a universal-kernel receipt attestation on-chain.

    Required accounts (in order):
      0. attestor (signer)

    Args layout:
      u8 kind   (0=direct_send, 1=x402_spend, 2=streaming_claim, 3=escrow_release,
                 4=escrow_dispute, 5=refund, 6=link_claim — see receipt-kernel.ts)
      32-byte receipt_hash
      32-byte reason_hash
      32-byte policy_snapshot_hash
      32-byte purpose_hash
      32-byte context_hash
    Total ix data: 8 disc + 1 + 5×32 = 169 bytes.
    """

    def write(w: BorshWriter) -> None:
        w.u8(kind)
        w.fixed_bytes(receipt_hash, 32)
        w.fixed_bytes(reason_hash, 32)
        w.fixed_bytes(policy_snapshot_hash, 32)
        w.fixed_bytes(purpose_hash, 32)
        w.fixed_bytes(context_hash, 32)

    return build_ix_data("record_receipt", write)
