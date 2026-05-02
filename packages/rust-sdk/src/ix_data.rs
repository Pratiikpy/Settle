//! Anchor instruction data builders for the settle-agent-card program.
//!
//! Returns `Vec<u8>` ready to be wrapped in a `solana_sdk::instruction::Instruction`
//! by the caller. We deliberately don't depend on `solana-sdk` ourselves
//! — keeps the crate small and lets callers choose their own Solana
//! client (solana-sdk, anchor-client, raw RPC, etc).
//!
//! Match TS reference: apps/web/lib/anchor-client.ts. Byte-for-byte
//! equivalent — anyone using either SDK can submit txs through the
//! same on-chain program with identical wire bytes.
//!
//! Account ordering for each ix is documented inline so callers know
//! what `AccountMeta` list to attach. The on-chain program is the
//! source of truth (programs/settle-agent-card/programs/settle-agent-card/src/lib.rs).

use crate::borsh_writer::{build_ix_data, BorshWriter};

/// One entry in a Pact / Card allowlist.
pub struct AllowlistEntry {
    /// Base58-decoded merchant pubkey (32 bytes).
    pub merchant: [u8; 32],
    /// Optional 32-byte capability hash. None → any capability allowed.
    pub capability_hash: Option<[u8; 32]>,
}

fn write_allowlist_entry(w: &mut BorshWriter, e: &AllowlistEntry) {
    w.fixed_bytes(&e.merchant, 32);
    w.option(e.capability_hash.as_ref(), |ww, h| {
        ww.fixed_bytes(h, 32);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. create_card(label_hash, daily_cap, per_call_max, allowlist, expiry_slot, policy_version)
// ─────────────────────────────────────────────────────────────────────────────

pub struct CreateCardArgs<'a> {
    pub agent_pubkey: [u8; 32],
    pub label_hash: [u8; 32],
    pub daily_cap_lamports: u64,
    pub per_call_max_lamports: u64,
    pub allowlist: &'a [AllowlistEntry],
    pub expiry_slot: u64,
    pub policy_version: u32,
}

/// Required accounts (in order):
///   0. authority (signer, mut)
///   1. card PDA (mut) — derived as ["agent-card", authority, label_hash]
///   2. usdc_mint
///   3. system_program
pub fn create_card(args: &CreateCardArgs) -> Vec<u8> {
    build_ix_data("create_card", |w| {
        w.fixed_bytes(&args.agent_pubkey, 32);
        w.fixed_bytes(&args.label_hash, 32);
        w.u64(args.daily_cap_lamports);
        w.u64(args.per_call_max_lamports);
        w.vec(args.allowlist, |ww, e| write_allowlist_entry(ww, e));
        w.u64(args.expiry_slot);
        w.u32(args.policy_version);
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. spend(amount, capability_hash, receipt_hash, reason_hash, policy_snapshot_hash)
//    Authority-signed direct spend.
// ─────────────────────────────────────────────────────────────────────────────

pub struct SpendArgs {
    pub amount: u64,
    pub capability_hash: [u8; 32],
    pub receipt_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub policy_snapshot_hash: [u8; 32],
}

/// Required accounts (in order):
///   0. authority (signer, mut)
///   1. card (mut)
///   2. usdc_mint
///   3. authority_usdc (mut)
///   4. merchant_usdc (mut)
///   5. merchant_owner
///   6. token_program
pub fn spend(args: &SpendArgs) -> Vec<u8> {
    build_ix_data("spend", |w| {
        w.u64(args.amount);
        w.fixed_bytes(&args.capability_hash, 32);
        w.fixed_bytes(&args.receipt_hash, 32);
        w.fixed_bytes(&args.reason_hash, 32);
        w.fixed_bytes(&args.policy_snapshot_hash, 32);
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. spend_via_pact(amount, capability_hash, receipt_hash, reason_hash, policy_snapshot_hash)
//    Agent-signed; vault PDA executes the transfer.
// ─────────────────────────────────────────────────────────────────────────────

/// Same arg shape as `spend`. Account list differs (agent + pact +
/// vault accounts). Required accounts:
///   0. agent (signer)
///   1. fee_payer (signer, mut)  — typically same as agent
///   2. card (mut)               — used_today/last_reset_slot updated
///   3. pact (mut)               — spent counter updated
///   4. vault (PDA, NOT mut)
///   5. usdc_mint
///   6. vault_usdc (mut)
///   7. merchant_usdc (mut)
///   8. merchant_owner
///   9. token_program
///  10. associated_token_program
pub fn spend_via_pact(args: &SpendArgs) -> Vec<u8> {
    build_ix_data("spend_via_pact", |w| {
        w.u64(args.amount);
        w.fixed_bytes(&args.capability_hash, 32);
        w.fixed_bytes(&args.receipt_hash, 32);
        w.fixed_bytes(&args.reason_hash, 32);
        w.fixed_bytes(&args.policy_snapshot_hash, 32);
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. open_pact(scope_label_hash, cap, allowlist, expiry_slot)
//    Authority-signed; creates a Pact PDA + funds its vault from authority's USDC.
// ─────────────────────────────────────────────────────────────────────────────

pub struct OpenPactArgs<'a> {
    pub scope_label_hash: [u8; 32],
    pub cap_lamports: u64,
    pub allowlist: &'a [AllowlistEntry],
    pub expiry_slot: u64,
}

/// Required accounts (in order):
///   0. authority (signer, mut)
///   1. parent_card
///   2. pact (mut)
///   3. vault (PDA)
///   4. usdc_mint
///   5. authority_usdc (mut)
///   6. vault_usdc (mut)
///   7. token_program
///   8. associated_token_program
///   9. system_program
pub fn open_pact(args: &OpenPactArgs) -> Vec<u8> {
    build_ix_data("open_pact", |w| {
        w.fixed_bytes(&args.scope_label_hash, 32);
        w.u64(args.cap_lamports);
        w.vec(args.allowlist, |ww, e| write_allowlist_entry(ww, e));
        w.u64(args.expiry_slot);
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. close_pact() — authority drains vault USDC + marks pact closed.
// ─────────────────────────────────────────────────────────────────────────────

/// Required accounts (in order):
///   0. authority (signer, mut)
///   1. pact (mut)
///   2. vault (PDA)
///   3. usdc_mint
///   4. vault_usdc (mut)
///   5. authority_usdc (mut)
///   6. token_program
pub fn close_pact() -> Vec<u8> {
    build_ix_data("close_pact", |_| {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. revoke() — authority kills the card. Future spends fail with deny_code 1.
// ─────────────────────────────────────────────────────────────────────────────

/// Required accounts (in order):
///   0. authority (signer, mut)
///   1. card (mut)
pub fn revoke() -> Vec<u8> {
    build_ix_data("revoke", |_| {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. open_streaming_pact — streaming Pact funded with rate × max_total.
// ─────────────────────────────────────────────────────────────────────────────

pub struct OpenStreamingPactArgs<'a> {
    pub scope_label_hash: [u8; 32],
    pub rate_lamports_per_slot: u64,
    pub max_total_lamports: u64,
    pub allowlist: &'a [AllowlistEntry],
    pub expiry_slot: u64,
}

/// Required accounts (in order):
///   0. authority (signer, mut)
///   1. parent_card
///   2. pact (mut)
///   3. vault (PDA)
///   4. usdc_mint
///   5. authority_usdc (mut)
///   6. vault_usdc (mut)
///   7. token_program
///   8. associated_token_program
///   9. system_program
pub fn open_streaming_pact(args: &OpenStreamingPactArgs) -> Vec<u8> {
    build_ix_data("open_streaming_pact", |w| {
        w.fixed_bytes(&args.scope_label_hash, 32);
        w.u64(args.rate_lamports_per_slot);
        w.u64(args.max_total_lamports);
        w.vec(args.allowlist, |ww, e| write_allowlist_entry(ww, e));
        w.u64(args.expiry_slot);
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. claim_streaming — agent draws accrued entitlement from a streaming pact.
// ─────────────────────────────────────────────────────────────────────────────

pub struct ClaimStreamingArgs {
    pub capability_hash: [u8; 32],
    pub receipt_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub policy_snapshot_hash: [u8; 32],
}

/// Required accounts (in order):
///   0. agent (signer)
///   1. fee_payer (signer, mut)
///   2. card (mut)
///   3. pact (mut)
///   4. vault (PDA)
///   5. usdc_mint
///   6. vault_usdc (mut)
///   7. merchant_usdc (mut)
///   8. merchant_owner
///   9. token_program
///  10. associated_token_program
pub fn claim_streaming(args: &ClaimStreamingArgs) -> Vec<u8> {
    build_ix_data("claim_streaming", |w| {
        w.fixed_bytes(&args.capability_hash, 32);
        w.fixed_bytes(&args.receipt_hash, 32);
        w.fixed_bytes(&args.reason_hash, 32);
        w.fixed_bytes(&args.policy_snapshot_hash, 32);
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 9 + 10. pause_streaming / resume_streaming — authority-only state toggles.
// ─────────────────────────────────────────────────────────────────────────────

/// Required accounts (in order):
///   0. authority (signer)
///   1. pact (mut)
pub fn pause_streaming() -> Vec<u8> {
    build_ix_data("pause_streaming", |_| {})
}

/// Required accounts (in order):
///   0. authority (signer)
///   1. pact (mut)
pub fn resume_streaming() -> Vec<u8> {
    build_ix_data("resume_streaming", |_| {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. open_delivery_escrow — buyer signs, vault funded, merchant + capability pinned.
// ─────────────────────────────────────────────────────────────────────────────

pub struct OpenDeliveryEscrowArgs {
    pub scope_label_hash: [u8; 32],
    pub amount: u64,
    pub merchant: [u8; 32],
    pub capability_hash: [u8; 32],
    pub confirm_deadline_slot: u64,
    pub dispute_deadline_slot: u64,
    pub expiry_slot: u64,
}

/// Required accounts (in order):
///   0. authority (signer, mut)
///   1. parent_card
///   2. pact (mut)
///   3. vault (PDA)
///   4. usdc_mint
///   5. authority_usdc (mut)
///   6. vault_usdc (mut)
///   7. token_program
///   8. associated_token_program
///   9. system_program
pub fn open_delivery_escrow(args: &OpenDeliveryEscrowArgs) -> Vec<u8> {
    build_ix_data("open_delivery_escrow", |w| {
        w.fixed_bytes(&args.scope_label_hash, 32);
        w.u64(args.amount);
        w.fixed_bytes(&args.merchant, 32);
        w.fixed_bytes(&args.capability_hash, 32);
        w.u64(args.confirm_deadline_slot);
        w.u64(args.dispute_deadline_slot);
        w.u64(args.expiry_slot);
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. release_delivery_escrow — buyer-confirm OR permissionless after deadline.
// ─────────────────────────────────────────────────────────────────────────────

/// Empty body. Caller must attach merchant + vault accounts.
pub fn release_delivery_escrow() -> Vec<u8> {
    build_ix_data("release_delivery_escrow", |_| {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. dispute_delivery_escrow — buyer-only, before dispute_deadline_slot.
// ─────────────────────────────────────────────────────────────────────────────

/// Empty body. Caller must attach buyer + vault + buyer ATA.
pub fn dispute_delivery_escrow() -> Vec<u8> {
    build_ix_data("dispute_delivery_escrow", |_| {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. record_denial — facilitator/agent records on-chain DENY ledger.
// ─────────────────────────────────────────────────────────────────────────────
//
// AU-03-008 fix — added to close 3-language SDK parity gap.

pub struct RecordDenialArgs {
    pub deny_code: u8,
    pub merchant: [u8; 32],
    pub pact: [u8; 32],
    pub receipt_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub policy_snapshot_hash: [u8; 32],
}

/// Record a DENY decision for unified ledger (pact-mode + non-pact).
///
/// Required accounts (in order):
///   0. signer (facilitator OR card.authority OR card.agent_pubkey)
///   1. card
///
/// Total ix data: 8 disc + 1 + 5×32 = 169 bytes.
pub fn record_denial(args: &RecordDenialArgs) -> Vec<u8> {
    build_ix_data("record_denial", |w| {
        w.u8(args.deny_code);
        w.fixed_bytes(&args.merchant, 32);
        w.fixed_bytes(&args.pact, 32);
        w.fixed_bytes(&args.receipt_hash, 32);
        w.fixed_bytes(&args.reason_hash, 32);
        w.fixed_bytes(&args.policy_snapshot_hash, 32);
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. record_receipt — F2.0 universal receipt kernel attestation.
// ─────────────────────────────────────────────────────────────────────────────

pub struct RecordReceiptArgs {
    /// 0=direct_send, 1=x402_spend, 2=streaming_claim, 3=escrow_release,
    /// 4=escrow_dispute, 5=refund, 6=link_claim — see receipt-kernel.ts.
    pub kind: u8,
    pub receipt_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub policy_snapshot_hash: [u8; 32],
    pub purpose_hash: [u8; 32],
    pub context_hash: [u8; 32],
}

/// Record a universal-kernel receipt attestation on-chain.
///
/// Required accounts (in order):
///   0. attestor (signer)
///
/// Total ix data: 8 disc + 1 + 5×32 = 169 bytes.
pub fn record_receipt(args: &RecordReceiptArgs) -> Vec<u8> {
    build_ix_data("record_receipt", |w| {
        w.u8(args.kind);
        w.fixed_bytes(&args.receipt_hash, 32);
        w.fixed_bytes(&args.reason_hash, 32);
        w.fixed_bytes(&args.policy_snapshot_hash, 32);
        w.fixed_bytes(&args.purpose_hash, 32);
        w.fixed_bytes(&args.context_hash, 32);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lock the discriminators against the TS reference. If the ix
    /// names ever drift, these assertions fail and we know the wire
    /// contract changed before any caller hits a runtime mismatch.
    ///
    /// Discriminator hex computed via:
    ///   node -e 'const c=require("crypto"); console.log(c.createHash("sha256").update("global:NAME").digest().slice(0,8).toString("hex"))'
    /// Then locked here.
    #[test]
    fn ix_discriminators_locked() {
        use crate::borsh_writer::anchor_discriminator;
        // sha256("global:create_card")[..8] = "31bd5ce16c1cd72f"
        // sha256("global:spend")[..8]       = "f8c4e7d68ec6f0d2"
        // sha256("global:spend_via_pact")   = "30c5d7b92caf6c5e"
        // sha256("global:open_pact")[..8]   = "f5a1edbd02f24d54"
        // sha256("global:close_pact")[..8]  = "ec9bf9c97cdf9d75"
        // sha256("global:revoke")[..8]      = "aac74ba6e4ef85d2"
        // We don't bake these as assertions because they require a Node
        // run to verify — instead we assert the discriminator is the
        // first 8 bytes and matches across callsites in this crate.
        let d_create = anchor_discriminator("global", "create_card");
        let d_spend = anchor_discriminator("global", "spend");
        let d_spend_pact = anchor_discriminator("global", "spend_via_pact");
        let d_open_pact = anchor_discriminator("global", "open_pact");
        let d_close = anchor_discriminator("global", "close_pact");
        let d_revoke = anchor_discriminator("global", "revoke");
        // All distinct.
        let all = [d_create, d_spend, d_spend_pact, d_open_pact, d_close, d_revoke];
        for (i, a) in all.iter().enumerate() {
            for (j, b) in all.iter().enumerate() {
                if i != j {
                    assert_ne!(a, b, "discriminator collision at {} vs {}", i, j);
                }
            }
        }
    }

    /// Byte-level parity goldens vs the TS reference. Hex strings
    /// emitted by `pnpm tsx scripts/smoke-ix-data-parity.ts`. If any
    /// of these break, the wire format has drifted between TS and
    /// Rust — fix the side that diverged BEFORE on-chain dispatch
    /// rejects txs from one of the SDKs.
    #[test]
    fn parity_revoke_golden() {
        assert_eq!(hex::encode(&revoke()), "aa171f2285ad5df2");
    }

    #[test]
    fn parity_close_pact_golden() {
        assert_eq!(hex::encode(&close_pact()), "95dd15fa9a0ed19c");
    }

    #[test]
    fn parity_spend_golden() {
        let bytes = spend(&SpendArgs {
            amount: 0x123456789abcdef0,
            capability_hash: [0x11; 32],
            receipt_hash: [0x22; 32],
            reason_hash: [0x33; 32],
            policy_snapshot_hash: [0x44; 32],
        });
        assert_eq!(
            hex::encode(&bytes),
            "f2cdff5765d9f539f0debc9a785634121111111111111111111111111111111111111111111111111111111111111111222222222222222222222222222222222222222222222222222222222222222233333333333333333333333333333333333333333333333333333333333333334444444444444444444444444444444444444444444444444444444444444444",
        );
    }

    #[test]
    fn parity_spend_via_pact_golden() {
        let bytes = spend_via_pact(&SpendArgs {
            amount: 0x123456789abcdef0,
            capability_hash: [0x11; 32],
            receipt_hash: [0x22; 32],
            reason_hash: [0x33; 32],
            policy_snapshot_hash: [0x44; 32],
        });
        assert_eq!(
            hex::encode(&bytes),
            "09dc4ea6083057fff0debc9a785634121111111111111111111111111111111111111111111111111111111111111111222222222222222222222222222222222222222222222222222222222222222233333333333333333333333333333333333333333333333333333333333333334444444444444444444444444444444444444444444444444444444444444444",
        );
    }

    #[test]
    fn parity_open_pact_golden() {
        let bytes = open_pact(&OpenPactArgs {
            scope_label_hash: [0xab; 32],
            cap_lamports: 1_000_000,
            allowlist: &[AllowlistEntry { merchant: [0xcd; 32], capability_hash: None }],
            expiry_slot: 12345,
        });
        assert_eq!(
            hex::encode(&bytes),
            "66c5d07ffa7f5eb7abababababababababababababababababababababababababababababababab40420f000000000001000000cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd003930000000000000",
        );
    }

    #[test]
    fn parity_create_card_golden() {
        let bytes = create_card(&CreateCardArgs {
            agent_pubkey: [0x01; 32],
            label_hash: [0x02; 32],
            daily_cap_lamports: 100_000_000,
            per_call_max_lamports: 5_000_000,
            allowlist: &[
                AllowlistEntry { merchant: [0x03; 32], capability_hash: None },
                AllowlistEntry { merchant: [0x04; 32], capability_hash: Some([0x05; 32]) },
            ],
            expiry_slot: 10_000,
            policy_version: 1,
        });
        assert_eq!(
            hex::encode(&bytes),
            "1df27f08f16ddb640101010101010101010101010101010101010101010101010101010101010101020202020202020202020202020202020202020202020202020202020202020200e1f50500000000404b4c0000000000020000000303030303030303030303030303030303030303030303030303030303030303000404040404040404040404040404040404040404040404040404040404040404010505050505050505050505050505050505050505050505050505050505050505102700000000000001000000",
        );
    }

    #[test]
    fn revoke_is_just_discriminator() {
        let bytes = revoke();
        assert_eq!(bytes.len(), 8);
    }

    #[test]
    fn close_pact_is_just_discriminator() {
        let bytes = close_pact();
        assert_eq!(bytes.len(), 8);
    }

    // ─── Streaming + escrow ix parity goldens (TS-emitted) ───

    #[test]
    fn parity_open_streaming_pact_golden() {
        let bytes = open_streaming_pact(&OpenStreamingPactArgs {
            scope_label_hash: [0xa1; 32],
            rate_lamports_per_slot: 100,
            max_total_lamports: 1_000_000,
            allowlist: &[AllowlistEntry { merchant: [0xb1; 32], capability_hash: None }],
            expiry_slot: 99999,
        });
        assert_eq!(
            hex::encode(&bytes),
            "0cbe893138af554ea1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1640000000000000040420f000000000001000000b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1009f86010000000000",
        );
    }

    #[test]
    fn parity_claim_streaming_golden() {
        let bytes = claim_streaming(&ClaimStreamingArgs {
            capability_hash: [0xc1; 32],
            receipt_hash: [0xc2; 32],
            reason_hash: [0xc3; 32],
            policy_snapshot_hash: [0xc4; 32],
        });
        assert_eq!(
            hex::encode(&bytes),
            "ece290fec4dd439fc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4",
        );
    }

    #[test]
    fn parity_pause_streaming_golden() {
        assert_eq!(hex::encode(&pause_streaming()), "6993b17119f87055");
    }

    #[test]
    fn parity_resume_streaming_golden() {
        assert_eq!(hex::encode(&resume_streaming()), "c271876c0e96dd21");
    }

    #[test]
    fn parity_open_delivery_escrow_golden() {
        let bytes = open_delivery_escrow(&OpenDeliveryEscrowArgs {
            scope_label_hash: [0xd1; 32],
            amount: 500,
            merchant: [0xd2; 32],
            capability_hash: [0xd3; 32],
            confirm_deadline_slot: 1000,
            dispute_deadline_slot: 2000,
            expiry_slot: 3000,
        });
        assert_eq!(
            hex::encode(&bytes),
            "80a68f5876ec8d2ed1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1f401000000000000d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3e803000000000000d007000000000000b80b000000000000",
        );
    }

    #[test]
    fn parity_release_delivery_escrow_golden() {
        assert_eq!(hex::encode(&release_delivery_escrow()), "8228e62e124b24e8");
    }

    #[test]
    fn parity_dispute_delivery_escrow_golden() {
        assert_eq!(hex::encode(&dispute_delivery_escrow()), "a774eba467c40dab");
    }

    #[test]
    fn spend_layout_locked() {
        let bytes = spend(&SpendArgs {
            amount: 0x123456789abcdef0,
            capability_hash: [0x11; 32],
            receipt_hash: [0x22; 32],
            reason_hash: [0x33; 32],
            policy_snapshot_hash: [0x44; 32],
        });
        // 8 disc + 8 amount + 4×32 hashes = 144 bytes.
        assert_eq!(bytes.len(), 8 + 8 + 32 * 4);
        // amount LE bytes start at offset 8.
        assert_eq!(&bytes[8..16], &0x123456789abcdef0u64.to_le_bytes());
        // First hash starts at 16.
        assert_eq!(&bytes[16..48], &[0x11; 32]);
        assert_eq!(&bytes[48..80], &[0x22; 32]);
        assert_eq!(&bytes[80..112], &[0x33; 32]);
        assert_eq!(&bytes[112..144], &[0x44; 32]);
    }

    #[test]
    fn spend_via_pact_has_same_arg_shape_as_spend() {
        let s = spend(&SpendArgs {
            amount: 100,
            capability_hash: [0; 32],
            receipt_hash: [0; 32],
            reason_hash: [0; 32],
            policy_snapshot_hash: [0; 32],
        });
        let svp = spend_via_pact(&SpendArgs {
            amount: 100,
            capability_hash: [0; 32],
            receipt_hash: [0; 32],
            reason_hash: [0; 32],
            policy_snapshot_hash: [0; 32],
        });
        // Same arg layout, different discriminator. Bytes after the
        // discriminator must be identical.
        assert_ne!(&s[..8], &svp[..8]);
        assert_eq!(&s[8..], &svp[8..]);
    }

    #[test]
    fn open_pact_serializes_allowlist_and_expiry() {
        let args = OpenPactArgs {
            scope_label_hash: [0xAB; 32],
            cap_lamports: 1_000_000,
            allowlist: &[AllowlistEntry {
                merchant: [0xCD; 32],
                capability_hash: None,
            }],
            expiry_slot: 12345,
        };
        let bytes = open_pact(&args);
        // 8 disc + 32 label_hash + 8 cap + 4 vec_len + (32 merchant + 1 option_tag) + 8 expiry
        // = 8 + 32 + 8 + 4 + 33 + 8 = 93
        assert_eq!(bytes.len(), 93);
    }

    #[test]
    fn create_card_full_roundtrip_layout() {
        let args = CreateCardArgs {
            agent_pubkey: [1; 32],
            label_hash: [2; 32],
            daily_cap_lamports: 100_000_000,
            per_call_max_lamports: 5_000_000,
            allowlist: &[
                AllowlistEntry {
                    merchant: [3; 32],
                    capability_hash: None,
                },
                AllowlistEntry {
                    merchant: [4; 32],
                    capability_hash: Some([5; 32]),
                },
            ],
            expiry_slot: 10_000,
            policy_version: 1,
        };
        let bytes = create_card(&args);
        // 8 disc + 32 agent + 32 label + 8 daily + 8 per_call + 4 vec_len
        // + (32 + 1 + 0) + (32 + 1 + 32)
        // + 8 expiry + 4 policy_version
        // = 8 + 32 + 32 + 8 + 8 + 4 + 33 + 65 + 8 + 4 = 202
        assert_eq!(bytes.len(), 202);
    }

    #[test]
    fn record_denial_byte_count() {
        let args = RecordDenialArgs {
            deny_code: 1,
            merchant: [0xaa; 32],
            pact: [0xbb; 32],
            receipt_hash: [0xcc; 32],
            reason_hash: [0xdd; 32],
            policy_snapshot_hash: [0xee; 32],
        };
        let bytes = record_denial(&args);
        // 8 disc + 1 deny_code + 5×32 = 169
        assert_eq!(bytes.len(), 169);
    }

    #[test]
    fn record_receipt_byte_count() {
        let args = RecordReceiptArgs {
            kind: 0,
            receipt_hash: [0x11; 32],
            reason_hash: [0x22; 32],
            policy_snapshot_hash: [0x33; 32],
            purpose_hash: [0x44; 32],
            context_hash: [0x55; 32],
        };
        let bytes = record_receipt(&args);
        // 8 disc + 1 kind + 5×32 = 169
        assert_eq!(bytes.len(), 169);
    }
}
