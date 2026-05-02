//! F2.0 Universal Receipt Kernel — byte-faithful port of the TS impl.
//!
//! Reference: packages/sdk/src/canonical.ts + packages/sdk/src/receipt-kernel.ts
//!
//! Computes the 4 hashes that every Settle receipt commits to, plus a
//! context_hash for indexable identity. Canonical schemas, field
//! ordering, and missing-key semantics all match the TS reference
//! byte-for-byte. A "TS-emitted receipt" parses through this kernel and
//! produces identical hex.
//!
//! Per-kind logic (card-bound vs not) mirrors `receipt-kernel.ts`:
//!   - card-bound (x402_spend, streaming_claim, escrow_*): supplied
//!     fields fill the canonical receipt + reason + policy_snapshot.
//!   - not-card-bound (direct_send, link_send, refund): we synthesize
//!     a "trivial allow" reason + zeroed policy_snapshot, with sender
//!     standing in for card_pubkey, ZERO_HASH_HEX as capability_hash,
//!     and policy_version=0. The TS port did this so the verifier path
//!     is uniform across kinds; we mirror exactly.

use crate::canonical::stable_json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use unicode_normalization::UnicodeNormalization;

const ZERO_HASH_HEX: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

/// Receipt kind tag — matches `KIND_TAG` in TS receipt-kernel.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReceiptKind {
    X402Spend,
    DirectSend,
    LinkSend,
    StreamingClaim,
    EscrowRelease,
    EscrowDispute,
    Refund,
}

impl ReceiptKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ReceiptKind::X402Spend => "x402_spend",
            ReceiptKind::DirectSend => "direct_send",
            ReceiptKind::LinkSend => "link_send",
            ReceiptKind::StreamingClaim => "streaming_claim",
            ReceiptKind::EscrowRelease => "escrow_release",
            ReceiptKind::EscrowDispute => "escrow_dispute",
            ReceiptKind::Refund => "refund",
        }
    }

    pub fn tag(&self) -> u8 {
        match self {
            ReceiptKind::X402Spend => 1,
            ReceiptKind::DirectSend => 2,
            ReceiptKind::LinkSend => 3,
            ReceiptKind::StreamingClaim => 4,
            ReceiptKind::EscrowRelease => 5,
            ReceiptKind::EscrowDispute => 6,
            ReceiptKind::Refund => 7,
        }
    }

    pub fn is_card_bound(&self) -> bool {
        matches!(
            self,
            ReceiptKind::X402Spend
                | ReceiptKind::StreamingClaim
                | ReceiptKind::EscrowRelease
                | ReceiptKind::EscrowDispute
        )
    }
}

/// Card context — required when `kind.is_card_bound()`, ignored otherwise.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CardContext {
    pub card_pubkey: String,
    pub pact_pubkey: Option<String>,
    pub capability_hash: String,
    pub policy_version: u64,
    pub daily_cap_lamports: String,
    pub per_call_max_lamports: String,
    pub allowlist_count: u64,
    pub expiry_slot: u64,
    pub revoked: bool,
    pub cap_remaining_after: String,
}

/// HTTP context — required when `kind == X402Spend`, optional otherwise.
/// When absent, kernel defaults to method="POST", path="/_kernel/<kind>".
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HttpContext {
    pub http_method: String,
    pub http_path: String,
}

/// Decision — matches TS enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Decision {
    #[serde(rename = "ALLOW")]
    Allow,
    #[serde(rename = "DENY")]
    Deny,
    #[serde(rename = "REVIEW")]
    Review,
}
impl Decision {
    fn as_str(&self) -> &'static str {
        match self {
            Decision::Allow => "ALLOW",
            Decision::Deny => "DENY",
            Decision::Review => "REVIEW",
        }
    }
}

/// Input to `kernel_commit`. Contains all the fields the TS schema can
/// supply — the kernel ignores card/http context for non-applicable kinds.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KernelCommitInput {
    pub kind: ReceiptKind,
    pub request_id: String,
    pub amount_lamports: String,
    pub sender: String,
    pub recipient: String,
    pub decision_slot: u64,
    pub purpose_text: String,
    #[serde(default = "default_decision")]
    pub decision: Decision,
    #[serde(default)]
    pub deny_code: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card: Option<CardContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub http: Option<HttpContext>,
}

fn default_decision() -> Decision {
    Decision::Allow
}

/// Four-hash commit chain.
#[derive(Debug, Clone, Serialize)]
pub struct KernelHashes {
    pub purpose_text_hash: String,
    pub receipt_hash: String,
    pub reason_hash: String,
    pub policy_snapshot_hash: String,
    pub purpose_hash: String,
}

/// Output of `kernel_commit`. Mirrors TS `KernelCommitResult`.
#[derive(Debug, Clone, Serialize)]
pub struct KernelCommitOutput {
    pub kind: ReceiptKind,
    pub canonical_receipt: Value,
    pub canonical_reason: Value,
    pub canonical_policy_snapshot: Value,
    pub hashes: KernelHashes,
    pub context_hash: String,
}

// ─── hashing primitives ───

fn hex_blake3(input: &[u8]) -> String {
    hex::encode(blake3::hash(input).as_bytes())
}

fn canonical_hash(value: &Value) -> String {
    hex_blake3(stable_json(value).as_bytes())
}

fn canonicalize_purpose_text(s: &str) -> String {
    let nfc: String = s.nfc().collect();
    nfc.trim().to_string()
}

fn purpose_text_hash(s: &str) -> String {
    hex_blake3(canonicalize_purpose_text(s).as_bytes())
}

// ─── canonical builders ───

fn build_receipt(input: &KernelCommitInput, purpose_text_hash_hex: &str) -> Value {
    let card = input.card.as_ref();
    let card_pubkey = card
        .map(|c| c.card_pubkey.clone())
        .unwrap_or_else(|| input.sender.clone());
    let pact_pubkey = card.and_then(|c| c.pact_pubkey.clone());
    let capability_hash = card
        .map(|c| c.capability_hash.clone())
        .unwrap_or_else(|| ZERO_HASH_HEX.to_string());
    let policy_version = card.map(|c| c.policy_version).unwrap_or(0);

    let mut m = Map::new();
    m.insert("request_id".into(), Value::String(input.request_id.clone()));
    m.insert("card_pubkey".into(), Value::String(card_pubkey));
    m.insert(
        "pact_pubkey".into(),
        match pact_pubkey {
            Some(p) => Value::String(p),
            None => Value::Null,
        },
    );
    m.insert(
        "merchant_pubkey".into(),
        Value::String(input.recipient.clone()),
    );
    m.insert(
        "amount_lamports".into(),
        Value::String(input.amount_lamports.clone()),
    );
    m.insert("capability_hash".into(), Value::String(capability_hash));
    m.insert(
        "purpose_text_hash".into(),
        Value::String(purpose_text_hash_hex.to_string()),
    );
    m.insert("decision_slot".into(), Value::Number(input.decision_slot.into()));
    m.insert("policy_version".into(), Value::Number(policy_version.into()));
    Value::Object(m)
}

fn build_reason(input: &KernelCommitInput) -> Value {
    let card = input.card.as_ref();
    let is_card_bound = card.is_some();
    let cap_remaining_after = card
        .map(|c| c.cap_remaining_after.clone())
        .unwrap_or_else(|| "0".to_string());
    let per_call_max = card
        .map(|c| c.per_call_max_lamports.clone())
        .unwrap_or_else(|| "0".to_string());
    let expiry_slot = card.map(|c| c.expiry_slot).unwrap_or(0);

    let mut m = Map::new();
    m.insert(
        "decision".into(),
        Value::String(input.decision.as_str().to_string()),
    );
    m.insert("deny_code".into(), Value::Number(input.deny_code.into()));
    m.insert("cap_remaining_after".into(), Value::String(cap_remaining_after));
    m.insert("per_call_max".into(), Value::String(per_call_max));
    // For non-card kinds, "user signing IS the allowlist" — TS sets true unconditionally.
    m.insert("allowlist_match".into(), Value::Bool(true));
    m.insert("capability_pinned".into(), Value::Bool(is_card_bound));
    m.insert("merchant_verified".into(), Value::Bool(false));
    m.insert("expiry_slot".into(), Value::Number(expiry_slot.into()));
    m.insert("current_slot".into(), Value::Number(input.decision_slot.into()));
    Value::Object(m)
}

fn build_policy_snapshot(input: &KernelCommitInput) -> Value {
    let mut m = Map::new();
    if let Some(c) = input.card.as_ref() {
        m.insert("policy_version".into(), Value::Number(c.policy_version.into()));
        m.insert("daily_cap".into(), Value::String(c.daily_cap_lamports.clone()));
        m.insert(
            "per_call_max".into(),
            Value::String(c.per_call_max_lamports.clone()),
        );
        m.insert(
            "allowlist_count".into(),
            Value::Number(c.allowlist_count.into()),
        );
        m.insert("expiry_slot".into(), Value::Number(c.expiry_slot.into()));
        m.insert("revoked".into(), Value::Bool(c.revoked));
    } else {
        m.insert("policy_version".into(), Value::Number(0u64.into()));
        m.insert("daily_cap".into(), Value::String("0".into()));
        m.insert("per_call_max".into(), Value::String("0".into()));
        m.insert("allowlist_count".into(), Value::Number(0u64.into()));
        m.insert("expiry_slot".into(), Value::Number(0u64.into()));
        m.insert("revoked".into(), Value::Bool(false));
    }
    Value::Object(m)
}

fn build_purpose_hash_input(
    input: &KernelCommitInput,
    receipt: &Value,
    receipt_hash: &str,
    reason_hash: &str,
    policy_snapshot_hash: &str,
) -> Value {
    let http_method = input
        .http
        .as_ref()
        .map(|h| h.http_method.clone())
        .unwrap_or_else(|| "POST".to_string());
    let http_path = input
        .http
        .as_ref()
        .map(|h| h.http_path.clone())
        .unwrap_or_else(|| format!("/_kernel/{}", input.kind.as_str()));

    let agent_card_pubkey = receipt
        .get("card_pubkey")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let pact_pubkey = receipt.get("pact_pubkey").cloned().unwrap_or(Value::Null);
    let merchant_pubkey = receipt
        .get("merchant_pubkey")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let capability_hash = receipt
        .get("capability_hash")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut m = Map::new();
    m.insert("request_id".into(), Value::String(input.request_id.clone()));
    m.insert("agent_card_pubkey".into(), Value::String(agent_card_pubkey));
    m.insert("pact_pubkey".into(), pact_pubkey);
    m.insert("merchant_pubkey".into(), Value::String(merchant_pubkey));
    m.insert("capability_hash".into(), Value::String(capability_hash));
    m.insert("method".into(), Value::String(http_method));
    m.insert("path".into(), Value::String(http_path));
    m.insert(
        "amount_lamports".into(),
        Value::String(input.amount_lamports.clone()),
    );
    m.insert("receipt_hash".into(), Value::String(receipt_hash.into()));
    m.insert("reason_hash".into(), Value::String(reason_hash.into()));
    m.insert(
        "policy_snapshot_hash".into(),
        Value::String(policy_snapshot_hash.into()),
    );
    Value::Object(m)
}

/// Compute the F2.0 kernel commit. Output is byte-identical to the TS
/// `kernelCommit` and Python `kernel_commit` for the same input.
pub fn kernel_commit(input: &KernelCommitInput) -> KernelCommitOutput {
    let purpose_text_hash_hex = purpose_text_hash(&input.purpose_text);

    let canonical_receipt = build_receipt(input, &purpose_text_hash_hex);
    let canonical_reason = build_reason(input);
    let canonical_policy_snapshot = build_policy_snapshot(input);

    let receipt_hash = canonical_hash(&canonical_receipt);
    let reason_hash = canonical_hash(&canonical_reason);
    let policy_snapshot_hash = canonical_hash(&canonical_policy_snapshot);

    let purpose_input = build_purpose_hash_input(
        input,
        &canonical_receipt,
        &receipt_hash,
        &reason_hash,
        &policy_snapshot_hash,
    );
    let purpose_hash = canonical_hash(&purpose_input);

    // Context hash — canonical-JSON over { kind, sender, recipient,
    // amount_lamports, request_id }, NOT a concat of bytes.
    let context_value = json!({
        "kind": input.kind.as_str(),
        "sender": input.sender,
        "recipient": input.recipient,
        "amount_lamports": input.amount_lamports,
        "request_id": input.request_id,
    });
    let context_hash = canonical_hash(&context_value);

    KernelCommitOutput {
        kind: input.kind,
        canonical_receipt,
        canonical_reason,
        canonical_policy_snapshot,
        hashes: KernelHashes {
            purpose_text_hash: purpose_text_hash_hex,
            receipt_hash,
            reason_hash,
            policy_snapshot_hash,
            purpose_hash,
        },
        context_hash,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Golden test — locks `direct_send` parity vs the TS reference.
    /// Numbers come from `pnpm tsx scripts/smoke-python-parity.ts`:
    ///   receipt_hash:        095a40c24988392828639b5621bf2dbfbb597dc63ef57ef562930d0e5b133126
    ///   reason_hash:         320e5f7ee4bdfdeba756b3d1985962ee5e41f2bdeb315f8249e238ea71b5590a
    ///   policy_snapshot_hash:203bceb4b5d4af2624a79359818439c1a8895bacc9fc4fca70ffd8de59660d71
    ///   purpose_hash:        ac9a1f2e6aad968b0da5a18309d916a7f69c2d6012f9ee123bf45d43663804dd
    ///   context_hash:        6bb849195e1214908da2ed25c9e007bf91cc7ae68cdee63115fa693fa51dfaa8
    #[test]
    fn parity_direct_send_golden() {
        let out = kernel_commit(&KernelCommitInput {
            kind: ReceiptKind::DirectSend,
            request_id: "11111111-2222-3333-4444-555555555555".into(),
            amount_lamports: "500000".into(),
            sender: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp".into(),
            recipient: "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY".into(),
            decision_slot: 1000,
            purpose_text: "coffee with alice".into(),
            decision: Decision::Allow,
            deny_code: 0,
            card: None,
            http: None,
        });

        assert_eq!(
            out.hashes.receipt_hash,
            "095a40c24988392828639b5621bf2dbfbb597dc63ef57ef562930d0e5b133126",
            "receipt_hash drifted from TS golden"
        );
        assert_eq!(
            out.hashes.reason_hash,
            "320e5f7ee4bdfdeba756b3d1985962ee5e41f2bdeb315f8249e238ea71b5590a",
            "reason_hash drifted from TS golden"
        );
        assert_eq!(
            out.hashes.policy_snapshot_hash,
            "203bceb4b5d4af2624a79359818439c1a8895bacc9fc4fca70ffd8de59660d71",
            "policy_snapshot_hash drifted from TS golden"
        );
        assert_eq!(
            out.hashes.purpose_hash,
            "ac9a1f2e6aad968b0da5a18309d916a7f69c2d6012f9ee123bf45d43663804dd",
            "purpose_hash drifted from TS golden"
        );
        assert_eq!(
            out.context_hash,
            "6bb849195e1214908da2ed25c9e007bf91cc7ae68cdee63115fa693fa51dfaa8",
            "context_hash drifted from TS golden"
        );
    }

    /// Goldens emitted by scripts/smoke-multikind-goldens.ts. Each
    /// kind has its own block; if any drifts, fix Rust (or, if the
    /// canonical schema changed, regenerate ALL goldens via the script
    /// and update both ports together).
    #[test]
    fn parity_x402_spend_golden() {
        let out = kernel_commit(&KernelCommitInput {
            kind: ReceiptKind::X402Spend,
            request_id: "11111111-aaaa-bbbb-cccc-222222222222".into(),
            amount_lamports: "20000".into(),
            sender: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp".into(),
            recipient: "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY".into(),
            decision_slot: 5,
            purpose_text: "translate this".into(),
            decision: Decision::Allow,
            deny_code: 0,
            card: Some(CardContext {
                card_pubkey: "8RTNZ3K7gK2nQfqkXCWNkD3FrM5pZ9TyVmLs4WsKZGZE".into(),
                pact_pubkey: None,
                capability_hash:
                    "a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b".into(),
                policy_version: 1,
                daily_cap_lamports: "1000000".into(),
                per_call_max_lamports: "100000".into(),
                allowlist_count: 1,
                expiry_slot: 1_000_000,
                revoked: false,
                cap_remaining_after: "980000".into(),
            }),
            http: Some(HttpContext {
                http_method: "POST".into(),
                http_path: "/v1/translate".into(),
            }),
        });
        assert_eq!(
            out.hashes.receipt_hash,
            "80565ec9ad5af63cf6dc72ba47ce43cbcd0bd6c11fb038899caca60e7a82ad88",
        );
        assert_eq!(
            out.hashes.reason_hash,
            "99708ab7e1fd3f88b36065aeac13eb165543c60d71f8718e59812296fc46dac3",
        );
        assert_eq!(
            out.hashes.policy_snapshot_hash,
            "02d4ee78f62bcd12da76d6d22c5a97e9d67471ec89753eb3dd67a843b2da4529",
        );
        assert_eq!(
            out.hashes.purpose_hash,
            "c1114fe7b1b956609d11724cd6900d65d0d15b23f06469a4f3f3ab624d415146",
        );
        assert_eq!(
            out.context_hash,
            "71746a2f4969117aab4a65b670bbdeaf45dc70c69612a9b9afbae1539f090c1a",
        );
    }

    /// link_send: not card-bound, so kernel synthesizes trivial reason/policy.
    /// Note: the TS port has a `link_token` field that's NOT part of the
    /// canonical receipt schema — it's only carried in the input for
    /// audit purposes but not hashed. Same in Rust: we don't model it.
    #[test]
    fn parity_link_send_golden() {
        let out = kernel_commit(&KernelCommitInput {
            kind: ReceiptKind::LinkSend,
            request_id: "33333333-aaaa-bbbb-cccc-444444444444".into(),
            amount_lamports: "250000".into(),
            sender: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp".into(),
            recipient: "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY".into(),
            decision_slot: 100,
            purpose_text: "claim from link".into(),
            decision: Decision::Allow,
            deny_code: 0,
            card: None,
            http: None,
        });
        assert_eq!(
            out.hashes.receipt_hash,
            "edfbaeff1392131f6e01602d618c8e028a492b591befe241512eebc6b5c761d9",
        );
        assert_eq!(
            out.hashes.reason_hash,
            "20eefb226225819fb419cbb16bd40378f4d06c99e28500810e94ac1f69ed453a",
        );
        assert_eq!(
            out.hashes.policy_snapshot_hash,
            "203bceb4b5d4af2624a79359818439c1a8895bacc9fc4fca70ffd8de59660d71",
        );
        assert_eq!(
            out.hashes.purpose_hash,
            "567f34f2645ef6accf8a0a0b9a6250cdeb4d3a01fb169abb9c0bd829dab6c3b9",
        );
        assert_eq!(
            out.context_hash,
            "0539e2c195af3868c6795e8e850383c1d927a9ffe7f82e53a7bc77e83cd8e2d6",
        );
    }

    #[test]
    fn parity_streaming_claim_golden() {
        let out = kernel_commit(&KernelCommitInput {
            kind: ReceiptKind::StreamingClaim,
            request_id: "55555555-aaaa-bbbb-cccc-666666666666".into(),
            amount_lamports: "10000".into(),
            sender: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp".into(),
            recipient: "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY".into(),
            decision_slot: 500,
            purpose_text: "10s of agent work".into(),
            decision: Decision::Allow,
            deny_code: 0,
            card: Some(CardContext {
                card_pubkey: "8RTNZ3K7gK2nQfqkXCWNkD3FrM5pZ9TyVmLs4WsKZGZE".into(),
                pact_pubkey: Some("DnQYwGhAqJ7tPjKpQqZsXLg5Pi9MhT6cWnKnZJ2xY8WX".into()),
                capability_hash:
                    "a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b".into(),
                policy_version: 1,
                daily_cap_lamports: "500000".into(),
                per_call_max_lamports: "50000".into(),
                allowlist_count: 1,
                expiry_slot: 1_000_000,
                revoked: false,
                cap_remaining_after: "490000".into(),
            }),
            http: None,
        });
        assert_eq!(
            out.hashes.receipt_hash,
            "1364f1962b4cfd348c4192a5df35eebf146f06c37bfb2efec4b79db4bfa12c19",
        );
        assert_eq!(
            out.hashes.reason_hash,
            "68de38c35fee6b9866a924327133f9b80571360bbf3fb72fa303f6fc62f5c959",
        );
        assert_eq!(
            out.hashes.policy_snapshot_hash,
            "38c0279b0fff1d31d5566f54421527a684fbcdfc43f4b0d0d77829c276eb6cfb",
        );
        assert_eq!(
            out.hashes.purpose_hash,
            "0275f457a87414fb3a20c6a2f0bc2f63bb5936abd0a80c052c61cfa30dcafb1f",
        );
        assert_eq!(
            out.context_hash,
            "1aea979027321818d0a83b7f20ddb2231e98fc9119ee1ab2071ad019995fec89",
        );
    }

    #[test]
    fn parity_escrow_release_golden() {
        let out = kernel_commit(&KernelCommitInput {
            kind: ReceiptKind::EscrowRelease,
            request_id: "77777777-aaaa-bbbb-cccc-888888888888".into(),
            amount_lamports: "100000".into(),
            sender: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp".into(),
            recipient: "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY".into(),
            decision_slot: 200,
            purpose_text: "buyer confirmed delivery".into(),
            decision: Decision::Allow,
            deny_code: 0,
            card: Some(CardContext {
                card_pubkey: "8RTNZ3K7gK2nQfqkXCWNkD3FrM5pZ9TyVmLs4WsKZGZE".into(),
                pact_pubkey: Some("DnQYwGhAqJ7tPjKpQqZsXLg5Pi9MhT6cWnKnZJ2xY8WX".into()),
                capability_hash:
                    "a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b".into(),
                policy_version: 1,
                daily_cap_lamports: "1000000".into(),
                per_call_max_lamports: "200000".into(),
                allowlist_count: 1,
                expiry_slot: 1_000_000,
                revoked: false,
                cap_remaining_after: "900000".into(),
            }),
            http: None,
        });
        assert_eq!(
            out.hashes.receipt_hash,
            "b129df141dc35c96568e68ad99d267b438aefa57f6b11e190d1e2f4f62bec1cd",
        );
        assert_eq!(
            out.hashes.reason_hash,
            "ae20631aa34d0c6b5d721786101c4c36efe1b5f8be76a08891b2d3bc79fcbabf",
        );
        assert_eq!(
            out.hashes.policy_snapshot_hash,
            "9b4e4a38fdefb8189dddd4fe049c001a8904eb06d52ea6898c398721cee66f35",
        );
        assert_eq!(
            out.hashes.purpose_hash,
            "33e4ae63234a2fdc0d99df440a2b7a4331ee87419dcc09809760b0d17c3c025d",
        );
        assert_eq!(
            out.context_hash,
            "223186d7c194a131a36a20ca3bd85bc75aa478ca2e8db0919aa0bd9c5655a418",
        );
    }

    #[test]
    fn parity_escrow_dispute_golden() {
        let out = kernel_commit(&KernelCommitInput {
            kind: ReceiptKind::EscrowDispute,
            request_id: "99999999-aaaa-bbbb-cccc-aaaaaaaaaaaa".into(),
            amount_lamports: "100000".into(),
            sender: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp".into(),
            recipient: "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY".into(),
            decision_slot: 250,
            purpose_text: "buyer disputed delivery".into(),
            decision: Decision::Allow,
            deny_code: 0,
            card: Some(CardContext {
                card_pubkey: "8RTNZ3K7gK2nQfqkXCWNkD3FrM5pZ9TyVmLs4WsKZGZE".into(),
                pact_pubkey: Some("DnQYwGhAqJ7tPjKpQqZsXLg5Pi9MhT6cWnKnZJ2xY8WX".into()),
                capability_hash:
                    "a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b".into(),
                policy_version: 1,
                daily_cap_lamports: "1000000".into(),
                per_call_max_lamports: "200000".into(),
                allowlist_count: 1,
                expiry_slot: 1_000_000,
                revoked: false,
                cap_remaining_after: "900000".into(),
            }),
            http: None,
        });
        assert_eq!(
            out.hashes.receipt_hash,
            "3c73cce2770024ca87fc69347ab9ace3d5564652a6dcd090a4f1e35136e06fb7",
        );
        assert_eq!(
            out.hashes.reason_hash,
            "35170d9617721bbaf2b81e7eb7026ca64be3ab39e6ee7bd92956ab6345d6c1e3",
        );
        assert_eq!(
            out.hashes.policy_snapshot_hash,
            "9b4e4a38fdefb8189dddd4fe049c001a8904eb06d52ea6898c398721cee66f35",
        );
        assert_eq!(
            out.hashes.purpose_hash,
            "9b6b54e126b87c7b357dc48dd7d9bab2fdb19f4580daeea409236ec3dc3ad031",
        );
        assert_eq!(
            out.context_hash,
            "0976a81e755d5dbf45544f1e98ee22e97a08acc991a7c5634c0e51146d3af609",
        );
    }

    /// refund: not card-bound. Same caveat as link_send — TS carries
    /// refund_of_request_id + refund_reason as audit fields outside
    /// the canonical hash, so we don't model them in Rust either.
    #[test]
    fn parity_refund_golden() {
        let out = kernel_commit(&KernelCommitInput {
            kind: ReceiptKind::Refund,
            request_id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff".into(),
            amount_lamports: "50000".into(),
            sender: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp".into(),
            recipient: "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY".into(),
            decision_slot: 300,
            purpose_text: "refund: never delivered".into(),
            decision: Decision::Allow,
            deny_code: 0,
            card: None,
            http: None,
        });
        assert_eq!(
            out.hashes.receipt_hash,
            "d0eb4dfe90a075a32661227b226659234c06cd8b60a7087e6cbf1f4fe3416731",
        );
        assert_eq!(
            out.hashes.reason_hash,
            "8d434396696028e23f1a02fa154bd72108b358c970b1db729987e954479bf562",
        );
        assert_eq!(
            out.hashes.policy_snapshot_hash,
            "203bceb4b5d4af2624a79359818439c1a8895bacc9fc4fca70ffd8de59660d71",
        );
        assert_eq!(
            out.hashes.purpose_hash,
            "89eae6c490e19f807c95d5d1754a42c73d56408077122d1a3584954c5dffd602",
        );
        assert_eq!(
            out.context_hash,
            "9091adf2af8062335c7f0af15c4cacec8ed9a6fb09181af6fa38714b59d111e5",
        );
    }
}
