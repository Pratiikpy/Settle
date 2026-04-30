/**
 * Soulbound reputation badge catalogue (data + types only — no on-chain code).
 *
 * Both the web app (UI rendering, /at/[handle] badge collection) and the
 * indexer's badge-cron import from here. Keeping the catalogue in @settle/types
 * means: no MPL Core dep in @settle/sdk, no cross-app import issues, single
 * source of truth for the 6 badge kinds.
 *
 * The actual minting code (which depends on MPL Core SDK) lives in the
 * indexer at `apps/indexer/src/badges-mint.ts` — server-only.
 */

export type BadgeKind =
  | "first_payer"
  | "polymath"
  | "high_frequency_operator"
  | "long_streamer"
  | "honest_disputer"
  | "public_spender";

export interface BadgeSpec {
  kind: BadgeKind;
  name: string;
  emoji: string;
  description: string;
  /** Plain-English explanation of what the user did to earn it. */
  threshold: string;
}

export const BADGE_CATALOGUE: Record<BadgeKind, BadgeSpec> = {
  first_payer: {
    kind: "first_payer",
    name: "First Payer",
    emoji: "🏁",
    description:
      "You issued the first-ever Settle receipt to a merchant — pioneering a new economic relationship on chain.",
    threshold: "First receipt to ANY merchant",
  },
  polymath: {
    kind: "polymath",
    name: "Polymath",
    emoji: "🧠",
    description:
      "You've paid across 5 or more distinct capability hashes — exploring the breadth of the agent service market.",
    threshold: "Paid 5+ distinct capability hashes",
  },
  high_frequency_operator: {
    kind: "high_frequency_operator",
    name: "High-Frequency Operator",
    emoji: "⚡",
    description:
      "You've issued 100+ ALLOW receipts. You're not exploring — you're operating.",
    threshold: "100+ ALLOW receipts lifetime",
  },
  long_streamer: {
    kind: "long_streamer",
    name: "Long Streamer",
    emoji: "🌊",
    description:
      "You've held an active streaming pact for 30+ days. Sustained agent salaries, not one-off hires.",
    threshold: "Active streaming pact for 30+ days",
  },
  honest_disputer: {
    kind: "honest_disputer",
    name: "Honest Disputer",
    emoji: "⚖",
    description:
      "You exercised your dispute_delivery_escrow rights within the window — the rare badge that proves the escrow primitive works.",
    threshold: "First successful dispute_delivery_escrow within window",
  },
  public_spender: {
    kind: "public_spender",
    name: "Public Spender",
    emoji: "📡",
    description:
      "You broadcast your first public_feed receipt — chose transparency over privacy on at least one transaction.",
    threshold: "First public_feed=true receipt",
  },
};

export const ALL_BADGE_KINDS = Object.keys(BADGE_CATALOGUE) as BadgeKind[];

export function getBadgeSpec(kind: BadgeKind): BadgeSpec {
  return BADGE_CATALOGUE[kind];
}
