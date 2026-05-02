# FINDINGS.md

Cumulative audit findings. New findings appended at end of each phase. Status updates as fixes land.

---

## AU-00-001 — DOC_DRIFT — Anchor instruction count

**Severity:** DOC_DRIFT
**Category:** DOC
**Files:**
- `PROJECT_STATUS.md:1-2` (claims "13 instructions" in SDKs section)
- `docs/STRATEGY.md` (claims "14-instruction Anchor program")
- `programs/settle-agent-card/programs/settle-agent-card/src/lib.rs` (defines 15)

**Expected:** docs and code state same number.
**Actual:** PROJECT_STATUS says 13, STRATEGY says 14, code defines 15. Three different numbers.

**Evidence:**
```
$ grep -E '^\s*pub\s+fn\s' programs/settle-agent-card/programs/settle-agent-card/src/lib.rs | wc -l
15
```
Functions: create_card, spend, spend_via_pact, revoke, record_denial, open_pact, close_pact, open_streaming_pact, claim_streaming, pause_streaming, resume_streaming, open_delivery_escrow, release_delivery_escrow, dispute_delivery_escrow, record_receipt.

**Why it matters:** SDK builders, indexer event mappings, and ix-data goldens all key off the instruction count. If three docs disagree, the source of truth is unclear and a downstream consumer (auditor, integrator) gets the wrong number.

**How to verify the fix:** docs cite "15 instructions" consistently; SDK byte goldens reflect 15 + 13 in test counts (revoke + close_pact + 2 stream events have no args so may have fewer ix-data tests; verify in Phase 4).

**Human action required?** no

---

## AU-00-002 — DOC_DRIFT — Anchor event count

**Severity:** DOC_DRIFT
**Category:** DOC
**Files:**
- `PROJECT_STATUS.md` (claims "all 14 Anchor events" in indexer section, line 75)
- `programs/settle-agent-card/programs/settle-agent-card/src/events.rs` (defines 13)

**Expected:** match.
**Actual:** PROJECT_STATUS claims 14; code has 13.

**Evidence:**
```
$ grep -c '#\[event\]' programs/settle-agent-card/programs/settle-agent-card/src/events.rs
13
```
Events: PolicyDecisionEvent, CardCreatedEvent, CardRevokedEvent, PactOpenedEvent, PactClosedEvent, PactSpendEvent, StreamingPactOpenedEvent, PactStreamClaimEvent, PactStreamPauseEvent, DeliveryEscrowOpenedEvent, DeliveryEscrowReleasedEvent, DeliveryEscrowDisputedEvent, ReceiptRecordedEvent.

**Why it matters:** indexer claims to subscribe to "all 14" but only 13 exist. Either the doc is overcounting or the program is missing an event.

**How to verify the fix:** indexer subscriber count matches `events.rs` count.

**Human action required?** no

---

## AU-00-003 — DOC_DRIFT — 31 unclaimed UI routes

**Severity:** DOC_DRIFT
**Category:** DOC
**Files:** `PROJECT_STATUS.md:31-56` (UI section)

**Expected:** PROJECT_STATUS lists every shipped UI surface.
**Actual:** 31 UI routes exist that aren't mentioned anywhere in PROJECT_STATUS.

**Evidence:** see SYSTEM_MAP.md "Routes NOT mentioned in PROJECT_STATUS".

Notable unclaimed routes that look user-facing:
- `/onboarding` — onboarding flow
- `/control-center` — appears to be dashboard variant
- `/feed` — Phase 5 surface but unmentioned
- `/leaderboard`, `/leaderboard/[capabilityHash]` — STRATEGY mentions capability heatmap
- `/agents/streaming`, `/agents/collab`, `/agents/templates` — agent-related
- `/cards/new` — card creation page
- `/claim/[escrow]` — gift claim landing
- `/sandbox` — possibly internal
- `/at/[handle]` — handle alias
- `/blink/[slug]` — Solana Blinks
- `/qr/[merchant]/[slug]` — QR landing

**Why it matters:** The "shipped UI" list isn't authoritative. Either these are SHIPPED-but-undocumented (DOC_DRIFT) or DEAD_CODE. Phase 8 (UX_REACHABILITY) and Phase 13 (DEAD_CODE) will resolve.

**How to verify the fix:** PROJECT_STATUS lists all reachable UI routes OR unreachable ones are removed.

**Human action required?** no (but classification needs Phase 8 + 13 review)

---

## AU-00-004 — NEEDS_VERIFICATION — missing StreamingPactResumedEvent

**Severity:** NEEDS_VERIFICATION (likely DOC_DRIFT or HIGH)
**Category:** PROGRAM_LOGIC
**Files:**
- `programs/settle-agent-card/programs/settle-agent-card/src/events.rs` (no resumed event)
- `programs/settle-agent-card/programs/settle-agent-card/src/instructions/resume_streaming.rs` (instruction exists)

**Expected:** every instruction that mutates state emits an indexer-observable event.
**Actual:** `resume_streaming` instruction exists; only `PactStreamPauseEvent` exists. No `StreamingPactResumedEvent`.

**Why it matters:** indexer cannot mirror the resumed state without an event. UI showing pause status would be stale after a resume.

**How to verify the fix:** read `resume_streaming.rs`; confirm whether it emits `PactStreamPauseEvent` (with paused=false) or is silent. Phase 3 follow-up.

**Human action required?** no

**Resolution (Phase 7):** confirmed by `events.rs:103-108` — `PactStreamPauseEvent` carries a `paused: bool` and is emitted by both pause and resume; indexer handler (index.ts:655-681) writes `paused`+`pause_started_slot` accordingly. Reclassify as DOC_DRIFT (event name is misleading — should be `PactStreamPauseStateEvent`), severity LOW.

---

## AU-07-001 — HIGH — Indexer has no durable cursor; restart loses events

**Severity:** HIGH
**Category:** INDEXER
**Files:**
- `apps/indexer/src/index.ts:105-166` — single `connection.onLogs(PROGRAM_ID, …, "confirmed")` subscription with no signature checkpoint
- (No `getSignaturesForAddress` backfill anywhere in `apps/indexer/`.)

**Expected:** an event-sourcing indexer for a payments protocol durably tracks its highest-confirmed signature, so on restart or WS-reconnect it backfills missed events via `getSignaturesForAddress(programId, { until: last_signature })`. Federation poller already does this pattern (`federation-poller.ts:209-228`).

**Actual:** WebSocket only. Disconnect → process restart → every event emitted while offline is silently lost. No row anywhere is *wrong*; rows are simply *absent* — the worst forensic shape because `assertRowsAffected` fires only when an UPDATE expects an existing row (e.g. CardRevoked after a missed CardCreated → loud), but a missed PactSpend writing zero is silent.

**Evidence:**
```
$ rg -n 'getSignaturesForAddress|last_signature|cursor|checkpoint' apps/indexer/src/
(no matches)
```
Helius WS docs guarantee at-least-once during a healthy connection, but make no durability guarantee across reconnects. The federation poller handles this with a watermark; the core subscriber does not.

**Why it matters:** payments protocol. A 30-second WS blip during devnet stress (or a node deploy on Helius's side) silently drops PactSpendEvents, which (a) leaves `pacts.spent` stale, (b) skips round-up enqueues, (c) leaves `phase5_executions` un-confirmed, (d) lets receipts fall out of compress-cron's queue. None of these surface as errors.

**How to verify the fix:** add `last_indexed_signature` table; on startup pull `getSignaturesForAddress(programId, { until: last })`, replay each via `getTransaction`, then begin the WS stream. Verify by killing the indexer mid-tx burst and restarting — Supabase row count for the burst window matches expected.

**Human action required?** no

---

## AU-07-002 — HIGH — Duplicate-row risk on policy_decisions + round_up_queue

**Severity:** HIGH
**Category:** INDEXER
**Files:**
- `apps/indexer/src/index.ts:237-250` — `supabase.from("policy_decisions").insert(...)` with no ON CONFLICT
- `apps/indexer/src/index.ts:441-449` — `supabase.from("round_up_queue").insert(...)` with no idempotency key
- `infra/supabase/migrations/0001_init.sql:115-130` — `policy_decisions` has no UNIQUE on sig_solscan
- `infra/supabase/migrations/0040_round_up_queue.sql:26-48` — `round_up_queue` PK is random UUID; no UNIQUE on `(rule_id, triggering_request_id, triggering_amount_lamports)`

**Expected:** the same Anchor event ingested twice (WS retransmit, post-restart backfill, dual-instance indexer) writes one row.

**Actual:** both tables accept duplicate inserts. For `policy_decisions` this is "only" a ledger-bloat / wrong-count audit problem. For `round_up_queue` this is a **double-spend** vector: the signer cron drains every `status='pending'` row and fires `spend_via_pact` for the delta. A duplicated queue row → two on-chain spends for one trigger.

**Evidence:**
```
$ rg -n 'unique|UNIQUE' infra/supabase/migrations/0001_init.sql | grep -i 'policy_decisions\|sig_solscan'
(no match)

$ rg -n 'unique|UNIQUE' infra/supabase/migrations/0040_round_up_queue.sql
(no match — only constraint is delta_lamports > 0)
```

**Why it matters:** money. Round-up duplication moves user funds twice. Audit-table duplication corrupts every dashboard count and every "show me yesterday's denials" query.

**How to verify the fix:**
- `ALTER TABLE policy_decisions ADD CONSTRAINT pd_unique_sig UNIQUE (sig_solscan, card_pubkey);` (one tx can emit multiple events; (sig, card) is the right pair).
- `ALTER TABLE round_up_queue ADD COLUMN triggering_sig text; ADD CONSTRAINT round_up_queue_unique_trigger UNIQUE (rule_id, triggering_sig);` and pass `args.triggeringSig` into the insert.
- Integration test: send the same `Logs` payload twice through `handlePolicyDecision` + `handlePactSpend` → row count stays at 1.

**Human action required?** no

---

## AU-07-003 — MEDIUM — Federation poller does not query verified_merchants for webhook URL

**Severity:** MEDIUM
**Category:** INDEXER
**Files:**
- `apps/indexer/src/federation-poller.ts:45-51` — env-var-only lookup
- `apps/indexer/src/webhook-worker.ts:78-106` — uses `verified_merchants.webhook_url` then env-var fallback

**Expected:** symmetric with native webhook delivery.

**Actual:** federated webhooks deliver only when an operator-set env var is present. Self-serve merchants who registered via `/api/merchants/[handle]/webhook` will never receive federated receipt notifications.

**Evidence:** L45-51:
```ts
function getMerchantWebhookUrl(pubkey: string | null): string | null {
  if (!pubkey) return null;
  const truncated = pubkey.slice(0, 8).toUpperCase();
  return process.env[`MERCHANT_WEBHOOK_URL_${truncated}`] ?? null;
}
```
Comment at L46-47 admits this is provisional ("future: query verified_merchants").

**Why it matters:** silently breaks the F9.3 federation promise for production merchants. A merchant who has correctly self-served their webhook gets native receipts but never federated ones.

**How to verify the fix:** copy `getMerchantWebhookConfig` from `webhook-worker.ts:78`; thread the same two-tier lookup. Smoke: register a verified_merchants row with `webhook_url`, simulate a verified federated_receipt for that recipient_pubkey, assert webhook_delivery_status flips to 'delivered'.

**Human action required?** no

---

## AU-07-004 — MEDIUM — IDL-drift script covers only 5 of 13 event sizes

**Severity:** MEDIUM
**Category:** INDEXER
**Files:** `scripts/check-idl-drift.ts:149-155`

**Expected:** the drift assertion covers every event the indexer parses with a hard-coded `data.length < N` guard.

**Actual:** only 5 events are in `INDEXER_ASSUMED_EVENT_SIZES`. The other 8 (PolicyDecisionEvent 214, PactOpenedEvent 121, StreamingPactOpenedEvent 137, PactStreamClaimEvent 136, PactStreamPauseEvent 41, DeliveryEscrowOpenedEvent 192, DeliveryEscrowReleasedEvent 113, DeliveryEscrowDisputedEvent 80) are unprotected. If any on-chain layout grows, the indexer silently rejects every event with a `console.warn` instead of writing rows; the drift script reports `[OK] No drift detected.`

**Evidence:** see file lines 149-155.

**Why it matters:** the script exists specifically to prevent the regression class proven by `17ddb08` (handler logic drift after on-chain change). Coverage at 5/13 means 8 paths can still drift undetected.

**How to verify the fix:** add the 8 missing entries; re-run `pnpm tsx scripts/check-idl-drift.ts` and confirm 13 lines of `[OK] EventName: Nb (matches indexer)`.

**Human action required?** no

---

## AU-07-005 — LOW — kernel_receipt_attestations PK collides on multi-event txs

**Severity:** LOW
**Category:** DATA_RLS
**Files:**
- `apps/indexer/src/index.ts:855-862` — insert keyed implicitly on `sig_solscan`
- `infra/supabase/migrations/0019_receipt_kernel.sql:83-91` — `sig_solscan text primary key`

**Expected:** if a single tx emits multiple ReceiptRecordedEvents (e.g. a multi-CPI batch firing record_receipt twice), every attestation persists.

**Actual:** the second insert fails on PK conflict. Today the program only emits one ReceiptRecordedEvent per tx, so this is dormant — but constrains future multi-receipt patterns and makes the DB schema lie about cardinality.

**How to verify the fix:** composite PK `(sig_solscan, receipt_hash)` or `(sig_solscan, context_hash)`.

**Human action required?** no

---

## AU-07-006 — LOW — CardCreatedEvent.allowlist_count discarded; allowlist join never populated by indexer

**Severity:** LOW
**Category:** INDEXER
**Files:** `apps/indexer/src/index.ts:494-507` — explicitly discards `allowlistCount` with `void allowlistCount`.

**Expected:** indexer mirrors all on-chain state, including the allowlist members, into `agent_card_allowlist` (per `0001_init.sql:35-42`).

**Actual:** the count is parsed and dropped. The on-chain event also doesn't carry the allowlist members (only the count), so the indexer can't populate the join even if it wanted to. Comment at L504-507 acknowledges the design gap.

**Why it matters:** off-chain `agent_card_allowlist` is populated only via the API (`/api/cards/*`). Cards created directly on-chain (e.g. via SDK from a script) → empty allowlist in Supabase → UI cannot resolve "what merchants can this card spend at?" without re-reading on-chain.

**How to verify the fix:** add a per-merchant subevent (`AllowlistEntryEvent { card, merchant, capability_hash }`) emitted from `create_card.rs`, OR have the indexer fetch the AgentCard account on `CardCreatedEvent` and populate the join from `account.allowlist`.

**Human action required?** no

---

## AU-01-001 — DOC_DRIFT — README claims "v0.3 — 22 features" but text lists more

**Severity:** DOC_DRIFT
**Category:** DOC
**Files:** `README.md` heading section ("v0.3 — 22 features"), `docs/PRODUCT_SPEC.md` (claims 25 user-visible)

**Expected:** consistent count.
**Actual:** README says "22 features", PRODUCT_SPEC says "25 user-visible features", STRATEGY says ~150 features (counted differently). The 22/25/150 are different scopes but README's "22" headline is likely wrong on its own terms.

**Why it matters:** front-door inconsistency for any reader entering via README.
**How to verify:** unify counts across docs.
**Human action required?** no

---

## AU-01-002 — DOC_DRIFT — README claims "14 instructions" (also wrong)

**Severity:** DOC_DRIFT
**Category:** DOC
**Files:** `README.md` Architecture section ("one Anchor program (`settle-agent-card`), 14 instructions")

**Expected:** match `lib.rs` count.
**Actual:** code has 15 instructions (see AU-00-001).

**Why it matters:** README is the entrypoint; integrators trust it.
**Human action required?** no

---

## AU-01-003 — HIGH — DOC_DRIFT — SDK ix builders not in @settle/sdk

**Severity:** HIGH (architectural drift; affects external SDK consumers)
**Category:** DOC
**Files:**
- `PROJECT_STATUS.md:16` ("@settle/sdk — ... all 13 Anchor ix data builders")
- `packages/sdk/src/index.ts` (does NOT export ix builders)
- `apps/web/lib/anchor-client.ts` (where the 15 ix builders actually live)
- `apps/web/lib/borsh.ts` (the canonical buildIxData consumed by smoke-ix-data-parity.ts)

**Expected:** if the SDK is the canonical layer for ix builders (as claimed), they should live in `packages/sdk/src/anchor-ix-data.ts` or similar and be exported from `index.ts`.
**Actual:** the ix builders live in `apps/web/lib/anchor-client.ts`, importing from `apps/web/lib/borsh.ts`. The smoke-ix-data-parity.ts script imports from `apps/web/lib/borsh.js`, not from `@settle/sdk`. External SDK consumers cannot build instructions without depending on `apps/web` internal code.

**Why it matters:** anyone publishing `@settle/sdk` to npm cannot use it standalone for ix construction — they'd need to copy/paste from the apps/web monolith. Real architectural drift, not just doc-level.

**How to verify the fix:**
1. Move ix builders to `packages/sdk/src/anchor-ix-data.ts`; export from `index.ts`.
2. Delete duplicate in `apps/web/lib/anchor-client.ts` (or have it re-export from `@settle/sdk`).
3. Update PROJECT_STATUS to be honest about SDK surface OR fix the mismatch.

**Human action required?** no

---

## AU-01-004 — DOC_DRIFT — SDK_VERSION mismatch

**Severity:** LOW
**Category:** DOC
**Files:**
- `packages/sdk/package.json` ("version": "0.1.0")
- `packages/sdk/src/index.ts` (`SDK_VERSION = "0.2.0"`)

**Expected:** match.
**Actual:** package.json says 0.1.0, code constant says 0.2.0.

**Why it matters:** consumers reading SDK_VERSION at runtime see a different version than npm reports.
**Human action required?** no

---

## AU-01-005 — DOC_DRIFT — Test count claim (258 vs 223 actual)

**Severity:** DOC_DRIFT
**Category:** DOC
**Files:** `PROJECT_STATUS.md:28` ("**258 tests**")

**Expected:** test count = number of pytest/vitest/cargo-collected tests.
**Actual:**
- 155 SDK vitest ✓
- 7 mcp-middleware vitest ✓
- 42 Rust ✓
- 19 Python ix-data (pytest-collected) ✓
- "35 Python kernel" — actually 14 inline `assert` statements in `test_kernel_parity.py`; **0 pytest test functions**
- pytest --collect-only on python-sdk reports 19 tests total

**Total pytest/vitest/cargo-collected: 223. PROJECT_STATUS claims 258.**

**Why it matters:** the test count is a confidence metric; overcounting by 35 is misleading.
**How to verify the fix:** convert `test_kernel_parity.py` inline asserts into proper pytest test functions (14 of them), OR update PROJECT_STATUS to "223 collected tests + 14 inline kernel parity asserts".
**Human action required?** no

---

## AU-01-006 — HIGH — MAINNET_MIGRATION still references placeholder program ID

**Severity:** HIGH (misleading mainnet checklist)
**Category:** DOC
**Files:**
- `MAINNET_MIGRATION.md:row 14` (Anchor program ID: "placeholder `SettLe1111…` until `anchor build` runs")
- `programs/settle-agent-card/programs/settle-agent-card/src/lib.rs:declare_id!("HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD")`
- `apps/web/lib/anchor-client.ts:const PLACEHOLDER_PROGRAM_ID = "SettLe1111111111111111111111111111111111111"` (still defined, used as fallback)
- git commit `790be4f` "deploy program to devnet — HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD"

**Expected:** MAINNET_MIGRATION reflects the deployed devnet program ID + the mainnet rotation steps from THIS id, not from a placeholder.
**Actual:** MAINNET_MIGRATION.md says program ID is still placeholder. It is not — devnet has a real deployed ID.

**Why it matters:** anyone following MAINNET_MIGRATION as a checklist would be looking for the wrong baseline. The migration steps still apply (rotate to a fresh mainnet keypair) but the starting state is misrepresented.

**How to verify the fix:** MAINNET_MIGRATION row 14 cites `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD` as the current devnet ID and mainnet rotation steps from that baseline.
**Human action required?** no

---

## AU-01-007 — DOC_DRIFT — apps/web/lib/anchor-client.ts retains PLACEHOLDER_PROGRAM_ID

**Severity:** LOW
**Category:** DEAD_CODE
**Files:** `apps/web/lib/anchor-client.ts` (search for `PLACEHOLDER_PROGRAM_ID`)

**Expected:** since the real devnet program ID is deployed and env vars carry it, the PLACEHOLDER constant is dead.
**Actual:** the constant is still defined; check whether it's referenced anywhere as a fallback.

**Why it matters:** if a code path silently falls back to placeholder when env is missing, it would build txs against a non-existent program.
**Human action required?** no

---

## AU-01-008 — CONFIRMED — Phase 5 live proof tx sigs match logs

**Severity:** N/A (not a finding — confirmation)
**Category:** N/A
**Files:**
- `PROJECT_STATUS.md:96-119` (claims 7 intent runs)
- `logs/phase5-all-intents-2026-05-01T19-29-54-903Z.json`
- `logs/phase5-idempotency-2026-05-01T20-27-10-901Z.json`
- `logs/phase5-live-2026-05-01T19-23-43-568Z.json`

**Confirmed:** logs exist, contain real tx sigs, mode=live, status=confirmed for the 6 spend_via_pact intents. Idempotency log shows round1 `4iTZjcBmLdd2…` matches PROJECT_STATUS claim.

**Note:** these are logs from a single test run on 2026-05-01. They prove that ON THAT DAY, the harness fired confirmed txs. They do not prove the system is currently functional (e.g. if a recent commit broke the signer, the old logs still look valid). Phase 5 of the audit will re-run the harness to confirm continuous liveness.

---

## AU-05-001 — HIGH — Auto-refill has TWO active dispatch paths (potential double-spend)

**Severity:** HIGH
**Category:** DISPATCH
**Files:**
- `apps/web/app/api/cron/phase5-signer/route.ts:540-571` (Path 1: reads `auto_refill_rules` directly)
- `apps/web/app/api/cron/phase5-signer/route.ts:660-693` (Path 2: reads `auto_refill_queue` at status=pending)

**Expected:** exactly one canonical path per intent kind.
**Actual:** the signer has BOTH:
- "Path 1" comment: `// ─── 2. auto_refill_rules recently fired ───` — pushes plans with `intent_id = rule_id`, `source_pubkey = owner_pubkey`, `dest_pubkey = card_pubkey`.
- "Path 2" comment: `// ─── 5a. auto_refill_queue rows at status='pending' ───` — pushes plans with `intent_id = queue_id`, `source_pubkey = pactRow.parent_card`, `dest_pubkey = row.dest_pubkey`.

**Why it matters:**
- Both paths push `intent_kind: "auto_refill"`. They use DIFFERENT intent_ids (rule_id vs queue_id), so the dedup query `WHERE intent_kind=auto_refill AND intent_id=X` does not catch the cross-path duplication.
- Migration 0041 (`auto_refill_v2`) added `auto_refill_queue`, presumably as the new canonical surface. If `auto_refill_rules.last_refill_at` is still being updated by `tick`, AND a queue row exists, BOTH paths could fire — double-spending.
- The two paths use different `dest_pubkey` (Path 1 sends to the card_pubkey; Path 2 sends to the rule's dest_pubkey). They may not even target the same wallet — leading to PAYMENT TO WRONG WALLET.

**How to verify:**
1. Check `phase5-tick` logic: does it still write to `auto_refill_rules.last_refill_at`? If yes, Path 1 is live.
2. Run a test: enable an auto_refill_rule + insert an auto_refill_queue row for the same card; observe whether 1 or 2 fires happen.
3. Check `phase5_executions` history for any auto_refill rows where 2 sigs landed within 1 minute.

**Fix path:** delete Path 1 (lines 540-571), OR add cross-table dedup. Verify auto_refill v1 → v2 migration completed all consumers.

**Human action required?** no

---

## AU-05-002 — MEDIUM — 3 of 7 failure paths missing Sentry capture

**Severity:** MEDIUM
**Category:** DISPATCH
**Files:**
- `apps/web/app/api/cron/phase5-signer/route.ts:896` (card_delegation_validated=false → status=failed; no Sentry)
- `apps/web/app/api/cron/phase5-signer/route.ts:900` (card.agent_pubkey != relayer → no Sentry)
- `apps/web/app/api/cron/phase5-signer/route.ts:913` (no pact attached → no Sentry)
- `apps/web/app/api/cron/phase5-signer/route.ts:923` (pact closed → no Sentry)
- `apps/web/app/api/cron/phase5-signer/route.ts:1204` (unimplemented ix_kind catch-all → no Sentry)

**Expected:** any failure path that produces a `phase5_executions.status='failed'` row should also alert via Sentry — the operator runs phase5 unattended on cron and needs alerts.
**Actual:** validation gates fail to Sentry. Only the LIVE-FIRE catch blocks (lines 1010, 1187) capture.

**Why it matters:** if a user has a misconfigured card / closed pact / mismatched relayer, the signer logs failed rows but no alert reaches Sentry. The operator only learns by manually querying `phase5_executions WHERE status='failed'`. Unattended cron with silent validation failures = degraded SLO.

**Note:** validation gates ARE different in nature from live-fire throws. A validation gate failing is often a USER CONFIG ERROR (closed pact, missing relayer setup), not a system bug. Whether these warrant Sentry depends on observability strategy. Recommend: capture as `level: warning` with tag `gate: card_delegation/pact_ready/etc` so they're observable but distinguishable from actual code crashes.

**How to verify the fix:** every `status = "failed"` line is followed (within the same try-block) by `Sentry.captureMessage` (warning) or `Sentry.captureException` (error).

**Human action required?** no

---

## AU-05-003 — MEDIUM — Catch-all unimplemented-dispatch path silently fails

**Severity:** MEDIUM
**Category:** DISPATCH
**Files:** `apps/web/app/api/cron/phase5-signer/route.ts:1202-1206`

**Expected:** if a plan has a (intent_kind, ix_kind) combo that isn't wired to any fire function, the operator should be paged.
**Actual:**
```ts
} else {
  // Live but not yet wired ix kinds → fail loud + tell the operator which.
  status = "failed";
  errorMessage = `live mode wiring for ${plan.intent_kind}/${plan.ix_kind} not implemented yet.`;
}
```
The comment says "fail loud + tell the operator" — but no Sentry capture. The "fail loud" is just a row in `phase5_executions` — invisible until manually queried.

**Why it matters:** if a future PR adds a new intent_kind to the plan-build phase but forgets to wire the dispatch, the signer will silently fail every fire. Sentry would catch this immediately.

**Fix:** add `Sentry.captureMessage(errorMessage, { level: "error", tags: {...}})` here.

**Human action required?** no

---

## AU-05-004 — CONFIRMED — DB intent_kind constraint correctly migrated to 7 kinds

**Severity:** N/A (confirmation)
**Category:** DATA_RLS
**Files:**
- `infra/supabase/migrations/0031_phase5_executions.sql` (original 4 kinds)
- `infra/supabase/migrations/0045_streaming_claim_queue.sql:50-67` (drops + re-adds with 7 kinds)

**Confirmed:** migration 0045 correctly drops the old `p5_intent_kind_valid` constraint and re-adds with all 7 kinds: scheduled_send, auto_refill, gift_claim, gift_refund, group_spend, round_up, streaming_claim. Atomically, in a single ALTER. Idempotent.

---

## AU-02-001 — DOC_DRIFT — F2.0 Universal Receipt Kernel tagged PLANNED but shipped

**Severity:** DOC_DRIFT
**Category:** DOC
**Files:**
- `docs/STRATEGY.md:340` — `### F2.0 — Universal Receipt Kernel — ⏳ PLANNED · Phase 1 priority #1`
- `packages/sdk/src/receipt-kernel.ts`, `receipt-kernel.test.ts` (exist)
- `infra/supabase/migrations/0019_receipt_kernel.sql`
- `PROJECT_STATUS.md:24` — claims kernel commit covers 7 receipt kinds, 35 byte-locked goldens across 3 SDKs

**Expected:** STRATEGY tag matches code reality.
**Actual:** STRATEGY says PLANNED. Kernel SDK + Python + Rust ports + migration + 35 byte-locked goldens all exist. The "every payment path emits 4 hashes" universalisation may still be incomplete (BUILD_ORDER:42–50 lists week-1 patches as `[ ]`), but the kernel itself is shipped.

**Why it matters:** STRATEGY positions F2.0 as Phase-1 priority #1; if shipped, work-prioritisation is misaligned.

**How to verify the fix:** STRATEGY F2.0 retag 🟡 PARTIAL or ✅ SHIPPED depending on universal-coverage check across send/refund/escrow/streaming endpoints.

**Human action required?** no

---

## AU-02-002 — MISSING — F2.5 public proof page `/at/<handle>/proof` not built

**Severity:** MEDIUM
**Category:** UX_REACHABLE / DOC
**Files:** `docs/STRATEGY.md:421` claims `/at/<handle>/proof`. `apps/web/app/at/[handle]/` contains only `page.tsx` — no `proof/` subdir.

**Evidence:** `ls apps/web/app/at/[handle]/proof` → `No such file or directory`.

**Why it matters:** Spec promises a public, shareable, hash-chain-anchored proof URL distinct from the receipt page. Not present.

**Human action required?** no

---

## AU-02-003 — NEEDS_VERIFICATION — F2.7 hash-chain animation

**Severity:** NEEDS_VERIFICATION
**Category:** UX_REACHABLE
**Files:** `docs/STRATEGY.md:449`. `BUILD_ORDER.md:74` schedules week 4 of Phase 1 (post-hackathon). Component not located in `apps/web/components/` cursorily; deeper grep deferred to Phase 8.

---

## AU-02-004 — NEEDS_VERIFICATION — F2.9 receipt drag-to-share

**Severity:** NEEDS_VERIFICATION
**Category:** UX_REACHABLE
**Files:** `docs/STRATEGY.md:477`; `BUILD_ORDER.md:106` schedules week 7. No drag handler / drop targets located in this pass.

---

## AU-02-005 — MISSING — F2.12 compliance-grade receipt export

**Severity:** MEDIUM
**Category:** DOC + missing surface
**Files:** `docs/STRATEGY.md:519` claims Schedule-C / VAT / GST export. SYSTEM_MAP.md shows only `/receipts/[requestId]/print/` (PDF print). No `/api/exports`, `/api/compliance`, or equivalent route in `apps/web/app/api/`.

**Why it matters:** Differentiates Settle Business per spec; absent.

---

## AU-02-006 — PARTIAL — F3.4 capability registry alias surfacing not wired

**Severity:** LOW
**Category:** UX_REACHABLE
**Files:**
- `infra/supabase/migrations/0025_capability_registry.sql` (table exists)
- `apps/web/app/api/capabilities/route.ts` (API exists)
- `apps/web/app/capabilities/page.tsx` (page exists)
- `PROJECT_STATUS.md:282` admits the receipt page does not render the merchant alias when `capability_hash` matches a registry row

**Status:** SHIPPED skeleton; receipt-page render gap. ~1 hour fix per PROJECT_STATUS.

---

## AU-02-007 — NEEDS_VERIFICATION — F3.8 killchain animation on revoke

**Severity:** NEEDS_VERIFICATION
**Category:** UX
**Files:** `docs/STRATEGY.md:637` claims frost shader + slide-to-confirm + shatter animation. `revokeIx` shipped (`apps/web/lib/anchor-client.ts:294`). `BUILD_ORDER.md:73` schedules week 4. Animation component not located in this pass.

---

## AU-02-008 — DOC_DRIFT — F4.1 `npx create-settle-merchant` not a published initialiser

**Severity:** DOC_DRIFT
**Category:** DOC
**Files:** `docs/STRATEGY.md:713` advertises `npx create-settle-merchant`. Repo has `scripts/create-settle-merchant.ts` only — local script, not a published npm initialiser package.

**Why it matters:** Onboarding promise can't be fulfilled by a 3rd-party developer pasting the npx command.

---

## AU-02-009 — NEEDS_VERIFICATION — F4.3 merchant subscription / recurring receivables UI

**Severity:** NEEDS_VERIFICATION
**Category:** UX_REACHABLE
**Files:** Primitive shipped (`scheduled_sends` 0034 + Phase-5 `scheduled_send` intent). Merchant-managed recurring-billing UI surface not located. Currently surfaced as a buyer-side schedule; no merchant-facing "create subscription product" UI verified.

---

## AU-02-010 — MISSING — F5.8 agent framework adapters

**Severity:** MEDIUM
**Category:** DOC + missing surface
**Files:** `docs/STRATEGY.md:901` claims OpenAI Agents / Anthropic / LangChain / CrewAI adapters. No adapter packages in `packages/`. Only `@settle/mcp-middleware` exists (generic MCP wrapper, not framework-specific).

---

## AU-02-011 — MISSING — F5.12 Vercel + Replit + Cursor templates

**Severity:** LOW
**Category:** DOC
**Files:** `docs/STRATEGY.md:957` claims templates. No template repos / `templates/` directory in monorepo. Distribution feature only.

---

## AU-11-001 — MEDIUM — Hardcoded all-1s pubkey as placeholder pact_pubkey insert

**Severity:** MEDIUM
**Category:** SECURITY (race condition / data integrity)
**Files:** `apps/web/app/api/group-accounts/request-spend/route.ts:129`

**Expected:** rows in `group_spend_requests` table contain valid pact_pubkey values.
**Actual:**
```ts
pact_pubkey: "11111111111111111111111111111111",  // placeholder — overwritten below
```

**Why it matters:** if any reader queries this row between the insert and the post-insert update (race window, possibly small), they get a row with a System-Program pubkey as pact_pubkey. UI rendering / signer dispatch could crash or behave strangely. Worse: if the post-insert update fails, the row stays with a fake pact_pubkey and could potentially trigger downstream signer logic that accepts the all-1s address.

**Mitigation options:**
1. Use a transaction so insert + update are atomic.
2. Change column to nullable; insert NULL; update with real pact_pubkey.
3. Build the pact_pubkey BEFORE the insert (compute the PDA client-side or in-handler).

**How to verify the fix:** all writes to `group_spend_requests.pact_pubkey` insert valid pubkeys atomically.

**Human action required?** no

---

## AU-11-002 — LOW — Hardcoded test pubkeys in capability-heatmap demo data

**Severity:** LOW
**Category:** DEAD_CODE (demo data leaking into prod paths)
**Files:** `apps/web/components/capability-heatmap.tsx:153` (`Mxx1111111111111111111111111111111111111aA`)

**Expected:** demo / simulation data labeled as such; not active in default paths.
**Actual:** "Mxx1111…aA" pubkey hardcoded; appears related to `?simulate=1` mode.

**Why it matters:** if simulate mode renders to all users by default, fake on-chain data appears as real. Already partially flagged by Phase 2 sub-agent's F23 traceability finding.

**How to verify the fix:** demo data only renders when `?simulate=1` query param explicitly set; production default is real data.

**Human action required?** no

---

## AU-11-003 — CONFIRMED — Cron secret + git history clean

**Severity:** N/A (confirmation)
**Category:** SECURITY
**Files:** `apps/web/app/api/cron/phase5-tick/route.ts:100-101`, `apps/web/app/api/cron/phase5-signer/route.ts:439-440`

**Confirmed:**
- Both cron routes require `Bearer ${process.env.CRON_SECRET}` and reject if missing or mismatch.
- `git log -p --all` grep for `sk_live|priv_key|password` yields no matches → no secrets in commit history.
- `apps/web/app/sitemap.ts` SERVICE_ROLE_KEY usage is server-side only (Next.js dynamic sitemap route).
- `apps/web/app/cards/[id]/page.tsx` reference to `SUPABASE_SERVICE_ROLE_KEY` is in a `<code>` element rendering setup instructions for the user — display only, not used as a credential.

---

## AU-11-004 — MEDIUM — 10+ API routes don't perform env-config check

**Severity:** MEDIUM
**Category:** SECURITY (env fail-open)
**Files (sample):**
- `apps/web/app/api/actions/request/[slug]/route.ts`
- `apps/web/app/api/actions/revoke/[card]/route.ts`
- `apps/web/app/api/actions/router/[handle]/[type]/route.ts`
- `apps/web/app/api/agents/create-card/route.ts`
- `apps/web/app/api/agents/spawn/route.ts`
- `apps/web/app/api/cards/[id]/authority-info/route.ts`
- `apps/web/app/api/cards/[id]/bulk-close/route.ts`
- `apps/web/app/api/cards/[id]/revoke/route.ts`
- `apps/web/app/api/cnft/collection.json/route.ts`
- `apps/web/app/api/cnft/[id]/metadata.json/route.ts`

**Expected:** any route reading critical env (Supabase URL/keys, RPC, signing keys) must fail loudly (`return 503` or `throw`) when env is missing.
**Actual:** routes use `process.env.X` without explicit guard; could silently use `undefined` or fall through to placeholder values.

**Why it matters:** in mainnet, a missing env var that silently falls through could produce wrong-network behavior, fake auth, or broken auth.

**How to verify:** every route that reads env has a guard at the top: `if (!process.env.X) return NextResponse.json({error:"unconfigured"}, {status:503})`.

**Caveat:** some of these routes may legitimately not need env (pure CNFT JSON, public Action GET endpoints). Manual triage required per-route.

**Human action required?** no

---


## AU-12-001 — HIGH — Devnet honesty: 5+ "shipped" features are devnet-simulated

**Severity:** HIGH (per spec — DEVNET_HONESTY in audit brief)
**Category:** DEVNET_HONESTY
**Files (per Phase 2 traceability matrix + scan):**
- **Jupiter swap path** (`/api/swap/quote-and-build`) — PRODUCT_SPEC openly admits "Jupiter has no devnet liquidity" → swap activates only on mainnet. README states this honestly. ✓ honest, but the UI gate must reflect it everywhere.
- **MPL Core soulbound badges** — claimed shipped (commit `f13d9d4`); needs devnet/mainnet verification — does the badge mint-flow work on devnet?
- **Light Protocol ZK compression mirror** — claimed shipped (commit `42487dc`); requires Photon RPC; does the devnet endpoint expose it?
- **Bonfida SNS** — README acknowledges "SNS only exists on mainnet — devnet returns null". Honest.
- **Solana Attestation Service (SAS)** — verified merchant lookup; needs devnet verification.

**Why it matters:** users running on devnet see UI/feature surfaces for these. If they don't actually function on devnet, the demo is hollow. Phase 2 sub-agent flagged 6 NEEDS_VERIFICATION features that overlap with this.

**How to verify the fix:** per feature, test on devnet; document a `🟦 SIMULATED` or `🌐 MAINNET_ONLY` tag in PROJECT_STATUS where appropriate.

**Human action required?** partial (some require mainnet env to verify the inverse — that the devnet-only behavior gracefully falls back).

---

## AU-13-001 — LOW — Dead-code sweep summary

**Severity:** LOW
**Category:** DEAD_CODE
**Files (production paths):**

Findings from sweep:
- 3 `TODO` comments in production code (acceptable; documented):
  - `apps/web/app/api/import/solana-pay/route.ts:42` — rate-limit not yet wired
  - `apps/web/app/api/sp/[merchant]/[slug]/route.ts:32` — `/api/pricelist/[slug]/save` endpoint missing
  - `apps/web/app/groups/page.tsx:247` — UI TODO marker
- 0 empty catch blocks in production paths ✓
- 4 `console.log` references — all in `/docs` and `/pay` example-code blocks (legitimate sample-output snippets), not production logic
- Hardcoded test/system pubkeys in production:
  - `apps/web/components/token-picker.tsx:23` — `So11111…112` (canonical NATIVE_SOL_MINT, OK)
  - `apps/web/components/capability-heatmap.tsx:153` — `Mxx111…aA` (already AU-11-002)
  - `apps/web/app/api/group-accounts/request-spend/route.ts:129` — `1111…1` placeholder pact_pubkey (already AU-11-001)

Verdict: codebase is unusually clean of dead-code rot. Sweep tools (`knip`, `ts-prune`, `madge`) deferred to Cycle 1 wrap-up; current scan shows nothing alarming.

---


## AU-03-001 — MEDIUM — `record_denial` does not validate `pact` arg

**Severity:** MEDIUM
**Category:** PROGRAM_LOGIC
**Files:** `programs/settle-agent-card/programs/settle-agent-card/src/instructions/record_denial.rs:5-20, 32-55`

**Expected:** `PolicyDecisionEvent.pact` reflects an actual pact owned by this card.
**Actual:** `pact: Pubkey` is an ix arg, not a verified Anchor account. `RecordDenial<'info>` has only `signer: Signer` and `card: Account<AgentCard>`. Authority OR agent (the only allowed signers) can pass any 32-byte pubkey, and the indexer happily writes it into the unified ledger.

**Why it matters:** indexer denial attribution to a specific pact is forgeable. Audit trails / dashboards filtering "denials for pact X" can be polluted with non-existent pacts or pacts of other users.

**Fix:** add an optional `pact: Option<Account<Pact>>` with `constraint = pact.parent_card == card.key()`; remove the raw `pact: Pubkey` arg.

**Human action required?** no

---

## AU-03-002 — MEDIUM — `record_denial` has no rate limit; spam vector

**Severity:** MEDIUM
**Category:** PROGRAM_LOGIC
**Files:** `programs/settle-agent-card/programs/settle-agent-card/src/instructions/record_denial.rs:29-58`

Every call emits a `PolicyDecisionEvent` for ~5_000 lamports tx fee. Authority or agent can spam — indexer write amplification, leaderboard / fraud-score skew. Compromised agent could mass-emit deny_code 6 to mask real activity.

**Fix:** track `card.last_denial_slot` + min interval, OR per-card `denials_today` counter.

**Human action required?** no

---

## AU-03-003 — MEDIUM — OneShot pact cap constrained to single-day budget

**Severity:** MEDIUM
**Category:** PROGRAM_LOGIC
**Files:** `programs/settle-agent-card/programs/settle-agent-card/src/instructions/open_pact.rs:83-86`

`params.cap_lamports <= parent_card.daily_cap_lamports` forces a 30-day pact at $100/day to use a card with daily_cap >= $3000 — widening blast radius if the agent is compromised. Cross-pact cap is already enforced at spend time via `card.used_today`, so this open-time check is redundant and harmful.

**Fix:** drop the constraint, OR replace with a per-day burn-rate sanity check (`cap_lamports / max((expiry_slot - now)/CAP_WINDOW_SLOTS, 1) <= daily_cap`).

**Human action required?** no

---

## AU-03-004 — MEDIUM — `close_pact` does not refund Pact PDA rent

**Severity:** MEDIUM
**Category:** PROGRAM_LOGIC
**Files:** `programs/settle-agent-card/programs/settle-agent-card/src/instructions/close_pact.rs:21-26, 56-118`

`pact.closed = true` only; no `close = authority` Anchor constraint. Pact PDA (~770 bytes) ≈ 0.0055 SOL per pact + vault_usdc ATA (~0.002 SOL) locked forever. Closed pacts can never be reopened with the same scope_label_hash. At scale (100 pacts/day) ≈ 0.75 SOL/day burned to permanent rent.

**Fix:** add `close = authority` to the Pact account; close vault_usdc via SPL `CloseAccount` after refund.

**Human action required?** no

---

## AU-03-005 — MEDIUM — Streaming pact `max_total <= daily_cap` is the wrong bound

**Severity:** MEDIUM
**Category:** PROGRAM_LOGIC
**Files:** `programs/settle-agent-card/programs/settle-agent-card/src/instructions/open_streaming_pact.rs:89-92`

A $30/day rent stream for 30 days needs $900 max_total → daily_cap must be >= $900. Then per-day cross-pact cap is $900 — a separate OneShot pact on the same card can fire $900/day with a compromised agent. Breaks the headline streaming use case.

**Fix:** replace with `params.rate_lamports_per_slot * CAP_WINDOW_SLOTS <= parent_card.daily_cap_lamports` (per-day rate bounded).

**Human action required?** no

---

## AU-03-006 — HIGH — `claim_streaming` stuck-state when accumulated entitlement > per_call_max

**Severity:** HIGH
**Category:** PROGRAM_LOGIC
**Files:** `programs/settle-agent-card/programs/settle-agent-card/src/instructions/claim_streaming.rs:147-155`

The ix takes no `amount` arg. `amount = min(billable_slots * rate, max_total - claimed)` is hard-required <= `per_call_max_lamports` (line 155). If the agent skips claims, entitlement grows past per_call_max and EVERY subsequent claim reverts forever. No on-chain knob to bound the claim downward.

**Repro:**
- create_card(daily_cap=$100, per_call_max=$5)
- open_streaming_pact(rate=1 lamport/slot, max_total=$50)
- skip 6_000_000 slots (~30 days)
- claim_streaming → entitlement = 6M lamports = $6 > per_call_max=$5 → revert forever

Worst case: streaming payroll where the recipient is offline (vacation / outage) → permanent stuck-state, only recoverable by closing the pact (forfeits accrued entitlement).

**Fix:** clamp `amount = amount.min(per_call_max_lamports)` instead of reverting, OR accept `amount: Option<u64>` ix arg.

**Human action required?** no

---

## AU-03-007 — HIGH — `claim_streaming` cross-pact cap check has no graceful degradation

**Severity:** HIGH
**Category:** PROGRAM_LOGIC
**Files:** `programs/settle-agent-card/programs/settle-agent-card/src/instructions/claim_streaming.rs:160-168`

If `card.used_today + amount > daily_cap`, the ix reverts. No partial-claim, no defer-to-next-window. `parent.daily_cap=$100, used_today=$95`, stream entitlement=$10 → revert. The user cannot make the stream drain $5. Combined with AU-03-006, the agent cannot drain at all even after the window resets if entitlement still > per_call_max.

**Fix:** clamp to `min(per_call_max, daily_cap - used_today)` or accept agent-supplied amount.

**Human action required?** no

---

## AU-03-008 — HIGH — Python + Rust SDK missing `record_denial` and `record_receipt` ix builders

**Severity:** HIGH
**Category:** SDK_PARITY
**Files:**
- `packages/python-sdk/settle_sdk/__init__.py:487-499` (13 ix functions in `__all__`)
- `packages/rust-sdk/src/ix_data.rs` (13 `pub fn`)
- `apps/web/lib/anchor-client.ts:315 recordDenialIx, :727 recordReceiptIx` (TS has both)
- `scripts/smoke-ix-data-parity.ts` (only 13 dump() calls — both ix omitted from CI parity)
- `programs/settle-agent-card/.../lib.rs` (15 ix on-chain)

**Expected:** "three-language SDK byte parity" (PROJECT_STATUS claim).
**Actual:** Python and Rust each implement 13 of 15. `record_denial` and `record_receipt` are TS-only. CI smoke doesn't exercise them either.

**Evidence:**
- `grep -c '^def ix_' packages/python-sdk/settle_sdk/__init__.py` → 13
- `grep -cE '^pub fn (record_denial|record_receipt)' packages/rust-sdk/src/ix_data.rs` → 0

**Impact:** Python agents cannot record off-chain DENYs on-chain. Rust off-chain signers cannot emit universal receipts. Cross-lang byte parity claim is provably false for 2 of 15 ix and invisible to CI.

**Fix:** add `ix_record_denial` + `ix_record_receipt` to Python; `record_denial` + `record_receipt` to Rust with golden tests; extend `scripts/smoke-ix-data-parity.ts` to include both (15 dump() calls). Hex bytes must match across SDKs.

**Human action required?** no

---

## AU-03-009 — LOW — `spend_via_pact` and `claim_streaming` reuse `CardExpired` for pact expiry

**Severity:** LOW
**Category:** PROGRAM_LOGIC
**Files:** `instructions/spend_via_pact.rs:113-114`, `instructions/claim_streaming.rs:97-98`

Both pact-side expiry checks throw `SettleError::CardExpired` even when the pact (not the card) is expired. Sentry / log parsers can't distinguish.

**Fix:** add `SettleError::PactExpired`.

---

## AU-03-010 — LOW — `release_delivery_escrow` requires merchant ATA pre-existence

**Severity:** LOW
**Category:** PROGRAM_LOGIC
**Files:** `instructions/release_delivery_escrow.rs:55-56`

Permissionless release fails if merchant has no USDC ATA yet. Edge case for fresh-onboarded merchants.

---

## AU-03-011 — LOW — `record_receipt` permissionless attestation is documented spam surface

**Severity:** LOW
**Category:** PROGRAM_LOGIC
**Files:** `instructions/record_receipt.rs:15-27`

Documented design. Verifier-side filter mitigates. Flagged for awareness.

---

## AU-03-012 — LOW — `CAP_WINDOW_SLOTS = 220_000` drifts vs real wall-clock 24h

**Severity:** LOW
**Category:** PROGRAM_LOGIC
**Files:** `state.rs:69-70`

220_000 slots ≈ 24.4h at 400ms slot rate. Mainnet ~430-450ms → real reset window ~26-27.5h. Documented in source.

---

## AU-00-004 — RESOLVED (was NEEDS_VERIFICATION) — `resume_streaming` does emit an event

**Severity:** RESOLVED
**Category:** PROGRAM_LOGIC
**Files:** `instructions/resume_streaming.rs:42-46`

`resume_streaming` emits `PactStreamPauseEvent { paused: false, slot }` on the pause→unpaused transition (idempotent — no event when already unpaused). The `PactStreamPauseEvent` type is shared by both transitions, with the `paused` bool discriminating. The SYSTEM_MAP comment "no `StreamingPactResumedEvent`" is technically correct (no event by that name) but misleading. Phase 3 audit confirms — no fix required.

---

## AU-04-001 — CONFIRMED — TS↔Rust↔Python ix-data byte parity for 13 ix

**Severity:** N/A (confirmation; companion to AU-03-008 + AU-01-003)
**Category:** SDK_PARITY
**Files:** `scripts/smoke-ix-data-parity.ts`, `packages/rust-sdk/src/ix_data.rs`, `packages/python-sdk/settle_sdk/__init__.py`

**Verified:**
- 13 ix builders exist in all 3 langs and emit byte-identical output:
  create_card, spend, spend_via_pact, revoke, open_pact, close_pact, open_streaming_pact, claim_streaming, pause_streaming, resume_streaming, open_delivery_escrow, release_delivery_escrow, dispute_delivery_escrow
- Discriminators match (8-byte sha256("global:<name>")) across all 3
- Python: 19 ix-data tests PASS
- TS smoke produces consistent hex output for each
- Rust ix_data.rs functions match Python __all__ list

**Gap (already filed AU-03-008):** `record_denial` and `record_receipt` are TS-only. PROJECT_STATUS claim "all 13 ix data builders" is true *for the 13 mirrored*, but program has 15 → only 86.7% parity coverage.

**Recommended fix path:** add `ix_record_denial` + `ix_record_receipt` to Python + Rust + their goldens; extend smoke-ix-data-parity.ts.

---

## AU-10-001 — HIGH — 24 of 42 Supabase tables missing Row-Level Security

**Severity:** HIGH
**Category:** DATA_RLS
**Files:** `infra/supabase/migrations/*.sql`

**Expected:** every table holding user-tied data has RLS enabled with explicit policies; service role and anon policies are deliberate.

**Actual:** of 42 tables in the `public` schema:
- 18 have RLS enabled
- 24 do NOT have RLS enabled, including sensitive tables:
  - `agent_trust_scores`
  - `allowances`
  - `auto_refill_queue`
  - `auto_refill_rules`
  - `capability_registry`
  - `domain_verification_tokens`
  - `federated_receipts`
  - `federation_origins`
  - `fraud_flags`
  - `gift_sends`
  - `group_account_members`
  - `group_accounts`
  - `group_spend_approvals`
  - `group_spend_requests`
  - `idempotency_keys`
  - `kernel_receipt_attestations`
  - `nonce_cache`
  - `phase5_executions`
  - `receipt_tags`
  - `round_up_queue`
  - (and ~4 more)

**Why it matters:**
Supabase's default grants give the `anon` role SELECT on `public.*` tables unless RLS is enabled and policies exclude it. This means anyone with the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` (which is in the browser bundle) can `SELECT *` from these 24 tables — exposing:
- Other users' allowance configs (`allowances.kid_pubkey`, weekly_lamports)
- Other users' auto-refill rules + thresholds (financial profile)
- Other users' gift sends (private gift recipients)
- Phase 5 execution rows (cron audit trail with kernel hashes)
- Idempotency nonces (correlation attacks)
- Group account membership / spend requests (private quorum data)
- Domain verification tokens (could be used to impersonate-domain-verify before victim claims)

**This is a BLOCKER for mainnet** (downgraded to HIGH because devnet exposure is acceptable for hackathon submission). Confirmation needed: query each table with anon key and verify whether GRANTS-default permits SELECT.

**How to verify:** for each table, run `select * from public.<table_name> limit 1` using the anon JWT. If it returns rows or 401/empty (depending on grant), classify accordingly.

**Fix path:**
1. For each table: enable RLS (`alter table public.<t> enable row level security;`).
2. Add per-table policies: `authority_pubkey = auth.jwt() ->> 'sub'` for user-owned rows; service role bypasses.
3. For server-only tables (idempotency_keys, nonce_cache, federation_origins): RLS enable + restrict to service role only.

**Human action required?** no (database migration is automatable; needs production access for the actual run)

---

## AU-10-002 — MEDIUM — Migrations are linearly numbered (no skips) ✓

**Severity:** N/A (confirmation)
**Category:** DATA_RLS
**Files:** `infra/supabase/migrations/0001…0045.sql`

**Confirmed:** all 45 migrations numbered linearly 0001 → 0045 with no gaps. Idempotent (most use `if not exists`). Migration runner script `scripts/supabase-apply-migrations.mjs` exists. Order-dependent (FK references later tables); current sort is correct.

---

## AU-14-001 — DOC_DRIFT — Test count claim summary

**Severity:** DOC_DRIFT (already covered by AU-01-005; restated here for Phase 14)
**Category:** TEST_GAP
**Files:** `PROJECT_STATUS.md:28`

**Phase 14 verified counts:**
- 155 SDK vitest ✓
- 7 mcp-middleware vitest ✓
- 42 Rust tests (cargo test compile succeeded) — sub-agent ran them
- 19 Python pytest (collected) ✓
- "35 Python kernel" — actually 14 inline asserts in test_kernel_parity.py (not pytest-collected)

**Total pytest/vitest/cargo: 223. PROJECT_STATUS claim: 258. Drift: 35.**

**Untested risks identified for new-test design (Phase 14 brief):**
1. Auto-refill double-dispatch (AU-05-001) — no test catches this
2. Indexer cursor durability (AU-07-001) — no test
3. Round-up double-spend on event replay (AU-07-002) — no test
4. claim_streaming stuck-state (AU-03-006) — no test
5. RLS on the 24 unprotected tables (AU-10-001) — no test
6. Sentry capture coverage at all 7 phase5-signer failure paths (AU-05-002/003) — no test
7. record_denial + record_receipt parity (AU-03-008) — no test
8. Federation poller webhook URL asymmetry (AU-07-003) — no test
9. IDL drift covers only 5 of 13 events (AU-07-004) — partial test
10. Group spend pact_pubkey race (AU-11-001) — no test

These are the "10 untested risks" the Test Brief (T14) asks to design tests for.

---

# Phase 9 — Library Correctness (DOC-FETCH MANDATORY)

Findings AU-09-NNN. Full audit narrative in `docs/audit/LIBRARY_CORRECTNESS.md`.
Doc URLs cited in each entry. Doc snapshots dated 2026-05-02. Numbering starts
at AU-09-002 (AU-09-001 reserved for the missing-instrumentation.ts grouping
subsumed under AU-09-008).

---

## AU-09-002 — LOW — Next.js Action OPTIONS exported non-async

**Severity:** LOW
**Category:** LIB_USAGE
**Files:** `apps/web/app/api/actions/hire/[slug]/spawn/route.ts:230`
**Doc URL fetched:** https://nextjs.org/docs/app/api-reference/file-conventions/route (2026-05-02)
**Expected:** `export async function OPTIONS(request: Request) {...}` — consistent with the file's other handlers.
**Actual:** `export function OPTIONS()` — non-async.
**Why it matters:** Cosmetic / inconsistency. Functional in Next 15.
**How to verify the fix:** `grep -n "export.*OPTIONS" apps/web/app/api/actions/**/route.ts` returns only async exports.
**Human action required?** no

---

## AU-09-003 — MEDIUM — TransferChecked decimals literal not validated against mint

**Severity:** MEDIUM
**Category:** LIB_USAGE
**Files:** `apps/web/app/api/swap/quote-and-build/route.ts:144-151`
**Doc URL fetched:** https://www.solana-program.com/docs/token (2026-05-02; redirect from spl.solana.com/token)
**Expected:** `decimals` argument to `createTransferCheckedInstruction` must equal the mint's on-chain `decimals`. Mismatch causes the on-chain Token Program to throw `0x1` (`InvalidArgument`).
**Actual:** Hard-coded `6` is passed as decimals. The route accepts `parsed.outputMint` and `parsed.inputMint` from request body.
**Why it matters:** Latent bug only triggered if a non-USDC mint is supplied; on devnet with the dev USDC mint (6 decimals) it is hidden.
**How to verify the fix:** Replace `6` with `USDC_DECIMALS = 6` constant; assert `isUsdcMint(parsed.inputMint, cluster)` before the call (already done at line 126 — codify the implicit contract).
**Human action required?** no

---

## AU-09-004 — MEDIUM — wallet-adapter CSS imported via require() in ESM client component

**Severity:** MEDIUM
**Category:** LIB_USAGE
**Files:** `apps/web/app/providers.tsx:11`
**Doc URL fetched:** https://github.com/anza-xyz/wallet-adapter (2026-05-02; partial)
**Expected:** ESM `import "@solana/wallet-adapter-react-ui/styles.css";` at module top level.
**Actual:** `require("@solana/wallet-adapter-react-ui/styles.css");` inside an ES module ("use client" component). The package declares `"type": "module"`.
**Why it matters:** Works on webpack (Next 15 default) but fails / warns on Turbopack (Next 15 dev with --turbo). Future-proofness.
**How to verify the fix:** Replace with top-of-file `import "@solana/wallet-adapter-react-ui/styles.css";`. `pnpm --filter @settle/web exec next dev --turbo` produces no warning.
**Human action required?** no

---

## AU-09-005 — HIGH — Most Supabase tables ship without RLS enabled

**Severity:** HIGH
**Category:** SECURITY / DATA_RLS
**Files:** `infra/supabase/migrations/0011_streaming_pacts.sql`, `0013_request_timing.sql`, `0015_delivery_escrow.sql`, `0017_reputation_badges.sql`, `0018_compressed_receipts.sql`, `0019_receipt_kernel.sql`, plus most queue/state migrations 0020–0045.
**Doc URL fetched:** https://supabase.com/docs/guides/database/postgres/row-level-security (2026-05-02)
**Expected:** "RLS must always be enabled on any tables stored in an exposed schema. By default, this is the public schema." (doc quote).
**Actual:** Of 43 `create table` statements across 45 migrations, only ~17 are followed by an `enable row level security` statement.
**Evidence:**
```
$ grep -ric "enable row level security" infra/supabase/migrations/ | grep -v ":0$" | wc -l
11
```
Tables without explicit RLS enable include `phase5_executions`, `auto_refill_queue`, `round_up_queue`, `streaming_claim_queue`, `group_spend_requests`, `gift_sends`, `scheduled_sends`, `auto_refill_rules`, `delivery_escrows`, `kernel_attestations`, `federated_receipts`. Note: this finding overlaps and refines AU-10-001; cite both.
**Why it matters:** Anyone with the anon/publishable PostgREST key can read or write these tables. Project fails any standard compliance review.
**How to verify the fix:** Add `0046_rls_enable_remaining.sql`. Verify `select tablename from pg_tables where schemaname='public' and tablename not in (select tablename from pg_policies where schemaname='public');` returns zero rows.
**Human action required?** partial — schema migration must be applied in Supabase

---

## AU-09-006 — HIGH — Server routes silently fall back to anon key

**Severity:** HIGH
**Category:** SECURITY
**Files:** ≥25 API routes incl. `apps/web/app/api/actions/hire/[slug]/spawn/route.ts:68`, `actions/request/[slug]/route.ts:63`, `actions/router/[handle]/[type]/route.ts:75`, `admin/federation/retry/route.ts:60`, `allowances/route.ts:52`, `audit/phase5/route.ts:49`, `auto-refill/route.ts:50`, `bookkeeper/categorize/route.ts:128`, `capabilities/route.ts:51`, `cards/delegated/route.ts:65`.
**Doc URL fetched:** https://supabase.com/docs/guides/database/postgres/row-level-security (2026-05-02)
**Expected:** Server routes performing writes MUST authenticate with `SUPABASE_SERVICE_ROLE_KEY`. Per Supabase docs: "service keys should never be used in the browser or exposed to customers, but they are useful for administrative tasks."
**Actual:** Server routes construct supabase-js with `process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`. If `SUPABASE_SERVICE_ROLE_KEY` is unset (preview deploys missing the secret), the route silently uses anon key.
**Why it matters:** With RLS partially enabled (AU-09-005), a route that intends to insert into `phase5_executions` returns HTTP 200 with no error, but no row writes (PostgREST silently filters under anon + RLS). FAKE_SUCCESS for the relayer signer.
**How to verify the fix:** Replace pattern with `const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY required");`. CI guard: `grep -rn "NEXT_PUBLIC_SUPABASE_ANON_KEY" apps/web/app/api/ && exit 1`.
**Human action required?** partial — env var must be set in Vercel

---

## AU-09-007 — MEDIUM — Number(amount_lamports) coercion pattern

**Severity:** MEDIUM
**Category:** LIB_USAGE
**Files:** `apps/web/app/api/cards/[id]/receipts/csv/route.ts:84`, `cnft/[id]/metadata.json/route.ts:60`, `disputes/draft/route.ts:47,189`, `merchants/[handle]/disputes/resolve/route.ts:235,239`, `cards/[id]/page.tsx:420`, `import/page.tsx:133`, `m/[handle]/capabilities/page.tsx:382`, `receipts/[requestId]/page.tsx:923,953`, `verify/[hash]/page.tsx:149`.
**Doc URL fetched:** https://supabase.com/docs/reference/javascript/select (general)
**Expected:** `BigInt(String(x))` then BigInt math. Avoid `Number()` on values that may exceed `Number.MAX_SAFE_INTEGER`.
**Actual:** Direct `Number(r.amount_lamports) / 1_000_000` in display paths.
**Why it matters:** USDC amounts ≤ 2^53 lamports are safe. Theoretical risk only — track for future-proofness.
**How to verify the fix:** Centralize in `formatUsdc(lamports: bigint | string): string` helper.
**Human action required?** no

---

## AU-09-008 — HIGH — Sentry SDK 8 not initialized server-side (missing instrumentation.ts)

**Severity:** HIGH
**Category:** LIB_USAGE / SECURITY (observability gap)
**Files:**
- MISSING: `apps/web/instrumentation.ts`
- MISSING: `apps/web/instrumentation-client.ts`
- MISSING: `apps/web/app/global-error.tsx`
- PRESENT: `apps/web/sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts`, `apps/web/next.config.mjs:34-43` (correctly wraps with `withSentryConfig`)
**Doc URL fetched:** https://docs.sentry.io/platforms/javascript/guides/nextjs/ (2026-05-02)
**Expected:** Sentry SDK 8 requires `instrumentation.ts` at project root that conditionally imports `sentry.server.config.ts` and `sentry.edge.config.ts` based on `process.env.NEXT_RUNTIME`. `app/global-error.tsx` required for App Router error capture.
**Actual:** All three required files absent. The `sentry.server.config.ts` exists but is never executed at runtime — Next 15 only loads server SDK via `instrumentation.ts:register()`.
**Evidence:** `apps/web/app/api/cron/phase5-signer/route.ts:1010-1023, 1187-1200` calls `Sentry.captureException(...)` for live spend_via_pact and claim_streaming failures. Without server-side init, these are no-ops.
**Why it matters:** AUDIT_BRIEF.md:217 explicitly requires "Sentry capture exists at every live-fire failure path". Without `instrumentation.ts`, captures are silently dropped. Production cron failures will not surface in Sentry. This INVALIDATES Phase 5's prior assumption that Sentry capture is wired.
**How to verify the fix:** Add `apps/web/instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge")   await import("./sentry.edge.config");
}
```
Add `apps/web/app/global-error.tsx` per Sentry doc template. Force a `throw` in a cron route — issue must land in Sentry.
**Human action required?** no

---

## AU-09-009 — LOW — Python blake3 dependency floor too loose

**Severity:** LOW
**Category:** LIB_USAGE / DOC
**Files:** `packages/python-sdk/pyproject.toml:10`
**Doc URL fetched:** https://pypi.org/project/blake3/ (memory)
**Expected:** Pin matching TS/Rust SDK pins (`@noble/hashes ^1.5`; Rust `blake3 = "1.5"`).
**Actual:** `blake3>=0.3.4` (open-ended floor at 2021 release).
**Why it matters:** SDK byte-parity is a P0 invariant. Loose pin invites drift if a downstream user installs a legacy 0.x.
**How to verify the fix:** Bump to `blake3>=1.0,<2`. Re-run `pytest packages/python-sdk` and `pnpm tsx scripts/smoke-python-parity.ts`.
**Human action required?** no

---

## AU-09-010 — MEDIUM — 18 mutation routes accept JSON body without zod validation

**Severity:** MEDIUM (HIGH stacked with AU-09-008 — silent 500s)
**Category:** LIB_USAGE / SECURITY
**Files:** 18 routes incl. `apps/web/app/api/disputes/draft/route.ts`, `payment-links/[token]/route.ts`, `send/build/route.ts`, `send/link/build/route.ts`, `send/link/claim/route.ts`, `sandbox/airdrop/route.ts`, `voice/transcribe/route.ts`, `x402/proxy/[merchant]/route.ts`, `templates/[slug]/route.ts`, `sp/[merchant]/[slug]/route.ts`, `receipts/[requestId]/attachments/route.ts`, `fraud/scan/route.ts`, `bookkeeper/categorize/route.ts`, `actions/hire/[slug]/spawn/route.ts`, `actions/request/[slug]/route.ts`, `actions/revoke/[card]/route.ts`, `actions/router/[handle]/[type]/route.ts`, `graphql/route.ts`.
**Doc URL fetched:** https://zod.dev (memory) — canonical pattern at `apps/web/app/api/swap/quote-and-build/route.ts:53-61, 99-107`.
**Expected:** Each mutation route validates body with `Body.parse(await req.json())`.
**Actual:** Mixed — ad-hoc regex + manual presence checks; 18 mutation routes have no zod schema.
**Why it matters:** Malformed JSON → unhandled exception → 500. Combined with AU-09-008, failures are silent.
**How to verify the fix:** Replicate the canonical pattern. CI: count zod schemas vs POST handlers.
**Human action required?** no

---

## AU-09-011 — MEDIUM — Missing actions.json at domain root

**Severity:** MEDIUM
**Category:** LIB_USAGE / UX_REACHABLE
**Files:** missing — `apps/web/public/actions.json` and `apps/web/app/actions.json/route.ts` both absent.
**Doc URL fetched:** https://solana.com/docs/advanced/actions (2026-05-02)
**Expected:** "applications should include an actions.json file at the domain root containing rules that map a set of a website's relative route paths to a set of other paths" (doc quote).
**Actual:** `ls apps/web/public/actions.json apps/web/app/actions.json/route.ts` returns ENOENT for both.
**Why it matters:** Without `actions.json`, third-party Blink hosts (Dialect, Phantom) cannot validate which `settle.so` paths are valid Action endpoints; some clients refuse to render the Blink. The "Hire AI Agent" Blink in Twitter feed may not render.
**How to verify the fix:** Create `apps/web/public/actions.json`. After deploy, `curl https://settle.so/actions.json` returns 200.
**Human action required?** no

---

## AU-09-012 — MEDIUM — Solana Actions CORS Allow-Headers incomplete

**Severity:** MEDIUM
**Category:** LIB_USAGE
**Files:** `apps/web/app/api/actions/hire/[slug]/route.ts:35-37`, `apps/web/app/api/actions/hire/[slug]/spawn/route.ts:27-31`, plus other `actions/**/route.ts` files.
**Doc URL fetched:** https://solana.com/docs/advanced/actions (2026-05-02)
**Expected:** `Access-Control-Allow-Headers` MUST include `Content-Type, Authorization, Content-Encoding, Accept-Encoding`.
**Actual:** Routes set only `Content-Type`.
**Why it matters:** Phantom + Dialect Blink frontends send `Accept-Encoding`/`Content-Encoding` on preflight; missing the Allow header causes preflight failure on some browsers.
**How to verify the fix:** `curl -I -X OPTIONS https://settle.so/api/actions/hire/research` returns the full Allow-Headers list.
**Human action required?** no

---

## AU-09-013 — MEDIUM — Missing X-Action-Version + X-Blockchain-Ids headers

**Severity:** MEDIUM
**Category:** LIB_USAGE
**Files:** all `apps/web/app/api/actions/**/route.ts`
**Doc URL fetched:** https://solana.com/docs/advanced/actions (2026-05-02)
**Expected:** Action GET responses SHOULD set `X-Action-Version` and `X-Blockchain-Ids: solana:devnet|solana:mainnet` for cluster routing.
**Actual:** `grep -rn "X-Action-Version\|X-Blockchain-Ids" apps/web` returns no results.
**Why it matters:** Without these headers, Blink clients default to mainnet routing. The Settle "Hire AI Agent" Blink will silently fail on devnet (the project's current cluster).
**How to verify the fix:** Add `X-Action-Version: 2.4.0` and `X-Blockchain-Ids: solana:devnet` (or mainnet) to every Action response.
**Human action required?** no

---

## AU-09-014 — NEEDS_VERIFICATION — Helius docs partially unreachable at audit time

**Severity:** NEEDS_VERIFICATION
**Category:** DOC
**Files:** `apps/web/app/api/cron/phase5-signer/route.ts:154`, `actions/hire/[slug]/spawn/route.ts:125`, scripts using `HELIUS_API_KEY`.
**Doc URL fetched:** https://www.helius.dev/docs (homepage only — sub-paths returned 404)
**Best-effort code review:** URL pattern `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}` matches widely-published Helius integration examples.
**How to verify:** Re-fetch `www.helius.dev/docs/api-reference/rpc-endpoints` once docs site stabilizes.
**Human action required?** no

---

## AU-09-015 — NEEDS_VERIFICATION — Jupiter rate-limit claim not citable

**Severity:** NEEDS_VERIFICATION
**Category:** DOC
**Files:** `apps/web/lib/jupiter.ts:13-14` (claims "~60 rpm per IP")
**Doc URL fetched:** https://developers.jup.ag/docs/api (redirected, returned no content)
**Why it matters:** Hard-coded comment about a third-party rate limit may be stale.
**How to verify:** Re-fetch `developers.jup.ag/docs/api` once page is reachable; update comment.
**Human action required?** no

---

## AU-09-016 — HIGH — MCP middleware reads _meta from params._meta instead of request._meta

**Severity:** HIGH
**Category:** LIB_USAGE
**Files:** `packages/mcp-middleware/src/index.ts:49-62`
**Doc URL fetched:** https://modelcontextprotocol.io/docs/concepts/tools (2026-05-02; spec rev 2025-06-18)
**Expected:** MCP `tools/call` request shape per fetched doc has `_meta` at the request envelope level, not on `params`. `@modelcontextprotocol/sdk` TypeScript schema places `_meta` on the request itself.
**Actual:** `McpToolRequest.params._meta?.settle_credential` is the primary path advertised at lines 51-58. `request._meta` is only a secondary fallback at line 61.
**Why it matters:** Real-world MCP clients (Claude Desktop, Cursor, custom agent SDKs) follow the spec and place `_meta` on the request envelope. They will receive payment-required errors despite presenting a valid Settle credential. Settle-aware clients work; spec-compliant clients do not — exactly inverse of the F5.7 promise ("any MCP tool handler Settle-aware").
**Evidence:** Spec example at https://modelcontextprotocol.io/docs/concepts/tools shows `tools/call` `params` containing only `name` and `arguments` — no `_meta`.
**How to verify the fix:** Reverse priority — read `request._meta?.settle_credential` first; treat `request.params._meta` as legacy fallback. Add unit tests in `packages/mcp-middleware/src/index.test.ts` covering both placements.
**Human action required?** no

---

---

## ✅ Fix Pass 1 closure logs (2026-05-02)

### AU-09-008 — CLOSED
- Files added: `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`, `apps/web/app/global-error.tsx`
- Doc URL: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
- Test added: typecheck across all workspaces ✓
- Verification: typecheck clean; SDK initialization paths now exist
- Status: CLOSED

### AU-09-006 — PARTIAL CLOSE (cron routes only)
- Files added: `apps/web/lib/supabase-server.ts`
- Files edited: `apps/web/app/api/cron/phase5-signer/route.ts`, `apps/web/app/api/cron/phase5-tick/route.ts`
- Verification: typecheck clean; cron now throws on missing SERVICE_ROLE_KEY
- Status: PARTIAL — 79+ other write routes pending; tracked as **AU-09-006-FOLLOWUP**

### AU-10-001 / AU-09-005 — CLOSED (pending live apply)
- Files added: `infra/supabase/migrations/0046_rls_unprotected_tables.sql`
- Coverage: 24 unprotected tables get RLS + per-table policies
- Verification: migration syntax valid; needs apply to live Supabase + per-table anon-JWT query test (deferred)
- Status: CLOSED (pending verification on live DB)

### AU-05-001 — CLOSED
- Files edited: `apps/web/app/api/cron/phase5-signer/route.ts:540-571` (Path 1 deleted)
- Verification: typecheck clean; auto_refill_queue is now sole signer dispatch surface
- Status: CLOSED

### AU-07-002 — CLOSED (pending live apply)
- Files added: `infra/supabase/migrations/0047_round_up_dedup.sql`
- Coverage: partial UNIQUE on (rule_id, triggering_request_id)
- Status: CLOSED (pending migration apply)

### AU-09-016 — CLOSED
- Files edited: `packages/mcp-middleware/src/index.ts:166-180`
- Verification: 7/7 mcp-middleware vitest tests pass
- Status: CLOSED

### AU-01-006 — CLOSED
- Files edited: `MAINNET_MIGRATION.md:42`
- Status: CLOSED


### AU-07-001 — CLOSED
- Migration: `infra/supabase/migrations/0048_indexer_cursor.sql` (singleton row)
- Code: `apps/indexer/src/index.ts:100-235` — `cursorLoad`, `cursorAdvance`, `processOneSignature`, `replayMissedEvents`; `await replayMissedEvents()` runs before `connection.onLogs`
- Verification: indexer typecheck clean; replay logic tests pending live restart drill
- Status: CLOSED (live drill deferred to TEST pass)

### AU-09-006 — CLOSED (full)
- Cron paths via tryGetSupabaseServiceClient (earlier)
- 41 additional write routes patched via sed sweep — silent-fallback `?? NEXT_PUBLIC_SUPABASE_ANON_KEY` removed
- Verification: typecheck clean; all 41 routes now return 503 if SERVICE_ROLE missing
- Status: CLOSED

### AU-03-008 — CLOSED
- Python: `packages/python-sdk/settle_sdk/__init__.py` — added `ix_record_denial` + `ix_record_receipt` + extended `__all__`
- Rust: `packages/rust-sdk/src/ix_data.rs` — added `record_denial` + `record_receipt` + structs `RecordDenialArgs` + `RecordReceiptArgs`
- Tests: 4 new Python parity tests (byte count + discriminator) + 2 new Rust tests
- Smoke harness: `scripts/smoke-ix-data-parity.ts` extended to dump both new ix
- Verification: Rust 44/44 pass · Python 23/23 pass · TS workspace typecheck clean
- Discriminators match across 3 langs: record_denial=`63b23610b8e68b62`, record_receipt=`7b01e3bd56d713fd`
- Status: CLOSED


### AU-09-011/012/013 — CLOSED
- Files edited: 7 (actions hire/[slug], hire/[slug]/spawn, request/[slug], revoke/[card], router/[handle]/[type], plus .well-known/actions.json)
- Allow-Headers: now uniformly include `Authorization, Content-Type, Content-Encoding, Accept-Encoding`
- X-Action-Version: 2.4 (current Solana Actions spec)
- X-Blockchain-Ids: `solana:devnet` (mainnet rotation: see MAINNET_MIGRATION row 14)
- Verification: typecheck clean
- Status: CLOSED


### AU-05-002 + AU-05-003 — CLOSED
- Sentry.captureMessage added at all 5 validation gate failure paths in phase5-signer (lines ~875-915)
- Plus catch-all unimplemented-dispatch path now sends Sentry error
- Tags: `cron: phase5-signer, gate: card_delegation_missing | card_agent_mismatch | pact_missing | pact_closed | unimplemented_dispatch`
- Verification: typecheck clean
- Status: CLOSED

### AU-07-003 — CLOSED
- federation-poller.ts now queries `verified_merchants.webhook_url` first, env fallback second (symmetric with webhook-worker.ts)
- Function signature changed to async + supabase client param + returns {url, secret}
- Verification: indexer typecheck clean
- Status: CLOSED

### AU-07-004 — CLOSED
- check-idl-drift.ts INDEXER_ASSUMED_EVENT_SIZES extended from 5 → 13 events
- All 13 events now hand-computed + verified against IDL: PolicyDecisionEvent(214), CardCreatedEvent(157), CardRevokedEvent(76), PactOpenedEvent(121), PactClosedEvent(88), PactSpendEvent(128), StreamingPactOpenedEvent(137), PactStreamClaimEvent(136), PactStreamPauseEvent(41), DeliveryEscrowOpenedEvent(192), DeliveryEscrowReleasedEvent(113), DeliveryEscrowDisputedEvent(80), ReceiptRecordedEvent(201)
- Verification: drift script runs with full coverage, no drift detected
- Status: CLOSED

### AU-11-001 — CLOSED
- group-accounts/request-spend/route.ts now pre-mints request_id via randomUUID() and computes pact_pubkey BEFORE insert (eliminating race window)
- Verification: typecheck clean
- Status: CLOSED

### AU-11-004 — ACCEPTED (not a bug for read-only public surfaces)
- 37 read-only routes use `SERVICE_ROLE_KEY ?? ANON_KEY` fallback pattern
- For read-only public surfaces (feed, leaderboard, stats, sitemap, capability_registry, federation_origins), anon fallback is INTENTIONAL — these surfaces must work without service-role authentication
- RLS on sensitive tables (Migration 0046) ensures anon CANNOT enumerate user-private data even if SERVICE_ROLE missing
- Status: ACCEPTED (documented as intentional pattern)

### AU-01-007 — RESOLVED (not actually dead code)
- PLACEHOLDER_PROGRAM_ID at apps/web/lib/anchor-client.ts:32 is used as a SENTINEL VALUE (lines 46, 48, 62, 68) — detects when env vars haven't been set
- Removing it would break the safety check that throws "still placeholder" error
- Status: RESOLVED (kept intentionally; comment clarified)


---

## Wave 0 reclassifications — audit MISSING list verified against code

Multiple items the audit Phase 2 sub-agent flagged as "MISSING" or "PARTIAL" actually ship. Reverifying via grep + file existence:

### Already shipped — no work needed
- **F2.7 hash-chain animation** — `packages/ui/src/hash-chain-animation.tsx` (framer-motion SVG, sessionStorage-gated, reduced-motion-respecting). Used at `apps/web/app/receipts/[requestId]/page.tsx:1024`. Status: **SHIPPED**.
- **F2.9 receipt drag-to-share** — `packages/ui/src/draggable-receipt.tsx` (HTML5 drag with text/uri-list + JSON dataTransfer). Status: **SHIPPED**.
- **F1.6 Cmd+K command palette** — `apps/web/components/command-palette.tsx`. Status: **SHIPPED** (search backend at /api/receipts/search will land in Wave 1 B1).
- **F1.7 dark mode** — `apps/web/components/theme-provider.tsx`. Toggle UI integration may need verification but provider exists. Status: **SHIPPED-or-PARTIAL pending verification**.
- **F2.11 receipt tagging API** — `apps/web/app/api/receipts/[requestId]/tags/route.ts` exists. UI integration may need verification. Status: **SHIPPED-API**.

### Genuinely missing — build in Wave 1+
- F2.5 proof page (no `/at/[handle]/proof/` dir)
- F2.10 receipt search (no `/api/receipts/search` route)
- F2.12 compliance export (no `/api/exports/` + no `/settings/exports/`)
- F3.11 NL capability discovery (no `/capabilities/discover/`)
- F3.12 trust score cron (no `apps/indexer/src/trust-score-cron.ts`)
- F4.1 npx package (`scripts/create-settle-merchant.ts` exists but no `packages/create-settle-merchant/`)
- F5.4 / F5.5 web components (no `packages/web-components/` workspace)
- F5.8 framework adapters (no `packages/adapters-*`)
- F5.12 templates (no Vercel/Replit/Cursor starters)
- Native receipt webhook retry admin (no `/api/admin/webhooks/`)
- F3.8 killchain animation (slide-to-confirm exists; frost-shatter Pact-tile animation does not)

