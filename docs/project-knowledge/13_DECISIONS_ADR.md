# Architecture Decision Records

This file records important product/architecture decisions so future agents do not re-litigate or accidentally reverse them.

## ADR-001: Use Project Knowledge Base + Control Center

Status: accepted

Decision:

Create `docs/project-knowledge` as markdown truth and `/control-center` as a visual internal map.

Reason:

The codebase is too large to hold in memory. Docs-only is hard for humans. UI-only lacks Git history. Both together create durable operational truth.

## ADR-002: Strategy Atlas vs Build Order

Status: accepted

Decision:

`docs/STRATEGY.md` is the long-term product atlas. `docs/BUILD_ORDER.md` is the execution tracker.

Reason:

Prevents a 2,000+ line vision doc from being confused with daily tasks.

## ADR-003: Universal Receipt Kernel First

Status: accepted

Decision:

All payment kinds must converge on one receipt commit/verify model. This is Phase 1 priority #1.

Reason:

The core wedge is verifiable money movement. Partial receipt coverage weakens the whole product.

## ADR-004: Devnet Honesty

Status: accepted

Decision:

Every feature must be tagged honestly as shipped, partial, planned, simulated, mainnet-only, or funded-future.

Reason:

Truthful status prevents overclaiming and makes build order reliable.

## ADR-005: Chrome Extension Not Claimed Until Files Exist

Status: accepted

Decision:

Chrome extension remains missing/planned until an `apps/extension` or equivalent package exists.

Reason:

Avoids surface drift and false product claims.

