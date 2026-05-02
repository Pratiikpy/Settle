export * from "./settle-card";
export * from "./pact-card";
export * from "./countdown-ring";
export * from "./activity-row";
export * from "./receipt-card";
export * from "./cnft-receipt";
export * from "./deny-badge";
export * from "./handle-badge";
export * from "./trust-gesture";
export * from "./slide-to-confirm";
export * from "./hash-chain-animation";
export * from "./trust-score-badge";
export * from "./wax-seal";
export * from "./vault-graphic";
export * from "./docs-intro-animation";
export * from "./empty-state";
export * from "./capability-badge";
export * from "./draggable-receipt";

// WAVE_6 — redesigned shell primitives. Coexist with legacy components;
// each lives in `w6-*.tsx` and prefixes its export with `W6` so old
// imports never collide.
export * from "./w6-logo";
export * from "./w6-bento";
export * from "./w6-pill";
export * from "./w6-stat";
export * from "./w6-spark";
export * from "./w6-cluster-badge";
export * from "./w6-surface-switcher";

export const UI_VERSION = "0.3.0-w6";
