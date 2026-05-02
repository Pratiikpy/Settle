//! Receipt verification — recompute the 4 hashes from canonical objects
//! and compare against expected. Matches `verify_receipt` in TS + Python.

use crate::canonical::stable_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpectedHashes {
    pub receipt_hash: String,
    pub reason_hash: String,
    pub policy_snapshot_hash: String,
    pub purpose_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyInput {
    /// Canonical receipt (the JSON object that produced the on-chain commit).
    pub receipt: Value,
    /// Canonical reason.
    pub reason: Value,
    /// Canonical policy_snapshot.
    pub policy_snapshot: Value,
    /// The 11-field PurposeHashInput object that the binding hash was computed over.
    /// Must contain exactly the fields TS PurposeHashInputSchema requires.
    pub purpose_input: Value,
    pub expected: ExpectedHashes,
}

#[derive(Debug, Clone, Serialize)]
pub struct VerifyResult {
    pub ok: bool,
    pub mismatches: Vec<String>,
    pub computed: ExpectedHashes,
}

fn hex_blake3(input: &[u8]) -> String {
    hex::encode(blake3::hash(input).as_bytes())
}

fn canonical_hash(v: &Value) -> String {
    hex_blake3(stable_json(v).as_bytes())
}

/// Recompute the 4 hashes from the canonical objects and compare to
/// `expected`. The caller is responsible for re-normalizing `purpose_input`
/// to the same field set the TS schema requires; we just hash what's given.
pub fn verify_receipt(input: &VerifyInput) -> VerifyResult {
    let receipt_hash = canonical_hash(&input.receipt);
    let reason_hash = canonical_hash(&input.reason);
    let policy_snapshot_hash = canonical_hash(&input.policy_snapshot);
    let purpose_hash = canonical_hash(&input.purpose_input);

    let mut mismatches = Vec::new();
    if receipt_hash != input.expected.receipt_hash {
        mismatches.push("receipt_hash".to_string());
    }
    if reason_hash != input.expected.reason_hash {
        mismatches.push("reason_hash".to_string());
    }
    if policy_snapshot_hash != input.expected.policy_snapshot_hash {
        mismatches.push("policy_snapshot_hash".to_string());
    }
    if purpose_hash != input.expected.purpose_hash {
        mismatches.push("purpose_hash".to_string());
    }

    VerifyResult {
        ok: mismatches.is_empty(),
        mismatches,
        computed: ExpectedHashes {
            receipt_hash,
            reason_hash,
            policy_snapshot_hash,
            purpose_hash,
        },
    }
}

/// Convenience: re-NFC + trim a purpose text and BLAKE3 it. Useful when
/// the caller has the plaintext on hand and wants to confirm the
/// `purpose_text_hash` field inside the receipt.
pub fn purpose_text_hash_hex(s: &str) -> String {
    let nfc: String = s.nfc().collect();
    hex_blake3(nfc.trim().as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::{kernel_commit, Decision, KernelCommitInput, ReceiptKind};
    use serde_json::json;

    #[test]
    fn round_trip_self_verify_direct_send() {
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

        let purpose_input = json!({
            "request_id": "11111111-2222-3333-4444-555555555555",
            "agent_card_pubkey": out.canonical_receipt["card_pubkey"],
            "pact_pubkey": out.canonical_receipt["pact_pubkey"],
            "merchant_pubkey": out.canonical_receipt["merchant_pubkey"],
            "capability_hash": out.canonical_receipt["capability_hash"],
            "method": "POST",
            "path": "/_kernel/direct_send",
            "amount_lamports": "500000",
            "receipt_hash": out.hashes.receipt_hash,
            "reason_hash": out.hashes.reason_hash,
            "policy_snapshot_hash": out.hashes.policy_snapshot_hash,
        });

        let v = verify_receipt(&VerifyInput {
            receipt: out.canonical_receipt.clone(),
            reason: out.canonical_reason.clone(),
            policy_snapshot: out.canonical_policy_snapshot.clone(),
            purpose_input,
            expected: ExpectedHashes {
                receipt_hash: out.hashes.receipt_hash.clone(),
                reason_hash: out.hashes.reason_hash.clone(),
                policy_snapshot_hash: out.hashes.policy_snapshot_hash.clone(),
                purpose_hash: out.hashes.purpose_hash.clone(),
            },
        });
        assert!(v.ok, "self-verify failed; mismatches: {:?}", v.mismatches);
    }

    #[test]
    fn detects_tampered_amount() {
        let out = kernel_commit(&KernelCommitInput {
            kind: ReceiptKind::DirectSend,
            request_id: "abc11111-2222-3333-4444-555555555555".into(),
            amount_lamports: "100".into(),
            sender: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp".into(),
            recipient: "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY".into(),
            decision_slot: 1,
            purpose_text: "tiny".into(),
            decision: Decision::Allow,
            deny_code: 0,
            card: None,
            http: None,
        });
        let mut tampered = out.canonical_receipt.clone();
        tampered["amount_lamports"] = json!("999");

        let v = verify_receipt(&VerifyInput {
            receipt: tampered,
            reason: out.canonical_reason,
            policy_snapshot: out.canonical_policy_snapshot,
            purpose_input: json!({}),
            expected: ExpectedHashes {
                receipt_hash: out.hashes.receipt_hash,
                reason_hash: out.hashes.reason_hash,
                policy_snapshot_hash: out.hashes.policy_snapshot_hash,
                purpose_hash: out.hashes.purpose_hash,
            },
        });
        assert!(!v.ok);
        assert!(v.mismatches.contains(&"receipt_hash".to_string()));
    }

    #[test]
    fn purpose_text_hash_nfc_trim() {
        // Hash of "hello" with whitespace + composed unicode.
        let a = purpose_text_hash_hex("  hello  ");
        let b = purpose_text_hash_hex("hello");
        assert_eq!(a, b, "trim must produce identical hash");
    }
}
