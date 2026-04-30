/**
 * Canonical deny codes — single source of truth.
 * MUST stay byte-aligned with `programs/settle-agent-card/src/state.rs::DenyCode`.
 * Order is load-bearing: discriminant values are persisted on-chain via PolicyDecisionEvent.
 */
export const DenyCode = {
  Revoked: 1,
  OverCap: 2,                  // covers daily_cap OR per_call_max
  OffAllowlist: 3,
  Expired: 4,
  UserDeclinedReview: 5,
  DuplicateOrLoopDetected: 6,  // server-side rolling 60s / 3-attempt
  CapabilityNotPinned: 7,
  MerchantNotVerified: 8,
} as const;

export type DenyCodeName = keyof typeof DenyCode;
export type DenyCodeValue = (typeof DenyCode)[DenyCodeName];

export const DENY_CODE_NAMES: Record<DenyCodeValue, DenyCodeName> = {
  1: "Revoked",
  2: "OverCap",
  3: "OffAllowlist",
  4: "Expired",
  5: "UserDeclinedReview",
  6: "DuplicateOrLoopDetected",
  7: "CapabilityNotPinned",
  8: "MerchantNotVerified",
};

export const DENY_CODE_HUMAN: Record<DenyCodeValue, string> = {
  1: "Card revoked by owner",
  2: "Spend exceeds cap (daily or per-call)",
  3: "Merchant not on allowlist",
  4: "Card expired",
  5: "User declined review prompt",
  6: "Duplicate request or loop detected",
  7: "Capability hash not pinned for merchant",
  8: "Merchant not in verified registry",
};

export type PolicyDecision =
  | { kind: "ALLOW" }
  | { kind: "DENY"; code: DenyCodeValue }
  | { kind: "REVIEW"; reason: string };

export const isAllowed = (d: PolicyDecision): d is { kind: "ALLOW" } =>
  d.kind === "ALLOW";
