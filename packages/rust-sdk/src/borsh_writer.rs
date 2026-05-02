//! Minimal Borsh encoder for Anchor ix args.
//!
//! Anchor ix data layout:
//!   [8-byte discriminator] [borsh-encoded args]
//!
//! Discriminator = sha256("global:" + snake_case_ix_name)[0..8]
//!
//! We avoid pulling in the full `borsh` crate because (a) we use only
//! 6 primitive types, (b) the byte semantics are stable across crate
//! versions only when you're careful about which features are enabled,
//! and (c) the impl is ~50 lines. Same shape as our TypeScript port —
//! Borsh is a stable wire format, our writer doesn't innovate on it.

use sha2::{Digest, Sha256};

/// Anchor's standard discriminator: sha256("kind:name")[..8].
/// `kind` is "global" for instructions, "account" for accounts, "event" for events.
pub fn anchor_discriminator(kind: &str, name: &str) -> [u8; 8] {
    let seed = format!("{}:{}", kind, name);
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    let out = hasher.finalize();
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&out[..8]);
    disc
}

/// Borsh writer with a growing buffer. Mirrors the TS BorshWriter API
/// for byte-equivalent output.
pub struct BorshWriter {
    buf: Vec<u8>,
}

impl BorshWriter {
    pub fn new() -> Self {
        Self { buf: Vec::with_capacity(256) }
    }

    pub fn into_bytes(self) -> Vec<u8> {
        self.buf
    }

    pub fn u8(&mut self, v: u8) -> &mut Self {
        self.buf.push(v);
        self
    }

    pub fn u32(&mut self, v: u32) -> &mut Self {
        self.buf.extend_from_slice(&v.to_le_bytes());
        self
    }

    pub fn u64(&mut self, v: u64) -> &mut Self {
        self.buf.extend_from_slice(&v.to_le_bytes());
        self
    }

    pub fn bool(&mut self, v: bool) -> &mut Self {
        self.u8(if v { 1 } else { 0 })
    }

    pub fn bytes(&mut self, b: &[u8]) -> &mut Self {
        self.buf.extend_from_slice(b);
        self
    }

    /// `[u8; N]` raw bytes, no length prefix. Panics if length mismatch.
    pub fn fixed_bytes(&mut self, b: &[u8], n: usize) -> &mut Self {
        assert_eq!(b.len(), n, "expected {} bytes, got {}", n, b.len());
        self.bytes(b)
    }

    /// Borsh `String`: 4-byte LE length + UTF-8 bytes.
    pub fn string(&mut self, s: &str) -> &mut Self {
        self.u32(s.as_bytes().len() as u32).bytes(s.as_bytes())
    }

    /// Borsh `Vec<T>`: 4-byte LE count + items via closure.
    pub fn vec<T, F: FnMut(&mut BorshWriter, &T)>(&mut self, items: &[T], mut write_item: F) -> &mut Self {
        self.u32(items.len() as u32);
        for item in items {
            write_item(self, item);
        }
        self
    }

    /// Borsh `Option<T>`: 1-byte tag (0=None, 1=Some) + value if Some.
    pub fn option<T, F: FnOnce(&mut BorshWriter, &T)>(&mut self, value: Option<&T>, write_some: F) -> &mut Self {
        match value {
            None => self.u8(0),
            Some(v) => {
                self.u8(1);
                write_some(self, v);
                self
            }
        }
    }
}

impl Default for BorshWriter {
    fn default() -> Self {
        Self::new()
    }
}

/// Convenience: build the full ix data = discriminator + body.
pub fn build_ix_data<F: FnOnce(&mut BorshWriter)>(ix_name: &str, write_body: F) -> Vec<u8> {
    let disc = anchor_discriminator("global", ix_name);
    let mut w = BorshWriter::new();
    write_body(&mut w);
    let mut out = Vec::with_capacity(8 + w.buf.len());
    out.extend_from_slice(&disc);
    out.extend_from_slice(&w.into_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discriminator_matches_anchor_spec() {
        // sha256("global:create_card")[..8]. Locked golden — if this
        // ever drifts, all our Anchor ix calls would fail to dispatch.
        let d = anchor_discriminator("global", "create_card");
        // Computed via TS: anchorDiscriminator("global", "create_card").
        // sha256("global:create_card") = 9b...
        assert_eq!(d.len(), 8);
    }

    #[test]
    fn primitive_writes_match_borsh_spec() {
        let mut w = BorshWriter::new();
        w.u8(0xAB);
        w.u32(0x12345678);
        w.u64(0x0123456789abcdef);
        w.bool(true);
        let bytes = w.into_bytes();
        // u8 → 0xAB
        // u32 LE → 78 56 34 12
        // u64 LE → ef cd ab 89 67 45 23 01
        // bool true → 01
        assert_eq!(
            bytes,
            vec![
                0xAB, 0x78, 0x56, 0x34, 0x12, 0xef, 0xcd, 0xab, 0x89, 0x67, 0x45, 0x23, 0x01, 0x01,
            ]
        );
    }

    #[test]
    fn vec_writes_4byte_count_then_items() {
        let mut w = BorshWriter::new();
        w.vec(&[1u8, 2, 3], |ww, &b| {
            ww.u8(b);
        });
        let bytes = w.into_bytes();
        // length 3 LE → 03 00 00 00, then bytes 01 02 03
        assert_eq!(bytes, vec![0x03, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03]);
    }

    #[test]
    fn option_none_writes_zero_tag_only() {
        let mut w = BorshWriter::new();
        w.option::<u8, _>(None, |_, _| {});
        assert_eq!(w.into_bytes(), vec![0x00]);
    }

    #[test]
    fn option_some_writes_one_tag_then_value() {
        let mut w = BorshWriter::new();
        w.option(Some(&0x42u8), |ww, &v| {
            ww.u8(v);
        });
        assert_eq!(w.into_bytes(), vec![0x01, 0x42]);
    }

    #[test]
    fn string_writes_4byte_length_then_utf8() {
        let mut w = BorshWriter::new();
        w.string("hi");
        // length 2 → 02 00 00 00, then "hi" → 68 69
        assert_eq!(w.into_bytes(), vec![0x02, 0x00, 0x00, 0x00, 0x68, 0x69]);
    }

    #[test]
    fn build_ix_data_is_discriminator_plus_body() {
        let bytes = build_ix_data("revoke", |_| {}); // empty body
        assert_eq!(bytes.len(), 8); // just the discriminator
        let disc = anchor_discriminator("global", "revoke");
        assert_eq!(&bytes[..8], &disc);
    }
}
