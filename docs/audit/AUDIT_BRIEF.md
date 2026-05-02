# Settle Protocol — Intent-to-Implementation Audit (autonomous)

You are a senior protocol architect, Solana/Anchor auditor, full-stack reviewer, UX systems reviewer, and product engineer. The user has stepped away. **Run this entire audit unattended.** Do not stop, do not ask for confirmation, do not request decisions you can make yourself. Continue from Phase 0 to Phase 15 in a single autonomous pass.

This is forensic. Treat the repo as the only source of truth and docs as claims to verify, not facts.

---

## THE PROJECT (your context — memorize)

**Settle Protocol** — Solana payment protocol where humans + AI agents move USDC through programmable rules (AgentCards), scoped vault accounts (Pacts), and verifiable receipts with 4-hash kernel commits. Three-language SDK byte parity (TypeScript / Python / Rust). Off-chain orchestration via Supabase + Next.js + cron-driven signer.

**Repo layout (verify these exist; flag any missing):**
- `apps/web` — Next.js 15 App Router (user/merchant/admin/agent surfaces; Phantom + Burner wallet adapters)
- `apps/indexer` — Anchor event subscriber → Supabase mirror
- `apps/demo-agent` — agent SDK demo
- `apps/demo-merchants` — merchant SDK demo
- `packages/sdk` — TS SDK (kernel commit, capability hash, 13 Anchor ix builders, byte-locked goldens)
- `packages/python-sdk` — Python parity (single-file)
- `packages/rust-sdk` — Rust parity
- `packages/types` — shared types
- `packages/ui` — design system
- `packages/mcp-middleware` — MCP protocol wrapper
- `programs/settle-agent-card` — Anchor program (13 instructions, 14 events)
- `infra/supabase/migrations` — claimed 45 migrations
- `scripts/` — devnet harnesses, keygen, smoke, parity scripts

**Core invariants (must hold; finding if violated):**
1. Authority signs `create_card`/`open_pact`/`close_pact`; agent signs `spend_via_pact`/`claim_streaming`. Authority NEVER signs spends.
2. Daily cap, per-call max, allowlist, expiry — all enforced **on-chain** by the Anchor program. Client checks are advisory only.
3. Kernel commit = 4 BLAKE3 hashes (receipt/reason/policy/purpose) + canonical JSON. **Three SDKs must be byte-identical** for identical input.
4. Phase 5 dispatch: 6 intents (`scheduled_send`, `auto_refill`, `gift_claim`, `gift_refund`, `group_spend`, `round_up`) → `fireSpendViaPact`. 1 intent (`streaming_claim`) → `fireClaimStreaming`. Both paths emit kernel commits with 4 hashes.
5. Idempotency: `phase5_executions` rows + `last_fired_at` window prevent double-fires under cron retry.
6. Indexer mirrors all 14 Anchor events to Supabase. UI reads off-chain mirror; on-chain is source of truth.
7. Federation: origin-attested receipts → `federated_receipts` → webhook fanout.
8. Authority/agent boundaries enforced at both UI gate AND program account constraint.

**Single source of "claimed shipped":** `PROJECT_STATUS.md`. **It is a claim. Audit it as one.**

---

## THE THREE-WAY COMPARISON

Every finding triangulates:
1. **Intent** — what docs claim
2. **Code-belief** — what code structurally implies
3. **Runtime truth** — what happens when real users / agents / cron ticks interact

Divergence = finding. Examples:
- Doc says shipped, code exists, runtime crashes → BLOCKER
- Doc says shipped, code exists, runtime works, no UI surface → UX_NOT_REACHABLE
- Doc says shipped, no code → DOC_DRIFT or MISSING
- Code exists, no doc, no runtime path → DEAD_CODE
- API returns success, DB never updated → FAKE_SUCCESS

**Four-state model per feature** (only "shipped" if all four hold):
- `CODE_EXISTS` — files present
- `WIRED` — connected end-to-end statically
- `LIVE_VERIFIED` — observed running against real RPC + DB
- `UX_REACHABLE` — a user can find + invoke without insider knowledge

File existence ≠ proof. Test passing ≠ user can use it. Git log ≠ liveness.

---

## NON-NEGOTIABLE RULES

1. **No assumptions.** Cannot verify? Cannot claim.
2. **No fixes during Phases 0–14.** Findings only. Phase 15 produces the fix plan.
3. **Every finding cites evidence**: file:line + commands run + actual output. Not "looks like" / "appears to".
4. **No silent skip.** Phase too large → split in `AUDIT_PROGRESS.md`. Never skip without log.
5. **Audit-only writes.** Production code untouched. Audit files in `docs/audit/`. Verification scripts in `scripts/audit/`.
6. **No emoji-flooded findings.** Forensic: terse, evidence-cited, severity-tagged.
7. **No praise inflation.** "Works correctly" needs the same evidence as "broken".
8. **PROJECT_STATUS.md is a hypothesis.** If it lies → DOC_DRIFT finding.
9. **Hindi/transliterated/typo prompts are intentional.** Do not interpret as confusion.

---

## AUTONOMOUS BEHAVIOR (PURE AUTONOMY MODE)

You will not stop until Phase 15 is complete.

**You DO autonomously:**
- Run any verification command (typecheck, tests, RPC calls, Supabase queries, curl, grep, git log, Anchor sim).
- Install missing audit tooling (`pnpm add -D` for `knip`, `ts-prune`, `madge`, `depcheck`).
- **Use WebFetch for current official docs** for any framework/library when verifying correct usage. Do not rely on training-data memory.
- Write audit-only scripts under `scripts/audit/`.
- Continue from one phase to the next without confirmation.
- Use `ScheduleWakeup` for long-running waits.
- Run multiple independent searches in parallel (Grep + Glob + Bash + WebFetch).
- Spawn sub-agents (general-purpose / Explore / Plan) for parallel deep dives.
- Cross-reference PROJECT_STATUS.md against actual code state continuously.
- **Use up to 0.5 SOL of devnet funds** for live verification. Track spend.
- Run the full Playwright suite + keypair harnesses as part of verification.

**You DO NOT do autonomously:**
- Modify production code (anything outside `docs/audit/` and `scripts/audit/`).
- Delete files.
- Push to git or open PRs.
- Rotate secrets or modify env vars.
- DELETE / DROP on Supabase. Schema reads only.
- Mainnet transactions.
- Decide product strategy.

**STOP CONDITIONS** (only these stop you):
1. Verification requires a destructive action.
2. Confirmed BLOCKER with active mainnet financial exposure.
3. Devnet SOL exhausted past 0.5 SOL budget.
4. Verification needs a credential not in env.
5. Resolution requires product-strategy decision.

For everything else: continue. Phase complete → next phase. Lots of findings → document and continue. Slow command → run it, use background + ScheduleWakeup if > 10 min.

---

## DOCUMENTATION LOOKUP REQUIREMENT (mandatory for Phase 9)

Phase 9 requires **reading current official docs** before flagging anything. For each library, **WebFetch the official docs first**, then compare to actual usage. Cite the URL fetched in every finding. Do not skip the fetch. If a fetch fails, retry once; still failing → mark `NEEDS_DOC_FETCH` and continue.

---

## AUDIT PHASES

Execute strictly in order. Update `AUDIT_PROGRESS.md` after each. Run SELF-CHECK PROTOCOL before proceeding.

### Phase 0 — Inventory + plan refinement

**Read first** (in parallel):
- `PROJECT_STATUS.md`, `README.md`, `SECURITY.md`, `MAINNET_MIGRATION.md`
- `docs/STRATEGY.md`, `docs/BUILD_ORDER.md`, `docs/PRODUCT_SPEC.md`, `docs/DEVNET_PRODUCT_CAPABILITY_SPEC.md`
- `package.json`, `pnpm-workspace.yaml`, root + per-workspace
- `Anchor.toml`, every `Cargo.toml`
- Every SDK package's README

**Enumerate:**
- Workspace packages with version + purpose + last-modified
- Anchor instructions (count + names)
- Anchor events (count + names)
- Supabase migrations (numbered list, count vs claimed 45)
- Every API route under `apps/web/app/api/` (path + method)
- Every UI route under `apps/web/app/` (excluding api)
- Every script under `scripts/`
- Every external service env key in `.env.example` / `.env.local`

**Check for claimed-but-missing surfaces:** Chrome extension? Mobile app? Discord bot? CLI? — any docs reference vs file existence.

**Output:** `docs/audit/SYSTEM_MAP.md` + `docs/audit/AUDIT_PLAN.md` + `docs/audit/AUDIT_PROGRESS.md`. Refine the plan if discovered Settle-specific phases not in this brief.

### Phase 1 — Documentation conformance audit

For every concrete claim in `PROJECT_STATUS.md` + `README.md` + `MAINNET_MIGRATION.md` + `SECURITY.md`:
- Locate the file/line/test/log referenced
- "Bug fixed" claim → diff actually fixes it
- "Live verified" claim → log file exists; tx sigs valid (run `solana confirm <sig>`)
- "Test passing" claim → run the test
- "45 migrations applied" → count + verify against deployed schema
- "X tests passing" claim → run `pnpm test` and count

**Output:** `docs/audit/DOC_CONFORMANCE.md` — table per claim → CONFIRMED / DOC_DRIFT / UNVERIFIABLE + evidence.

### Phase 2 — Spec-to-code traceability matrix

For every feature in STRATEGY.md / PRODUCT_SPEC.md / BUILD_ORDER.md / DEVNET_PRODUCT_CAPABILITY_SPEC.md:

| feature | intended user | doc status tag | UI route | API route | SDK function | DB tables/migrations | Anchor ix/event | indexer/worker | tests/smoke | actual status |

Status: SHIPPED / PARTIAL / PLANNED / SIMULATED / MAINNET_ONLY / FUNDED_FUTURE / MISSING / UX_NOT_REACHABLE

**Output:** `docs/audit/FEATURE_TRACEABILITY_MATRIX.md`.

### Phase 3 — Anchor program correctness audit

`programs/settle-agent-card/`. Per instruction:
- Account list: required vs optional, signer constraints, mut constraints, owner checks
- PDA seeds: derive deterministically, verify against client builders in 3 SDKs
- Authority checks (who CAN call vs who SHOULD)
- Reentrancy / replay surface
- Daily cap + per-call max accounting (slot rollover correctness for `used_today`)
- Allowlist enforcement (capability_hash compare logic)
- Pact closure → vault drainage (close_pact merchant signature)
- Streaming pact rate math (overflow on `(current_slot - last_claim_slot) * rate`?)
- All `record_denial` callers; authorization
- Cross-pact cap accounting

**Cross-check:** every Anchor ix has matching ix-data builders in TS/Python/Rust. Discriminator (8-byte sha256("global:name")) consistent. Re-run `pnpm tsx scripts/smoke-ix-data-parity.ts` and `pnpm tsx scripts/check-idl-drift.ts`.

**Output:** `docs/audit/PROGRAM_AUDIT.md`.

### Phase 4 — SDK byte-parity verification

Re-run all parity smoke scripts:
- `pnpm tsx scripts/smoke-multikind-goldens.ts`
- `pnpm tsx scripts/smoke-ix-data-parity.ts`
- `pnpm tsx scripts/smoke-python-parity.ts`
- `cargo test` in `packages/rust-sdk`
- `pytest` in `packages/python-sdk`

**Verify:**
- 35 kernel hashes byte-identical across 3 langs
- 13 ix-data goldens byte-identical
- Capability hash + canonical JSON consistency
- Borsh writer behavior identical
- Total test count vs PROJECT_STATUS claim of 258

**Output:** `docs/audit/SDK_PARITY.md`.

### Phase 5 — Phase 5 cron loop dispatch + idempotency

`apps/web/app/api/cron/phase5-tick/` + `phase5-signer/`.

Per intent kind (7 total):
- Trace queue/state table → tick → signer plan → fire function → on-chain ix → execution row → indexer attribution
- Verify dedup logic rejects replays (re-run `scripts/phase5-idempotency-drill.ts`)
- Verify pact_ready + card_delegation_validated + pact_not_closed gates
- Verify Sentry capture exists at every live-fire failure path
- Verify `streaming_claim` kernel commit populates CardContextShape
- Verify `phase5_executions.plan_json.kernel_hashes` populated for live rows

Cross-language: intent_kind values consistent in DB check constraint, TS signer ExecutionPlan union, indexer event handlers.

**Output:** `docs/audit/PHASE5_DISPATCH.md` — 7-row table.

### Phase 6 — Integration graph audit

Trace UI → API → SDK → DB → on-chain → indexer/worker → receipt page for every flow:

create AgentCard, open Pact, close Pact, spend via Pact, direct send, send link, streaming pact (open/claim/pause/resume), delivery escrow (open/release/dispute), refund flow, split bill, collab payment, group spend, gift send/claim/refund, allowance create/fund/kid card spawn, auto-refill, round-up, scheduled send, receipt creation, receipt verification (SDK + /verify page), cNFT/compressed receipt mirror, badge mint, leaderboard, merchant profile, verify-domain, capabilities publish, disputes, analytics, webhook self-serve, dashboard, settings, federation import/promote/demote, audit page, ledger page, SDK verification path, MCP middleware request → ix → response.

For each: what SHOULD happen, what ACTUALLY happens (file:line), files involved, what's missing/broken/fake, exact fix needed.

**Output:** `docs/audit/INTEGRATION_GRAPH.md`.

### Phase 7 — Indexer + federation correctness

`apps/indexer/`. Subscription correctness, mirror correctness per event, cursor + replay durability, round-up enqueue, phase5 attribution, federation poller, idempotency.

**Output:** `docs/audit/INDEXER_AUDIT.md`.

### Phase 8 — UX reachability audit

Per Phase 5 + merchant + admin surface: reachable from `/`? empty/loading/error/success states? success confirmation after on-chain action? mobile usability at 390×844? crypto jargon explained? wallet flow feedback? disconnected-state graceful? "next action" obvious?

Add Playwright spec at `apps/web/e2e/audit-reachability.spec.ts` walking the link graph from `/` and asserting every Phase 5 page reachable.

**Output:** `docs/audit/UX_REACHABILITY.md` — per-page rubric scored.

### Phase 9 — Framework / library correctness audit (DOC-FETCH MANDATORY)

WebFetch official docs for each, then compare to actual usage. Cite URL in every finding.

1. **Next.js 15 App Router** — nextjs.org/docs/app
2. **React 19** — react.dev
3. **Supabase** — supabase.com/docs (RLS + migrations + supabase-js bigint handling)
4. **Anchor** — anchor-lang.com / coral-xyz.github.io/anchor
5. **@solana/web3.js v1** — solana-labs.github.io/solana-web3.js
6. **@solana/spl-token / TransferChecked** — spl.solana.com/token
7. **Solana Pay / Actions / Blinks** — docs.solanapay.com + solana.com/docs/advanced/actions
8. **Metaplex / MPL / Bubblegum / Core** — developers.metaplex.com (if cNFT/badge claimed)
9. **Light Protocol / ZK compression** — lightprotocol.com (if claimed)
10. **Helius webhooks/indexing** — docs.helius.dev
11. **Jupiter** — dev.jup.ag
12. **Phantom wallet adapter** — docs.phantom.app + github.com/anza-xyz/wallet-adapter
13. **TypeScript SDK patterns** — internal review
14. **Python SDK parity** — packaging.python.org
15. **Rust SDK parity** — doc.rust-lang.org/cargo
16. **MCP middleware protocol** — modelcontextprotocol.io
17. **Sentry Next.js SDK 8** — docs.sentry.io/platforms/javascript/guides/nextjs
18. **@noble/hashes BLAKE3** — version pinned matches Python `blake3` + Rust `blake3` crate
19. **bs58** — version consistent
20. **zod** — every API input validated; no double-encoding bugs

Per library: doc URL fetched + date, correct usage from doc, current code usage (file:line), mismatch / risk, severity, exact fix path.

**Output:** `docs/audit/LIBRARY_CORRECTNESS.md`.

### Phase 10 — Data, persistence, RLS, source-of-truth audit

Migration order. Table relationships. RLS per table. Receipt ownership. Public/private feed rules. Merchant/user views. Human/agent authority boundaries (DB + program). Nonce/idempotency tables. Duplicate prevention (UNIQUE constraints). Indexing performance. Any write path bypassing canonical tables.

Specifically: indexer always writes policy_decisions alongside receipts; UI never writes queue tables directly; API never signs on-chain (only relayer).

**Output:** `docs/audit/DATA_RLS_AUDIT.md`.

### Phase 11 — Security, authority, truth audit

Who signs each tx. Authority/agent separation. PDA seed correctness (cross-check 3 SDKs derive identical PDAs). Daily/per-call cap enforcement on-chain + UI. Cross-pact cap accounting (can N pacts dodge daily cap?). Revocation enforcement. Refund/dispute authorization. record_denial authority. Escrow rules. capability_hash enforcement. Merchant verification gate. Replay prevention (nonces, blockhash freshness, UNIQUE constraints). Env fail-open risks. Placeholder program IDs. Fake/mock not labeled honestly. Secrets in commit history. Service role key in client bundle. Sentry DSN guard. CRON_SECRET on every cron route.

**Output:** `docs/audit/SECURITY_AUDIT.md`.

### Phase 12 — Devnet/mainnet honesty audit

Per feature: devnet-verifiable / devnet-simulated / mainnet-only / funded-future / human-setup-required.

For Jupiter, Solana Pay, Helius, cNFT, Bubblegum, Compression, VAPID, Privy, every external service: env keys + code paths + devnet behavior (mock/real/graceful disable).

Flag anything claiming "shipped" but not devnet-verifiable.

**Output:** `docs/audit/DEVNET_HONESTY.md`.

### Phase 13 — Fake / placeholder / dead code sweep

- `grep -rn 'TODO\|FIXME\|XXX\|HACK\|TEMP'` in production paths
- `grep -rn 'mock\|placeholder\|dummy\|fake'` in apps/web
- Unreferenced files (use `madge` or `knip`)
- Unused exports in `packages/sdk/src/` (`ts-prune`)
- Empty catch blocks: `grep -rE 'catch\s*\([^)]*\)\s*\{\s*\}'`
- `console.log` in production paths
- New unsafe inline-HTML React props (the dangerously-set-inner-html escape hatch)
- UI showing success when backend failed
- Hardcoded test values in production

**Output:** `docs/audit/DEAD_CODE_AUDIT.md`.

### Phase 14 — Test coverage + new-test design

Per feature in `FEATURE_TRACEABILITY_MATRIX.md`: unit / SDK parity / Anchor / smoke / Playwright / live harness / manual-only.

Run all:
- `pnpm test` (full)
- `pnpm --filter @settle/web exec playwright test`
- `pnpm tsx scripts/e2e-payment-flow.ts`
- `pnpm tsx scripts/phase5-live-all-intents.ts`
- `pnpm tsx scripts/phase5-idempotency-drill.ts`
- `cargo test` + `pytest` + `anchor test`

Capture pass/fail/duration. Compare against PROJECT_STATUS claim of 258 tests.

Identify untested risks (manual-only features, failure-case gaps, cross-language regressions). Design new tests for top 10 untested risks.

**Output:** `docs/audit/TEST_COVERAGE_GAPS.md`.

### Phase 15 — Final report + prioritized fix plan

`docs/audit/FINAL_AUDIT_REPORT.md`:
1. Executive summary
2. What's actually working (evidenced)
3. What's broken (BLOCKER + HIGH)
4. What's lying (DOC_DRIFT)
5. What's missing (MISSING + UX_NOT_REACHABLE)
6. What's risky (security findings)
7. What's polish-only
8. Prioritized fix plan (BLOCKER → HIGH → MEDIUM → LOW → DOC_DRIFT)
9. Mainnet readiness gate checklist
10. Audit confidence per phase
11. Total devnet SOL spent

`docs/audit/HUMAN_ACTIONS.md` — only items the user genuinely must do (env keys, third-party signups, mainnet actions). Do not pad to avoid your own work.

---

## OUTPUT FILES

```
docs/audit/
├── AUDIT_BRIEF.md
├── AUDIT_PLAN.md
├── AUDIT_PROGRESS.md
├── SYSTEM_MAP.md                    Phase 0
├── DOC_CONFORMANCE.md               Phase 1
├── FEATURE_TRACEABILITY_MATRIX.md   Phase 2
├── PROGRAM_AUDIT.md                 Phase 3
├── SDK_PARITY.md                    Phase 4
├── PHASE5_DISPATCH.md               Phase 5
├── INTEGRATION_GRAPH.md             Phase 6
├── INDEXER_AUDIT.md                 Phase 7
├── UX_REACHABILITY.md               Phase 8
├── LIBRARY_CORRECTNESS.md           Phase 9
├── DATA_RLS_AUDIT.md                Phase 10
├── SECURITY_AUDIT.md                Phase 11
├── DEVNET_HONESTY.md                Phase 12
├── DEAD_CODE_AUDIT.md               Phase 13
├── TEST_COVERAGE_GAPS.md            Phase 14
├── FINDINGS.md                      cumulative
├── HUMAN_ACTIONS.md                 only user-must-do
└── FINAL_AUDIT_REPORT.md            Phase 15
```

---

## EVIDENCE STANDARD

Every finding follows this format. No exceptions:

```
ID: AU-[phase]-[seq] (e.g. AU-09-007)
Severity: BLOCKER | HIGH | MEDIUM | LOW | DOC_DRIFT
Category: PROGRAM_LOGIC | DISPATCH | INDEXER | UX_REACHABLE | SECURITY | DOC | DEAD_CODE | LIB_USAGE | TEST_GAP | DEVNET_HONESTY | DATA_RLS
Files: [exact paths with line numbers]
Doc URL fetched: [if Phase 9; else N/A]
Expected: [what code/doc/runtime should produce]
Actual: [what it produces, with command/query that revealed it]
Evidence: [grep output / RPC response / Supabase row / log file / cmd output]
Why it matters: [user/security/mainnet impact — concrete]
How to verify the fix: [exact command/query that should produce expected output after fix]
Human action required? yes | no | partial
```

If unverifiable → `Severity: NEEDS_VERIFICATION` + document the verification step you couldn't run + why.

---

## SEVERITY DEFINITIONS

- **BLOCKER**: cannot ship to mainnet. Fund loss / auth bypass / RLS hole / double-spend.
- **HIGH**: degrades trust. Silent failure, broken intent, indexer drift, missing error state on money flow.
- **MEDIUM**: real issue, not user-fatal. Confusing copy on money screen, missing loading state, missing test for working feature.
- **LOW**: polish.
- **DOC_DRIFT**: doc says X, code does Y. Fix may be doc OR code; finding is misalignment.

---

## SELF-CHECK PROTOCOL (run after every phase)

Before updating AUDIT_PROGRESS.md:

1. Did I read actual files for every claim, not just file lists?
2. Did I provide line-numbered evidence for every finding?
3. Did I run the verification commands cited, not paraphrase?
4. Did I check whether my finding contradicts a prior phase (resolve)?
5. Did I distinguish CODE_EXISTS / WIRED / LIVE_VERIFIED / UX_REACHABLE?
6. **Did I WebFetch official docs for every Phase 9 library before flagging?**
7. Did I add anything to HUMAN_ACTIONS that I could have done myself?
8. Did I miss related files (audited API but not the UI page that calls it)?
9. Is this phase's evidence good enough to defend in a security review meeting?

Any "no" → deepen the phase before continuing.

---

## START NOW

1. Read this brief end to end.
2. Read PROJECT_STATUS.md, README.md, SECURITY.md, MAINNET_MIGRATION.md end to end.
3. Read every file in `docs/`.
4. Begin Phase 0. Produce `SYSTEM_MAP.md` + `AUDIT_PLAN.md` + `AUDIT_PROGRESS.md`.
5. Run SELF-CHECK.
6. Continue to Phase 1.
7. Continue through Phase 15 in order, updating AUDIT_PROGRESS after each, only stopping on STOP CONDITIONS.
8. When complete, post a single summary message:
    - Total findings by severity
    - Top 5 BLOCKER/HIGH
    - Mainnet readiness verdict (Yes / No / Conditional + conditions)
    - Confidence level (High / Medium / Low) and what would raise it
    - Devnet SOL spent

**Do not ask whether to start. Do not ask whether to continue between phases. Run all 16 phases (0–15) in a single autonomous pass.**
