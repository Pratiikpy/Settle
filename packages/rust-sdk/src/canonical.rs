//! Canonical JSON — sorted keys, no whitespace.
//!
//! Why we don't use `serde_json::to_string` directly: it doesn't sort
//! object keys (insertion-order or RandomState depending on `Map`
//! variant), and inserting a sort step on every nested object is
//! enough to drift from the TS reference if you're not careful.
//!
//! The TS algorithm (packages/sdk/src/canonical.ts) recurses:
//!   1. null / number / boolean / string → JSON.stringify
//!   2. array → "[" + comma-joined recursive results + "]"
//!   3. object → keys sorted lexicographically, each as
//!      JSON.stringify(key) + ":" + recursive(value), comma-joined
//!      between "{" and "}"
//!
//! We mirror that. Rust strings use `serde_json::to_string` for the
//! single-value case so escape rules are byte-identical.

use serde_json::Value;
use std::fmt::Write;

/// Serialize a `serde_json::Value` to canonical JSON: sorted-keys,
/// no whitespace, RFC-8259-compatible escapes.
pub fn stable_json(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => {
            // Defer string escaping to serde_json so we match TS
            // JSON.stringify byte-for-byte.
            serde_json::to_string(s).expect("string serialization is infallible")
        }
        Value::Array(arr) => {
            let mut out = String::from("[");
            for (i, v) in arr.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&stable_json(v));
            }
            out.push(']');
            out
        }
        Value::Object(obj) => {
            let mut keys: Vec<&String> = obj.keys().collect();
            keys.sort();
            let mut out = String::from("{");
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                let key_json = serde_json::to_string(k).expect("string serialization is infallible");
                let _ = write!(out, "{}:", key_json);
                out.push_str(&stable_json(&obj[*k]));
            }
            out.push('}');
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sorts_object_keys() {
        let v = json!({ "b": 1, "a": 2 });
        assert_eq!(stable_json(&v), r#"{"a":2,"b":1}"#);
    }

    #[test]
    fn no_whitespace() {
        let v = json!({ "x": [1, 2, 3] });
        assert_eq!(stable_json(&v), r#"{"x":[1,2,3]}"#);
    }

    #[test]
    fn nested_objects() {
        let v = json!({ "a": { "z": 1, "y": 2 }, "b": 3 });
        assert_eq!(stable_json(&v), r#"{"a":{"y":2,"z":1},"b":3}"#);
    }

    #[test]
    fn handles_null_bool_number_string() {
        let v = json!({ "n": null, "b": true, "i": 42, "s": "hi" });
        assert_eq!(stable_json(&v), r#"{"b":true,"i":42,"n":null,"s":"hi"}"#);
    }
}
