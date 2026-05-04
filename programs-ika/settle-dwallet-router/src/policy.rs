// Copyright (c) Settle.
// SPDX-License-Identifier: MIT
//
// Pure policy-gate logic for `request_crosschain_sign`.
//
// Lives in its own module so unit tests can hit it directly without spinning
// up a Solana runtime. The on-chain handler in `lib.rs` reads its inputs from
// `CrosschainCard` + the ix params, then calls `evaluate_policy` and acts on
// the result.

use anchor_lang::prelude::*;

use crate::errors::CrosschainDenyCode;
use crate::state::{CrosschainCard, CC_CAP_WINDOW_SLOTS};

/// Inputs the policy gate cares about from a `request_crosschain_sign` ix.
///
/// We accept this as a separate struct (instead of `RequestCrosschainSignParams`)
/// so the unit tests don't have to construct the full ix params shape with all
/// of its receipt-hash fields.
pub struct PolicyInputs {
    pub amount_minor: u128,
    pub chain_namespace: [u8; 16],
    pub chain_reference: [u8; 32],
    pub recipient_kind: u8,
    pub recipient: [u8; 32],
    pub asset_kind: u8,
    pub asset: [u8; 32],
    pub capability_hash: [u8; 32],
}

/// Evaluate the policy gate. Returns 0 on ALLOW, otherwise the
/// `CrosschainDenyCode` u8 for the first-hit failure.
///
/// Priority order (matches existing settle-agent-card semantics so users
/// get a single mental model across both card types):
///   1. Revoked
///   2. Expired
///   3. OverCap (per_call)
///   4. OverCap (daily, with reset window applied)
///   5. OffAllowlist
///   6. CapabilityNotPinned
pub fn evaluate_policy(card: &CrosschainCard, params: &PolicyInputs, current_slot: u64) -> u8 {
    if card.revoked {
        return CrosschainDenyCode::Revoked as u8;
    }
    if card.expiry_slot != 0 && current_slot >= card.expiry_slot {
        return CrosschainDenyCode::Expired as u8;
    }
    if params.amount_minor > card.per_call_max_minor {
        return CrosschainDenyCode::OverCap as u8;
    }

    let effective_used = if current_slot.saturating_sub(card.last_reset_slot) >= CC_CAP_WINDOW_SLOTS {
        0u128
    } else {
        card.used_today_minor
    };
    let projected = effective_used.saturating_add(params.amount_minor);
    if projected > card.daily_cap_minor {
        return CrosschainDenyCode::OverCap as u8;
    }

    let mut matched: Option<&crate::state::CrosschainAllowlistEntry> = None;
    for entry in card.allowlist.iter() {
        if entry.chain_namespace == params.chain_namespace
            && entry.chain_reference == params.chain_reference
            && entry.recipient_kind == params.recipient_kind
            && entry.recipient == params.recipient
            && entry.asset_kind == params.asset_kind
            && entry.asset == params.asset
        {
            matched = Some(entry);
            break;
        }
    }
    let entry = match matched {
        Some(e) => e,
        None => return CrosschainDenyCode::OffAllowlist as u8,
    };

    if entry.capability_hash != [0u8; 32] && entry.capability_hash != params.capability_hash {
        return CrosschainDenyCode::CapabilityNotPinned as u8;
    }

    0 // ALLOW
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — pure policy logic, no Solana runtime needed.
// Run with: cargo test --lib -p settle-dwallet-router
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::CrosschainAllowlistEntry;

    // ── Test fixtures ──

    const SEPOLIA_NAMESPACE: [u8; 16] = *b"eip155\0\0\0\0\0\0\0\0\0\0";
    const RECIPIENT_A: [u8; 32] = [0xAA; 32];
    const RECIPIENT_B: [u8; 32] = [0xBB; 32];
    const NATIVE_ASSET: [u8; 32] = [0u8; 32];
    const CAPABILITY_HASH_X: [u8; 32] = [0xCC; 32];
    const CAPABILITY_HASH_Y: [u8; 32] = [0xDD; 32];

    fn sepolia_ref() -> [u8; 32] {
        let mut r = [0u8; 32];
        let bytes = b"11155111";
        r[..bytes.len()].copy_from_slice(bytes);
        r
    }

    fn fixture_card(per_call: u128, daily: u128, used: u128) -> CrosschainCard {
        CrosschainCard {
            authority: Pubkey::new_unique(),
            agent_pubkey: Pubkey::new_unique(),
            label_hash: [1u8; 32],
            dwallet: Pubkey::new_unique(),
            gas_deposit: Pubkey::new_unique(),
            per_call_max_minor: per_call,
            daily_cap_minor: daily,
            used_today_minor: used,
            last_reset_slot: 1_000,
            allowlist: vec![CrosschainAllowlistEntry {
                chain_namespace: SEPOLIA_NAMESPACE,
                chain_reference: sepolia_ref(),
                recipient_kind: 1,
                recipient: RECIPIENT_A,
                asset_kind: 0,
                asset: NATIVE_ASSET,
                capability_hash: [0u8; 32], // unpinned by default
            }],
            expiry_slot: 0, // never expires
            revoked: false,
            policy_version: 1,
            created_at: 0,
            bump: 255,
        }
    }

    fn fixture_inputs() -> PolicyInputs {
        PolicyInputs {
            amount_minor: 1_000,
            chain_namespace: SEPOLIA_NAMESPACE,
            chain_reference: sepolia_ref(),
            recipient_kind: 1,
            recipient: RECIPIENT_A,
            asset_kind: 0,
            asset: NATIVE_ASSET,
            capability_hash: [0u8; 32],
        }
    }

    // ── ALLOW path ──

    #[test]
    fn allow_when_all_pass() {
        let card = fixture_card(10_000, 50_000, 5_000);
        let p = fixture_inputs();
        assert_eq!(evaluate_policy(&card, &p, 1_500), 0);
    }

    #[test]
    fn allow_after_window_reset_zeroes_used_today() {
        // Card was at the cap yesterday. Today (after CC_CAP_WINDOW_SLOTS),
        // used_today_minor effectively resets to 0, so a new spend up to the
        // daily cap is allowed.
        let mut card = fixture_card(10_000, 50_000, 50_000);
        card.last_reset_slot = 100;
        let p = fixture_inputs();
        let current = 100 + CC_CAP_WINDOW_SLOTS + 1;
        assert_eq!(evaluate_policy(&card, &p, current), 0);
    }

    #[test]
    fn allow_when_capability_matches_pinned_entry() {
        let mut card = fixture_card(10_000, 50_000, 0);
        card.allowlist[0].capability_hash = CAPABILITY_HASH_X;
        let mut p = fixture_inputs();
        p.capability_hash = CAPABILITY_HASH_X;
        assert_eq!(evaluate_policy(&card, &p, 1_500), 0);
    }

    // ── DENY paths (one per code) ──

    #[test]
    fn deny_revoked() {
        let mut card = fixture_card(10_000, 50_000, 0);
        card.revoked = true;
        let p = fixture_inputs();
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::Revoked as u8
        );
    }

    #[test]
    fn deny_expired() {
        let mut card = fixture_card(10_000, 50_000, 0);
        card.expiry_slot = 1_400; // before current_slot=1_500
        let p = fixture_inputs();
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::Expired as u8
        );
    }

    #[test]
    fn deny_over_per_call() {
        let card = fixture_card(500, 50_000, 0);
        let mut p = fixture_inputs();
        p.amount_minor = 1_000; // > per_call_max=500
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::OverCap as u8
        );
    }

    #[test]
    fn deny_over_daily() {
        // used_today=49_500, amount=1_000, daily_cap=50_000 => projected=50_500 > cap
        let card = fixture_card(10_000, 50_000, 49_500);
        let p = fixture_inputs();
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::OverCap as u8
        );
    }

    #[test]
    fn deny_off_allowlist_chain() {
        let card = fixture_card(10_000, 50_000, 0);
        let mut p = fixture_inputs();
        p.chain_namespace = *b"bip122\0\0\0\0\0\0\0\0\0\0"; // wrong chain
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::OffAllowlist as u8
        );
    }

    #[test]
    fn deny_off_allowlist_recipient() {
        let card = fixture_card(10_000, 50_000, 0);
        let mut p = fixture_inputs();
        p.recipient = RECIPIENT_B; // wrong recipient
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::OffAllowlist as u8
        );
    }

    #[test]
    fn deny_capability_not_pinned() {
        // Allowlist entry pins X; request carries Y.
        let mut card = fixture_card(10_000, 50_000, 0);
        card.allowlist[0].capability_hash = CAPABILITY_HASH_X;
        let mut p = fixture_inputs();
        p.capability_hash = CAPABILITY_HASH_Y;
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::CapabilityNotPinned as u8
        );
    }

    #[test]
    fn deny_capability_required_when_request_omits_it() {
        // Allowlist entry pins X; request carries the unpinned (zero) hash.
        // Same as above semantically, just makes the "missing" case explicit.
        let mut card = fixture_card(10_000, 50_000, 0);
        card.allowlist[0].capability_hash = CAPABILITY_HASH_X;
        let p = fixture_inputs(); // capability_hash = [0u8; 32]
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::CapabilityNotPinned as u8
        );
    }

    // ── Priority order — first-hit deny code wins ──

    #[test]
    fn priority_revoked_beats_other_failures() {
        // Card is revoked AND expired AND over cap AND off allowlist. We must
        // see Revoked, not any of the later codes.
        let mut card = fixture_card(500, 1_000, 0);
        card.revoked = true;
        card.expiry_slot = 1_000;
        let mut p = fixture_inputs();
        p.amount_minor = 100_000;
        p.recipient = RECIPIENT_B;
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::Revoked as u8
        );
    }

    #[test]
    fn priority_expired_beats_overcap_and_allowlist() {
        let mut card = fixture_card(500, 1_000, 0);
        card.expiry_slot = 1_000;
        let mut p = fixture_inputs();
        p.amount_minor = 100_000;
        p.recipient = RECIPIENT_B;
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::Expired as u8
        );
    }

    #[test]
    fn priority_overcap_per_call_beats_daily_and_allowlist() {
        let card = fixture_card(500, 50_000, 0);
        let mut p = fixture_inputs();
        p.amount_minor = 100_000; // > per_call_max
        p.recipient = RECIPIENT_B; // also off allowlist
        assert_eq!(
            evaluate_policy(&card, &p, 1_500),
            CrosschainDenyCode::OverCap as u8
        );
    }
}
