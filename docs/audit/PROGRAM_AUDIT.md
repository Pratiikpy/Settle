# PROGRAM_AUDIT.md — Phase 3

Per-instruction audit of `programs/settle-agent-card/programs/settle-agent-card/src/`.

Anchor program ID: `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD` (devnet, declared in `lib.rs:33`).

Anchor 0.31. Sighash discriminator = `sha256("global:<snake_name>")[..8]`.

Cross-checks run:
- `pnpm tsx scripts/check-idl-drift.ts` → **OK** (15 ix, 13 events, no discriminator collision, 5 indexer event-size assumptions match).
- `pnpm tsx scripts/smoke-ix-data-parity.ts` → **OK** for 13 of 15 ix; `record_denial` and `record_receipt` are NOT exercised by the smoke (see AU-03-008).

---

## 1. `create_card` (`instructions/create_card.rs`)

**Accounts:**
- `authority: Signer mut` — pays init rent.
- `card: Account<AgentCard> init payer=authority space=AgentCard::SPACE`, seeds = `["agent-card", authority.key(), params.label_hash]`.
- `usdc_mint: Account<Mint>` — pinned into card.
- `system_program`.

**PDA seeds:** `[b"agent-card", authority, label_hash]`. Deterministic. Matches TS / Python / Rust derivers (`packages/sdk/src/pdas.ts`).

**Authority:** authority signs and is recorded as `card.authority`. Agent pubkey is data-only, not a signer here. Correct.

**Validation:** `allowlist.len() ≤ 10`, `daily_cap > 0`, `per_call_max > 0`, `per_call_max ≤ daily_cap`. Good.

**Findings:** none new.

---

## 2. `spend` (`instructions/spend.rs`)

Authority-signed direct transfer.

**Accounts:**
- `authority: Signer mut` — `address = card.authority` constraint.
- `card mut` — seeds verified.
- `usdc_mint: Account<Mint>` — `address = card.usdc_mint` (pinned).
- `authority_usdc: TokenAccount mut` — `token::authority = authority, token::mint = usdc_mint`.
- `merchant_usdc: TokenAccount mut` — `token::authority = merchant_owner, token::mint = usdc_mint`.
- `merchant_owner: AccountInfo` — pubkey looked up against `card.allowlist`.
- `token_program`.

**Policy enforced (in order):**
1. `amount > 0`
2. card not revoked, not expired
3. slot-window reset on `now - last_reset_slot ≥ CAP_WINDOW_SLOTS (220_000)`
4. `amount ≤ per_call_max`
5. `used_today + amount ≤ daily_cap` (checked add)
6. allowlist match by merchant; if entry has `Some(capability_hash)`, require equality with ix arg
7. CPI TransferChecked validates decimals
8. emit `PolicyDecisionEvent` (decision=ALLOW)

**Findings:** none new. CAP_WINDOW_SLOTS=220_000 ≈ 24.4h at 400ms slots — design-acceptable drift (see AU-03-013).

---

## 3. `spend_via_pact` (`instructions/spend_via_pact.rs`)

Agent-signed; Vault PDA program-signs the CPI.

**Accounts:**
- `agent: Signer` — `address = card.agent_pubkey @ UnauthorizedAgent`.
- `fee_payer: Signer mut`.
- `card mut` (mut required to update used_today).
- `pact mut` — seeds verified, `constraint = pact.parent_card == card.key()`.
- `vault: AccountInfo` — seeds verified, no init.
- `usdc_mint`, `vault_usdc` (associated_token mint+authority), `merchant_usdc` (token::authority = merchant_owner), `merchant_owner: AccountInfo`.
- `token_program`, `associated_token_program`.

**Policy enforced:**
- card revoked / expired
- pact closed / expired (re-uses `CardExpired` error — minor cosmetic, AU-03-009)
- `amount ≤ card.per_call_max_lamports`
- card.used_today rolling reset, `+amount ≤ daily_cap` (cross-Pact cap is correctly enforced by mutating the parent card)
- mode must be `OneShot` (returns `NotOneShotMode` for Streaming or DeliveryEscrow)
- pact.spent + amount ≤ pact.cap_lamports
- allowlist + capability pin
- CPI TransferChecked signed by Vault PDA via `[b"pact-vault", pact.key(), vault_bump]`

**Cross-pact daily cap accounting:** ✅ correctly enforced — `card.used_today` is updated on every pact spend (line 190). N pacts on the same parent card cannot dodge the daily cap.

**Findings:** none load-bearing. See AU-03-009 (cosmetic error message).

---

## 4. `revoke` (`instructions/revoke.rs`)

**Accounts:** authority (Signer, addr=card.authority), card mut.

**Idempotent.** First revoke flips bool and bumps `policy_version`; subsequent calls re-emit events but no state change.

**Findings:** none.

---

## 5. `record_denial` (`instructions/record_denial.rs`)

**Accounts:**
- `signer: Signer` — accepted if `signer.key() == card.authority || signer.key() == card.agent_pubkey`.
- `card` — NOT mut, just read for the constraint check.

**Authorization:** documented and correct — both authority and agent are pinned at creation, neither can be spoofed.

**Findings:**
- **AU-03-001 (MEDIUM)** — `pact: Pubkey` is an ix arg, not a verified account. An attacker (the agent itself, or authority) can fabricate a `pact` pubkey unrelated to the card. The on-chain `PolicyDecisionEvent` row is then incorrect about which pact was denied. Indexer writes garbage to the unified ledger. Fix: validate `pact == Pubkey::default() || pact.is_owned_by_program_and_pact_struct_with_parent_card == card.key()`. Practically: pass an optional `pact: Option<Account<Pact>>` and assert `pact.parent_card == card.key()`.
- **AU-03-002 (MEDIUM)** — no rate-limit; `record_denial` is free for the signer to spam (only ~5k lamports tx fee). Indexer DoS / attribution amplification surface.

---

## 6. `open_pact` (`instructions/open_pact.rs`)

**Accounts:** authority Signer mut, parent_card, pact init, vault unchecked PDA, usdc_mint, authority_usdc, vault_usdc init_if_needed, system+token+ATA programs.

**Policy:**
- `allowlist.len() ≤ 5`
- `cap_lamports > 0`
- `cap_lamports ≤ parent_card.daily_cap_lamports`
- strict-subset allowlist enforcement vs parent (correct semantics: pact may pin tighter, never looser)
- atomic CPI TransferChecked authority_usdc → vault_usdc

**Findings:**
- **AU-03-003 (MEDIUM)** — `cap_lamports ≤ daily_cap_lamports` forces a OneShot pact's lifetime budget to fit in a single day's cap. A 30-day rent pact at $100/day cannot be opened with `cap=$3000` unless `daily_cap ≥ $3000`, which contradicts the safety semantics of "daily cap" (it forces the user to inflate their daily cap to set up a multi-day budget).

---

## 7. `close_pact` (`instructions/close_pact.rs`)

**Accounts:** authority Signer mut (addr=pact.authority), pact mut, vault, usdc_mint, vault_usdc mut, authority_usdc mut.

**Policy:**
- pact not already closed
- refunds `vault_usdc.amount` → authority_usdc, signed by Vault PDA
- rejects `PactMode::DeliveryEscrow` (must use dispute / release path)
- sets `closed = true`
- emits `PactClosedEvent`

**Findings:**
- **AU-03-004 (MEDIUM)** — `close_pact` does NOT close the on-chain Pact account (no `close = authority` Anchor constraint). Rent on the Pact PDA (~3KB → ~0.022 SOL per pact) and on the vault_usdc ATA (~0.002 SOL) is permanently locked. Over thousands of pacts this is meaningful. Vault_usdc CAN be closed because amount=0 after refund. Suggested fix: add `close = authority` to the pact account in ClosePact accounts, plus `token::close_authority = authority` semantics for the vault ATA.

---

## 8. `open_streaming_pact` (`instructions/open_streaming_pact.rs`)

**Accounts:** mirrors `open_pact`; PDA seeds identical (`[b"pact", parent_card, scope_label_hash]`) — a given (parent, scope) pair hosts ONE pact, OneShot OR Streaming.

**Policy:**
- `rate > 0`, `max_total > 0`
- `max_total ≤ parent_card.daily_cap_lamports`  ← **same constraint problem as AU-03-003**
- expiry > now
- strict subset allowlist
- atomic CPI fund vault with `max_total_lamports`

**Findings:**
- **AU-03-005 (MEDIUM)** — Same as AU-03-003 but worse for streaming: a streaming pact's purpose is multi-day rent / SaaS / payroll. Constraining `max_total ≤ daily_cap` defeats the use case unless the user inflates their daily cap (which then becomes a wider blast radius if the agent is compromised). Either:
  - drop the constraint and accept that streaming pacts are pre-funded so daily cap is moot (user already custodied funds into the vault),
  - or replace with a per-day rate sanity check: `rate × CAP_WINDOW_SLOTS ≤ daily_cap`.

---

## 9. `claim_streaming` (`instructions/claim_streaming.rs`)

**Accounts:** agent Signer (addr=card.agent_pubkey), fee_payer Signer mut, card mut, pact mut, vault, mints/atas, programs.

**Math:**
```
total_paused_in_period = pause_accumulated_slots
                       + (paused ? now - pause_started_slot : 0)
elapsed = now - last_claim_slot              [saturating]
billable_slots = elapsed - total_paused_in_period   [saturating]
require billable_slots > 0
entitlement = billable_slots * rate           [checked_mul → PactOverCap on overflow]
amount = min(entitlement, max_total - claimed)
require amount > 0
require amount ≤ per_call_max_lamports
[card.used_today rolling-reset + new_total ≤ daily_cap]
```

After CPI:
- claimed += amount
- last_claim_slot = now
- pause_accumulated_slots = 0
- if still paused: pause_started_slot = now (so subsequent paused time accrues); else 0

**Overflow analysis:** `checked_mul` on `billable_slots * rate` is correct. `claimed.saturating_add(amount)` is safe. ✅

**Findings:**
- **AU-03-006 (HIGH)** — `claim_streaming` has no `amount` argument. If accumulated entitlement exceeds `per_call_max_lamports`, the require at line 155 `amount ≤ per_call_max` reverts and the agent CANNOT claim a partial amount. Stuck-state until `(max_total - claimed)` drops below `per_call_max` (which never happens unless `claimed` increases via another path — there isn't one).
  - Repro: `rate=1000`, `per_call_max=100_000`, `max_total=10_000_000`. Agent claims at slot 100 (entitlement=100k, fits). Then never claims for 200 slots; entitlement=200k > per_call_max=100k → revert. Permanent stuck.
  - Fix: cap `amount = amount.min(per_call_max_lamports)` instead of reverting; or add an `amount` arg the agent can pass to bound the claim.
- **AU-03-007 (HIGH)** — `claim_streaming` updates `card.used_today` (cross-pact cap enforcement). If the parent card's daily cap is small relative to streaming rate × idle time, the streaming claim reverts with OverCap. Same stuck-state pattern; resolution is to wait out the daily-cap window. Operationally fragile for autonomous agents.

---

## 10. `pause_streaming` (`instructions/pause_streaming.rs`)

**Accounts:** authority Signer (addr=pact.authority), pact mut.

Idempotent. Emits `PactStreamPauseEvent { paused: true }` only on the transition (correct — avoids spam events).

---

## 11. `resume_streaming` (`instructions/resume_streaming.rs`)

**Accounts:** authority Signer (addr=pact.authority), pact mut.

**AU-00-004 RESOLUTION:** `resume_streaming` DOES emit an event (line 42-46) — the unified `PactStreamPauseEvent { paused: false, slot }` is reused for resume. AU-00-004 reclassified from `NEEDS_VERIFICATION → DOC_DRIFT` (the SYSTEM_MAP comment "no `StreamingPactResumedEvent`" is correct but misleading; the event type is named for both transitions and the boolean flag distinguishes them). No additional finding required.

Math: pause_accumulated_slots += (now - pause_started_slot) using saturating_sub.

---

## 12. `open_delivery_escrow` (`instructions/open_delivery_escrow.rs`)

**Accounts:** authority (addr=parent_card.authority), parent_card, pact init, vault PDA, mint, authority_usdc, vault_usdc init_if_needed, programs.

**Policy:**
- `amount > 0`, `amount ≤ daily_cap` (same AU-03-003 constraint, equally questionable for escrow)
- `confirm_deadline_slot ≤ dispute_deadline_slot`
- `dispute_deadline_slot > now`
- `now < expiry_slot`
- merchant + capability_hash pinned in PactMode::DeliveryEscrow variant
- pact.allowlist intentionally empty
- CPI fund vault

**Findings:** none load-bearing beyond the daily-cap framing.

---

## 13. `release_delivery_escrow` (`instructions/release_delivery_escrow.rs`)

**Accounts:** caller Signer mut (anyone), pact mut, vault, mint, vault_usdc, merchant_usdc (validated owned by pinned merchant), programs.

**Policy:**
- pact not closed, not released, not refunded
- `merchant_usdc.owner == pact.mode.DeliveryEscrow.merchant`
- `caller == pact.authority` (early confirm) OR `now ≥ confirm_deadline_slot` (permissionless)
- payout = `min(vault_usdc.amount, amount)`; pre-check `payout > 0`
- CPI vault_usdc → merchant_usdc, signed by Vault PDA
- mark released, closed=true

**Findings:**
- **AU-03-010 (LOW)** — relies on merchant ATA pre-existing. Buyer can grief by not creating the merchant ATA (but only if buyer can prevent the merchant from creating it — they can't; merchant funds their own ATA). Acceptable.

---

## 14. `dispute_delivery_escrow` (`instructions/dispute_delivery_escrow.rs`)

**Accounts:** authority (=pact.authority), pact mut, vault, mint, vault_usdc, authority_usdc, programs.

**Policy:**
- pact not closed / released / refunded
- `now < dispute_deadline_slot`
- `vault_usdc.amount > 0`
- CPI vault → authority_usdc (refund), signed by Vault PDA
- mark refunded, closed=true

**Findings:** none.

---

## 15. `record_receipt` (`instructions/record_receipt.rs`)

**Accounts:** attestor: Signer (anyone). No state writes.

**Permissionless attestation.** Documented in source: spam attestations are detectable downstream (verifier rejects ones whose canonical objects don't actually exist in receipts table).

**Findings:**
- **AU-03-011 (LOW)** — same DoS surface as AU-03-002 but mitigated by the verifier-side filter. Documented design choice; not a bug.

---

## Cross-cutting

### Cross-pact daily cap enforcement

`spend_via_pact` (line 130-134, 190) and `claim_streaming` (line 164-168, 230) BOTH update `card.used_today`. Two pacts on the same parent card cannot jointly exceed daily cap. ✅ correctly enforced.

### Slot rollover

`now_slot.saturating_sub(last_reset_slot) ≥ CAP_WINDOW_SLOTS (220_000)` resets `used_today` and stamps `last_reset_slot = now`. Slot-rate variability gives ~24.4h ± noise window. **AU-03-013 (LOW)** — drift is documented and acceptable on devnet/mainnet.

### Replay surface

- `spend` / `spend_via_pact` / `claim_streaming` are not idempotent — each call moves USDC. Anchor's account-mut + non-replayable signature semantics + Solana's blockhash-based dedup (within validity window) prevent accidental re-execution, but a malicious relayer holding a presigned tx CAN replay within the blockhash window. Combined with `record_denial`'s lack of `pact` validation, indexer writes can be amplified.
- `record_receipt` is replay-safe by design; verifier validates the canonical objects.

### Discriminator consistency

Anchor 0.31 uses `sha256("global:<snake_name>")[..8]`. The TS IDL stores camelCase ix names; `check-idl-drift.ts` (line 56-59) snake-cases them before hashing. Rust `ix_data.rs` and Python `__init__.py` use snake_case directly. **All three derive identical discriminators** (verified by hashing — see Phase 4).

### SDK ix-builder mismatches (CRITICAL CROSS-LANG GAP)

- **AU-03-008 (HIGH)** — Python SDK and Rust SDK do NOT export builders for `record_denial` and `record_receipt`. Only the TS surface (`apps/web/lib/anchor-client.ts:315 recordDenialIx`, line 727 `recordReceiptIx`) implements them. Python `__all__` lists 13 ix functions; Rust `ix_data.rs` defines 13 `pub fn`. The Anchor program defines 15.
  - Evidence: `grep -n '^def ix_' packages/python-sdk/settle_sdk/__init__.py` → 13 hits; `grep -n '^pub fn (record_denial|record_receipt)' packages/rust-sdk/src/ix_data.rs` → 0 hits.
  - Impact: any non-TS integrator (Python agent, Rust off-chain signer) cannot fire `record_denial` or `record_receipt` without hand-rolling discriminator + Borsh. Cross-lang byte parity is broken-by-omission for 2 of 15 ix.
  - Fix: add `ix_record_denial`, `ix_record_receipt` to Python; `record_denial`, `record_receipt` to Rust. Add to `scripts/smoke-ix-data-parity.ts` (currently 13 dump() calls; should be 15) and the Rust ix_data tests.

---

## Summary

15/15 instructions audited. New findings: 11 (1 BLOCKER candidate downgraded to HIGH on review, 2 HIGH, 4 MEDIUM, 4 LOW). AU-00-004 resolved (resume DOES emit).
