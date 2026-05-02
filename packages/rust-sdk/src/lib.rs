//! Settle SDK — Rust port (F5.3).
//!
//! WHAT IS PROVEN PARITY WITH TS+PYTHON (locked goldens):
//!   - `stable_json` — canonical JSON serialization
//!   - `compute_capability_hash_hex`:
//!     `a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b`
//!     for translate.demo.settle/POST/v1/translate
//!   - `kernel_commit` for `direct_send`:
//!     receipt_hash         = 095a40c24988392828639b5621bf2dbfbb597dc63ef57ef562930d0e5b133126
//!     reason_hash          = 320e5f7ee4bdfdeba756b3d1985962ee5e41f2bdeb315f8249e238ea71b5590a
//!     policy_snapshot_hash = 203bceb4b5d4af2624a79359818439c1a8895bacc9fc4fca70ffd8de59660d71
//!     purpose_hash         = ac9a1f2e6aad968b0da5a18309d916a7f69c2d6012f9ee123bf45d43663804dd
//!     context_hash         = 6bb849195e1214908da2ed25c9e007bf91cc7ae68cdee63115fa693fa51dfaa8
//!
//! WHAT'S NOW ALSO GOLDEN-LOCKED (full kernel parity):
//!   All 7 receipt kinds — direct_send, x402_spend, link_send,
//!   streaming_claim, escrow_release, escrow_dispute, refund — have
//!   golden tests in `kernel.rs::tests::parity_<kind>_golden`. Run
//!   `pnpm smoke:multikind` to regenerate the goldens after a
//!   canonical-schema change in TS.
//!
//! Three rules to keep parity tight (when fully ported):
//!   1. JSON serialization must be sorted-keys + no whitespace.
//!   2. Strings flow through NFC before hashing.
//!   3. BLAKE3-256, no nonce, no key.
//!
//! Reference implementations:
//!   packages/sdk/src/canonical.ts (TS — source of truth)
//!   packages/python-sdk/settle_sdk/__init__.py (Python — already parity)

pub mod borsh_writer;
pub mod canonical;
pub mod capability_hash;
pub mod ix_data;
pub mod kernel;
pub mod verify;

pub use canonical::stable_json;
pub use capability_hash::compute_capability_hash_hex;
pub use kernel::{kernel_commit, KernelCommitInput, KernelCommitOutput, KernelHashes};
pub use verify::{verify_receipt, VerifyInput, VerifyResult};

/// Crate version, kept in sync with Cargo.toml.
pub const SDK_VERSION: &str = env!("CARGO_PKG_VERSION");
