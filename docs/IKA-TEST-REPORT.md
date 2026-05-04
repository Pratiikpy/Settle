# IKA-TEST-REPORT.md — Settle x Ika sidetrack test evidence

> **Rule of this document:** every claim here must be reproducible. If it is
> not green in this report, it is not green in the README, the demo, or the
> submission form. No blended language: every row says exactly what was real,
> what was mocked, and what environment was used.

This file is updated *as Phase B–F complete*, never retroactively. A row that
says "PENDING" is allowed; a row that quietly disappears is not.

Last updated: **Phase A complete; B–F PENDING**.

---

## 1. Test matrix overview

| # | Layer | Tool | Counts | Status |
|---|---|---|---|---|
| 1 | On-chain (router) | `solana-program-test` via `anchor test` | 12 specs (6 happy + 6 deny) | **PENDING — Phase B** |
| 2 | SDK canonical hashing | Vitest in `@settle/sdk` | 5 specs | **PENDING — Phase C** |
| 3 | API contracts | Vitest in `apps/web` | 4 specs | **PENDING — Phase C** |
| 4 | Playwright UI | `apps/web` Playwright | 8 specs | **PENDING — Phase F** |
| 5 | Real devnet ALLOW path | `scripts/ika-roundtrip.ts --allow` | 1 run | **PENDING — Phase F** |
| 6 | Real devnet DENY path | `scripts/ika-roundtrip.ts --deny` | 1 run | **PENDING — Phase F** |
| 7 | 577-spec gate (existing) | `pnpm --filter web playwright test` | 577 specs | **GREEN as of pass 75** |

A submission is gated on rows 1–7 all green. Rows 5 and 6 must run against
the real Ika gRPC service unless the fallback path (see section 5 below) is
used and labelled.

---

## 2. What is real, what is mocked, by component

| Component | Real | Mocked | Why mocked |
|---|---|---|---|
| Solana program logic | Real (deployed to devnet) | — | — |
| Policy gate (cap, allowlist, expiry, revoke) | Real | — | — |
| Hash chain emission | Real | — | — |
| Ika DKG roundtrip | Real (via gRPC to pre-alpha-dev-1.ika.ika-network.net) | — | — |
| Ika signing | Real (CPI executes; signature returned) | The signer itself is a single mock NOA at pre-alpha; Ika team will distribute MPC at Alpha 1. **This is acknowledged in product UI and README.** |
| Sepolia tx broadcast | Real | — | — |
| Etherscan explorer link | Real | — | — |
| Receipt rendering | Real | — | — |

**Important honesty note:** "real Ika signing" at pre-alpha means the on-chain
CPI flow is real and the signature material is produced by the Ika network's
NOA service. The cryptographic security model differs from production
(distributed MPC) because the network operates a single mock signer in
pre-alpha. The architectural integration is real.

---

## 3. Detailed results (filled in as phases complete)

### 3.1 On-chain router tests (Phase B)

| Spec | Description | Result | Notes |
|---|---|---|---|
| `init_card_happy_path` | init produces card with all defaults | PENDING | |
| `attach_dwallet_authority_happy_path` | CPI transfer_ownership succeeds | PENDING | |
| `request_sign_allow_happy_path` | policy passes; CPI approve_message executes | PENDING | |
| `daily_cap_resets_after_window` | sign after `last_reset + 220_000` slots zeroes used_today | PENDING | |
| `capability_hash_pin_match` | sign succeeds when pin matches | PENDING | |
| `revoke_then_freeze_happy_path` | revoked card flips state; subsequent sign fails | PENDING | |
| `deny_revoked` | revoked card → DenyCode::Revoked | PENDING | |
| `deny_over_per_call` | amount > per_call_max → DenyCode::OverCap | PENDING | |
| `deny_over_daily` | (used + amount) > daily_cap → DenyCode::OverCap | PENDING | |
| `deny_off_allowlist_chain` | wrong chain → DenyCode::OffAllowlist | PENDING | |
| `deny_off_allowlist_recipient` | wrong recipient → DenyCode::OffAllowlist | PENDING | |
| `deny_expired` | now > expiry_slot → DenyCode::Expired | PENDING | |

### 3.2 SDK canonical hashing (Phase C)

| Spec | Description | Result |
|---|---|---|
| `crosschain_spend_canonical_hash_stable` | Same input -> same hash on different runs | PENDING |
| `crosschain_spend_caip2_validation` | Invalid CAIP-2 string is rejected | PENDING |
| `crosschain_spend_caip10_validation` | Invalid CAIP-10 string is rejected | PENDING |
| `amount_minor_decimal_string_only` | Non-integer amount rejected | PENDING |
| `policy_snapshot_includes_chain_fields` | Hash differs when chain changes | PENDING |

### 3.3 API contracts (Phase C)

| Spec | Description | Result |
|---|---|---|
| `GET /api/receipts/:id returns crosschain fields` | Returns target_chain, amount_minor, etc. for crosschain_spend rows | PENDING |
| `GET /api/crosschain/cards lists by pubkey` | Returns rows for the wallet's cards | PENDING |
| `POST /api/crosschain/sign surfaces gRPC errors` | gRPC failure returns 502 with useful payload | PENDING |
| `DENY receipts have null target_tx_hash` | Schema enforces no Etherscan link on deny | PENDING |

### 3.4 Playwright UI (Phase F)

| Spec | Description | Result |
|---|---|---|
| `start-agent-crosschain-form-validation` | invalid 0x address rejected | PENDING |
| `start-agent-crosschain-zero-cap-rejected` | zero per_call_max rejected | PENDING |
| `start-agent-crosschain-expired-rejected` | expiry in the past rejected | PENDING |
| `start-agent-crosschain-dkg-loading` | DKG state appears and resolves | PENDING |
| `cards-crosschain-detail-renders` | card detail page populated | PENDING |
| `revoke-flips-status` | revoke button changes status pill | PENDING |
| `watch-crosschain-allow-path` | scripted ALLOW demo completes | PENDING |
| `watch-crosschain-deny-path` | scripted DENY demo shows deny banner | PENDING |

### 3.5 Real devnet roundtrip (Phase F)

| Run | Command | Result | Solana receipt | Sepolia tx hash | Notes |
|---|---|---|---|---|---|
| ALLOW | `pnpm tsx scripts/ika-roundtrip.ts --allow` | PENDING | — | — | — |
| DENY | `pnpm tsx scripts/ika-roundtrip.ts --deny` | PENDING | — | — | No tx hash expected (gate denied) |

### 3.6 Existing 577-spec gate

Last verified: pass 75 (commit `f6a1af6`) — **577/577 green in 7.4m**. To
reverify after Ika changes: `pnpm --filter web playwright test`.

---

## 4. Known gaps (declared, not hidden)

| Gap | Impact | Plan |
|---|---|---|
| Ika pre-alpha signing is single-NOA, not real MPC | Cryptographic security model is not production-grade today | Banner in product UI; verbatim disclaimer in README and section 6 of `IKA-INTEGRATION.md` |
| Ika devnet state may be wiped during the submission window | Submitted dWallets may stop working | Pre-record demo video; keep ALLOW/DENY receipt screenshots as fallback |
| Sepolia RPC is rate-limited on free tier | High-rate demo may hit 429 | Use private Alchemy URL via env; add a 1.5s spacer between demo actions |
| Daily cap accounting is per-card, not unified with USDC card | Two separate caps for users with both card types | Documented; v0.5 may unify |
| No allowlist edit ix in v0.4 | Users must close and reopen a card to change allowlist | Acceptable for the submission scope |

---

## 5. Fallback path (only if real Ika gRPC is unavailable)

If `scripts/ika-roundtrip.ts` cannot complete against the real Ika gRPC
service end-to-end during the submission window, we may use a recorded
signature replayed from a prior successful devnet run. This is the **last
resort** and must be:

1. Labelled in-product on the affected page with: `Demo mode — signature
   replayed from prior devnet run; gRPC service was unreachable at <UTC time>`.
2. Labelled in `IKA-TEST-REPORT.md` row 5 / row 6 with status `RECORDED — see
   ika-roundtrip-allow.signature.json` (and a hash of the recording).
3. Labelled in the demo video with an on-screen subtitle for the affected
   seconds.

Demo mode never claims to be a live Ika roundtrip. The user prompt is
explicit: "Do not present a stubbed signing path as real Ika execution."

---

## 6. Submission claim language (the rules)

Use these strings in the README, demo, and submission form. Do not blend.

- If rows 1, 2, 3, 4, 5, 6, 7 are all GREEN against real Ika:
  > **Full end-to-end tested on Solana devnet against the Ika pre-alpha
  > gRPC service. Both ALLOW and DENY paths verified. Existing 577-spec
  > Playwright gate green.**

- If rows 5 or 6 are RECORDED (fallback path):
  > **UI end-to-end tested. Policy gate end-to-end tested on Solana devnet.
  > Cross-chain execution verified in demo mode using a recorded signature
  > from a prior real Ika roundtrip; live Ika service was unavailable at
  > submission time.**

- If anything else is missing:
  > **Partial: see `docs/IKA-TEST-REPORT.md` for the exact matrix of what is
  > green, what is pending, and what was mocked.**
