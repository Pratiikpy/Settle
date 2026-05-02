# AUDIT_PLAN.md (refined after Phase 0)

Customized for the Settle Protocol codebase. Follows the 16-phase scaffold in AUDIT_BRIEF.md, with Phase 0 already complete.

## Settle-specific concerns surfaced in Phase 0

1. **Three different "instruction count" numbers across docs.** Sets the tone: this codebase has historical doc-vs-code drift; treat every count claim as suspect.
2. **Phase 5 cron loop is the riskiest production path.** 7 intent kinds, 2 dispatch functions, idempotency-critical. Phase 5 of audit gets extra scrutiny.
3. **3-language SDK parity** is the contract; Phase 4 must re-derive every golden.
4. **Recent commit `17ddb08`** acknowledges indexer was logging-only. Phase 7 (indexer audit) should re-verify every event handler actually writes to Supabase.
5. **31 unclaimed UI routes** — Phase 8 reachability + Phase 13 dead-code must classify each.
6. **STRATEGY.md describes ~150 features.** Phase 2 traceability matrix will be large; consider sub-agent for per-feature trace.
7. **ZK Compression / MPL Core badges / cNFT receipts** mentioned in commits — Phase 9 must doc-fetch Light + MPL Core + Bubblegum, Phase 12 must classify devnet/mainnet.

## Phase order + estimated effort

| Phase | Subject | Scale | Approach |
|-------|---------|-------|----------|
| 0 | Inventory | Small | ✅ Complete |
| 1 | Doc conformance | Medium | Per-claim checklist; current session |
| 2 | Spec→code traceability | Large | Sub-agent: Explore feature-by-feature against STRATEGY.md |
| 3 | Anchor program | Medium | Per-instruction file walkthrough; cross-check with SDK builders |
| 4 | SDK parity | Small | Re-run smoke scripts; verify counts |
| 5 | Phase 5 dispatch | Medium | Per-intent table + idempotency drill replay |
| 6 | Integration graph | Large | Sub-agent: per-flow trace |
| 7 | Indexer | Medium | Per-event handler verify + recent-fix follow-up |
| 8 | UX reachability | Medium | Build link graph; Playwright spec |
| 9 | Library correctness | Large | WebFetch 20 doc URLs; per-lib comparison |
| 10 | Data/RLS | Medium | Per-table RLS audit |
| 11 | Security | Large | Cross-cutting sweep |
| 12 | Devnet honesty | Small | Per-feature × cluster matrix |
| 13 | Dead code | Medium | knip/ts-prune/madge runs |
| 14 | Test coverage | Medium | Run all suites + design 10 new tests |
| 15 | Final report | Small | Synthesis |

## Devnet SOL budget plan

- Per-cycle ceiling: 0.5 SOL
- Reserved for re-running phase5-live-all-intents harness in Phase 5: 0.3 SOL
- Reserved for new test fires in Phase 14: 0.15 SOL
- Reserve: 0.05 SOL

## Sub-agent dispatches planned

- **Phase 2** — Explore agent reads STRATEGY.md feature catalog (~150 features), produces traceability table.
- **Phase 6** — Plan agent traces one major flow per call, multiple in parallel.
- **Phase 9** — General-purpose agent for each library doc-fetch + comparison.
- **Phase 13** — Run knip/ts-prune in background; aggregate results.

## Known-deferred items (won't be re-flagged)

Per PROJECT_STATUS:
- Mainnet deploy
- Streaming pact on-chain landing (kernel commit fixed; needs streaming pact harness)
- Anchor program third-party audit

These remain documented in HUMAN_ACTIONS.md but won't surface as new findings.

## Convergence target for Cycle 1

By end of Cycle 1: every claim in PROJECT_STATUS verified or flagged. Every UI route classified. Every Anchor instruction audited. Every library checked against current docs. ~80–120 findings total expected (mostly LOW/MEDIUM; a few HIGH; rare BLOCKER).

If Cycle 1 produces a BLOCKER, audit halts only if mainnet exposure exists — devnet-only fixes deferred to Fix Pass 1.
