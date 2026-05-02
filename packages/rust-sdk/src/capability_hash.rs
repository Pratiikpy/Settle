//! Capability hash — F2.0 spec.
//!
//! Hash inputs (in canonical-JSON order, lexicographically sorted by
//! key as required by canonical_json):
//!   { amount_lamports, domain, method, path, version }
//!
//! Output: lowercase hex of BLAKE3-256.
//!
//! TS reference: packages/sdk/src/capability-hash.ts
//! Python reference: packages/python-sdk/settle_sdk/__init__.py

use crate::canonical::stable_json;
use serde_json::json;

/// A capability spec — must match the TS `Capability` type field-for-field.
pub struct Capability<'a> {
    pub domain: &'a str,
    pub method: &'a str,
    pub path: &'a str,
    pub amount_lamports: &'a str,
    pub version: u64,
}

/// Compute the lowercase-hex BLAKE3-256 capability hash. Byte-identical
/// to `computeCapabilityHashHex` in TS and `compute_capability_hash_hex`
/// in Python.
pub fn compute_capability_hash_hex(cap: &Capability<'_>) -> String {
    let v = json!({
        "domain": cap.domain,
        "method": cap.method,
        "path": cap.path,
        "amount_lamports": cap.amount_lamports,
        "version": cap.version,
    });
    let canonical = stable_json(&v);
    let hash = blake3::hash(canonical.as_bytes());
    hex::encode(hash.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Locked-in golden hash. The same input run through TS + Python
    /// produces this exact string. If you ever break parity, this test
    /// will catch it before the code ships.
    #[test]
    fn parity_translate_demo_settle() {
        let h = compute_capability_hash_hex(&Capability {
            domain: "translate.demo.settle",
            method: "POST",
            path: "/v1/translate",
            amount_lamports: "20000",
            version: 1,
        });
        // GOLDEN: this exact hex is emitted by the TS impl too —
        //   pnpm tsx scripts/smoke-python-parity.ts
        // produces "Translate cap hash: a6c909df...4105b". If this
        // assertion ever fails, the Rust port has drifted from TS
        // canonical-JSON semantics — re-derive both sides and FIX
        // RUST, not the golden.
        assert_eq!(
            h,
            "a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b",
            "Rust capability hash drifted from TS golden"
        );
    }
}
