# Settle Project Knowledge Base

This folder is the operational brain of the Settle repository. It exists so a large AI-built codebase does not depend on one person remembering every route, package, database table, on-chain instruction, worker, SDK, and product claim.

Use this folder before any large audit, refactor, feature build, demo prep, or handoff.

## What This Is

Settle is a Solana-native PayFi product for programmable, verifiable money movement across humans, AI agents, merchants, creators, developers, teams, and protocols.

The product spine is:

> Humans and agents move money through programmable rules, verifiable receipts, and trust-building reputation on Solana.

Every feature must attach to at least one of these:

- Programmable money rules.
- Verifiable receipt/proof objects.
- Trust/risk reduction.
- Real user utility.
- Solana-native advantage.
- Clear UX.

## Core Source Files

- Product atlas: `docs/STRATEGY.md`
- Execution plan: `docs/BUILD_ORDER.md`
- Current product spec: `docs/PRODUCT_SPEC.md`
- Devnet capability truth table: `docs/DEVNET_PRODUCT_CAPABILITY_SPEC.md`
- Testing guide: `docs/TESTING.md`
- Setup guide: `SETUP.md`
- Project status: `PROJECT_STATUS.md`
- Mainnet migration notes: `MAINNET_MIGRATION.md`
- Security posture: `SECURITY.md`

## Knowledge Files In This Folder

- `01_PRODUCT_MAP.md`: product surfaces, users, and feature groups.
- `02_SYSTEM_MAP.md`: apps, packages, programs, infra, scripts.
- `03_FEATURE_MATRIX.md`: feature to UI/API/DB/chain/test traceability.
- `04_INTEGRATION_GRAPH.md`: how the system pieces connect.
- `05_USER_FLOWS.md`: end-to-end user journeys.
- `06_API_MAP.md`: route inventory by domain.
- `07_DATABASE_MAP.md`: Supabase migration and table map.
- `08_SOLANA_PROGRAM_MAP.md`: Anchor program accounts, instructions, events.
- `09_SDK_MCP_EXTENSION_MAP.md`: SDKs, MCP middleware, extension status.
- `10_RUNBOOKS.md`: build, test, deploy, seed, verify.
- `11_HUMAN_ACTIONS.md`: actions only a human/operator can complete.
- `12_AUDIT_FINDINGS.md`: open findings and truth gaps.
- `13_DECISIONS_ADR.md`: architecture decision records.

## The Control Center Page

The internal visual version is:

- `apps/web/app/control-center/page.tsx`
- URL: `/control-center`

It summarizes the same knowledge in a quick dashboard: system map, feature states, flow coverage, human actions, and current risks.

## Rules For Future AI Agents

1. Do not trust a feature claim until it is traced through docs, UI, API, data, chain/SDK, and tests.
2. Do not mark a feature shipped because a file exists.
3. If code and docs disagree, record the mismatch in `12_AUDIT_FINDINGS.md`.
4. If an action requires keys, deployment, faucet, domain, API account, or mainnet money, record it in `11_HUMAN_ACTIONS.md`.
5. If a new package/app/surface is added, update `02_SYSTEM_MAP.md`, `03_FEATURE_MATRIX.md`, and `/control-center`.

## Current High-Risk Truth Gap

The most important known gap is the Universal Receipt Kernel boundary:

- x402 spend path has the strongest receipt hash-chain flow.
- Other payment kinds must be kept aligned with the universal receipt model.
- `docs/BUILD_ORDER.md` correctly makes this the first Phase 1 priority.

