# INDEXER_AUDIT.md — Phase 7

Audit of `apps/indexer/` end-to-end. Cross-references `programs/.../events.rs`, `apps/indexer/src/index.ts`, the helper script `scripts/audit-indexer-handlers.ts`, `scripts/check-idl-drift.ts`, and `infra/supabase/migrations/*.sql`.

Date: 2026-05-02. Auditor: senior protocol architect.

---

## 1. Subscriber + dispatch mechanism

`apps/indexer/src/index.ts:105-166` — single `connection.onLogs(PROGRAM_ID, …, "confirmed")` subscription.

**No durable cursor.** No `getSignaturesForAddress` backfill, no `last_signature` table, no checkpoint. On WS reconnect or process restart, every log emitted while the indexer was offline is silently dropped. The federation poller has a watermark (`federation-poller.ts:144`), but the core event subscriber does not.

This is the single most important Phase-7 finding (`AU-07-001` below). The recent fix `17ddb08` proves that "log-only" indexer regressions have shipped; "missed-window" regressions are structurally harder to detect because no row is wrong — rows are simply absent.

---

## 2. Per-event matrix (13 events)

| Event | Subscribed? | Writes to table | Schema match | Idempotent | Notes |
|---|---|---|---|---|---|
| PolicyDecisionEvent | yes (L80, L126) | `policy_decisions.insert` (L237) | match (214b parsed; lib.rs total = 32+32+1+1+8+32+32+32+8+4+32 = 214) | **NO — duplicate-prone** | No UNIQUE on `(sig_solscan)` or `(receipt_hash, slot)`. WS reconnect → duplicate ledger rows. |
| CardCreatedEvent | yes (L81, L146) | `agent_cards.upsert ignoreDuplicates` (L508) | match (157b) — *historical bug from 17ddb08 fixed* | yes (PK conflict + ignoreDuplicates) | `allowlist_count` field is intentionally dropped on the floor (L504-507). |
| CardRevokedEvent | yes (L82, L148) | `agent_cards.update revoked=true` (L545) | match (76b) | yes (idempotent UPDATE) | Logs `INDEXER_DB_FAILURE` if 0 rows match (L551). |
| PactOpenedEvent | yes (L83, L128) | `pacts.upsert ignoreDuplicates` (L284) | match (121b) | yes | **Not** in `INDEXER_ASSUMED_EVENT_SIZES` (`scripts/check-idl-drift.ts:149`); IDL-drift script silently skips it. Gap. |
| PactClosedEvent | yes (L84, L130) | `pacts.update closed=true` (L315) | match (88b) | yes | |
| PactSpendEvent | yes (L85, L132) | `pacts.update spent` (L339) **+** `round_up_queue.insert` (L441) | match (128b) | **NO for round_up_queue** — duplicate WS event ⇒ duplicate queue row ⇒ double-spend on round-up cron. | `enqueueRoundUpIfApplicable` has no idempotency key (no UNIQUE on `(triggering_pact, triggering_sig)`). |
| StreamingPactOpenedEvent | yes (L87, L134) | `pacts.upsert ignoreDuplicates` (L581) | match (137b) | yes | |
| PactStreamClaimEvent | yes (L88, L136) | `pacts.update claimed,last_claim_slot` (L633) | match (136b) | yes | |
| PactStreamPauseEvent | yes (L89, L138) | `pacts.update paused,pause_started_slot` (L666) | match (41b) | yes | **No StreamingPactResumedEvent** — resume reuses Pause event (paused=false). Confirmed via `events.rs:103-108` comment. AU-00-004 resolved here. |
| DeliveryEscrowOpenedEvent | yes (L91, L140) | `pacts.upsert ignoreDuplicates` (L708) | match (192b parsed; events.rs sum = 32+32+32+32+32+8+8+8+8 = 192) | yes | |
| DeliveryEscrowReleasedEvent | yes (L92, L142) | `pacts.update released=true` (L751) | match (113b parsed; events.rs sum = 32+32+32+1+8+8 = 113) | yes | |
| DeliveryEscrowDisputedEvent | yes (L93, L144) | `pacts.update refunded=true` (L786) | match (80b parsed; sum = 32+32+8+8 = 80) | yes | |
| ReceiptRecordedEvent | yes (L95, L150) | `kernel_receipt_attestations.insert` (L855) **+** `phase5_executions.update` (L895) | match (201b) | yes (PK = sig_solscan) — but **collision risk if a single tx emits multiple ReceiptRecordedEvents** since PK is sig_solscan alone | Phase 5 attribution wired correctly via `plan_json->kernel_hashes->>context_hash` (L885). |

Total: 13 of 13 subscribed; 13 of 13 write to a table; 4 idempotency gaps.

---

## 3. IDL-drift script coverage gap

`scripts/check-idl-drift.ts:149-155` only asserts 5 events:
```
CardCreatedEvent: 157, CardRevokedEvent: 76, PactClosedEvent: 88,
PactSpendEvent: 128, ReceiptRecordedEvent: 201
```

The indexer hard-codes 8 additional event sizes (PolicyDecisionEvent 214, PactOpenedEvent 121, StreamingPactOpenedEvent 137, PactStreamClaimEvent 136, PactStreamPauseEvent 41, DeliveryEscrowOpenedEvent 192, DeliveryEscrowReleasedEvent 113, DeliveryEscrowDisputedEvent 80) — **none of which are protected by the drift script**. If the on-chain layout for any of these grows a field, the indexer's `data.length < N` guard rejects every event silently with a `console.warn` and never writes a row. This is a regression vector.

The `scripts/audit-indexer-handlers.ts` helper *does* compute IDL-derived sizes and asserts the indexer has a matching `data.length < N` check — but only runs when `programs/.../target/idl/settle_agent_card.json` is present, i.e. only after a fresh `anchor build`. Not in CI gating.

---

## 4. Specific path verifications

### 4a. Round-up enqueue (PactSpendEvent → round_up_queue)
`index.ts:352-453` — flow correct: (1) lookup `agent_cards.authority_pubkey`, (2) lookup `round_up_rules` for that owner, (3) skip recursion if `rule.pact_pubkey === args.triggeringPact`, (4) compute `delta = roundTo - (amount % roundTo)`, (5) daily-cap aggregation, (6) insert with status='pending'|'skipped'.

`delta_lamports` math correct. Schema match against `0040_round_up_queue.sql:38` (`delta_lamports bigint not null`, `dest_pubkey text not null`, `pact_pubkey text not null`).

**Gap:** no `(triggering_request_id)` set on insert (column exists per migration but indexer passes nothing). And no UNIQUE on `(rule_id, owner_pubkey, triggering_amount, created_at)`. WS reconnect or duplicate log delivery → duplicate queue row → signer cron fires the round-up twice. Findings AU-07-002.

### 4b. Phase 5 attribution (ReceiptRecordedEvent.context_hash → phase5_executions)
`index.ts:881-908` — wired correctly. Filters via `plan_json->kernel_hashes->>context_hash` (note JSONB extractor `->>` returns text — context_hash is hex-encoded in both producer and consumer, OK). Sets `signature` if missing, `status='confirmed'` + `confirmed_at` if status was 'sent'. Limits to 5 matches per attestation (rare collision-tolerant).

Migration `0031_phase5_executions.sql:30-33` confirms `signature text` + `plan_json jsonb` columns exist. `confirmed_at timestamptz` at L37. Schema matches.

### 4c. Federation poller (verified_merchants → fanout webhook delivery)
`federation-poller.ts:143-238` — two-pass design:
- PASS 1 (L153): log+watermark advance over `federated_receipts WHERE status='verified' AND imported_at > watermark`.
- PASS 2 (L179): pull pending deliveries `webhook_delivery_status='pending'`, POST signed envelope, update state.

Watermark is **in-memory only** (L144) — see comment at L13-14 admitting small replay windows on restart. Logging-replay is OK; delivery is gated by `webhook_delivery_status` so re-deliveries do not occur (state machine handles it).

Webhook URL lookup is **env-var only** (`MERCHANT_WEBHOOK_URL_<TRUNCATED>`, L49-51) — comment admits "future: query verified_merchants.webhook_url". The native receipt webhook-worker DOES query `verified_merchants.webhook_url` (`webhook-worker.ts:84-95`); the federation poller does NOT. Asymmetry → finding AU-07-003.

`federated_receipts.webhook_delivery_status` and `webhook_attempts` columns exist per `0033_federation_webhook_delivery.sql` (verified migration title; column types not re-read here but indexer code passes them as strings/ints consistently).

### 4d. IDL drift (size assertions)
See section 3 above.

---

## 5. Cursor + replay durability

**Indexer:** none. `connection.onLogs` only. STARTUP loses all events emitted during downtime. Production-blocking for a payments protocol. Finding AU-07-001.

**Federation poller:** in-memory watermark (`federation-poller.ts:209-228`); on restart it re-initializes to `MAX(imported_at) WHERE status='verified'`. Misses no row because the underlying federated_receipts rows are persistent — only "log this for observability" is replayed. Acceptable.

**Webhook worker:** state-machine driven; cursor not needed. Acceptable.

---

## 6. Idempotency summary

| Path | Risk | Mitigation needed |
|---|---|---|
| `policy_decisions` insert | duplicate ledger rows on replay | UNIQUE on `(sig_solscan, card_pubkey)` or `ON CONFLICT DO NOTHING` |
| `round_up_queue` insert | duplicate fire | UNIQUE on `(rule_id, triggering_amount_lamports, /* + slot? */)` or use triggering tx sig |
| `kernel_receipt_attestations` insert | OK (PK = sig_solscan) but multi-event tx not handled | Composite PK `(sig_solscan, receipt_hash)` |
| `pacts` upsert/update | OK (`ignoreDuplicates` + idempotent UPDATEs) | none |
| `agent_cards` upsert | OK (`ignoreDuplicates`) | none |

---

## 7. Self-check

1. Read every handler? yes (index.ts 1-929 fully read; federation-poller fully read; webhook-worker fully read).
2. Line-numbered evidence? yes.
3. Verified IDL sizes against events.rs hand-summed? yes (PolicyDecision 214, CardCreated 157, etc. — all match).
4. Cross-checked `scripts/audit-indexer-handlers.ts`? yes — confirms 13-event coverage; flagged its IDL dependency.
5. Cross-referenced migrations for column types? yes (`0001`, `0011`, `0019`, `0030`, `0031`, `0040` read).
6. Distinguished CODE_EXISTS / WIRED / LIVE_VERIFIED? handlers are CODE_EXISTS + WIRED; LIVE_VERIFIED requires devnet replay drill (not run in this phase — deferred to Phase 14).

---

## 8. Findings appended to FINDINGS.md

- AU-07-001 — HIGH — no durable cursor / replay-on-restart
- AU-07-002 — HIGH — round_up_queue + policy_decisions duplicate-row risk
- AU-07-003 — MEDIUM — federation-poller webhook URL lookup ignores verified_merchants table
- AU-07-004 — MEDIUM — IDL-drift script covers only 5 of 13 event sizes
- AU-07-005 — LOW — `kernel_receipt_attestations` PK on `sig_solscan` collides if multi-event tx
- AU-07-006 — LOW — `CardCreatedEvent.allowlist_count` discarded; allowlist join table never populated by indexer
