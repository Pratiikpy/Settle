/**
 * Decision badge — ALLOW (green) / DENY (red) / REVIEW (yellow).
 * Maps deny_code 1..8 to short human label per @settle/types DENY_CODE_HUMAN.
 */
export type DenyDecision = "ALLOW" | "DENY" | "REVIEW";

const DENY_LABELS: Record<number, string> = {
  1: "revoked",
  2: "over_cap",
  3: "off_allowlist",
  4: "expired",
  5: "user_declined",
  6: "loop_detected",
  7: "capability_unpinned",
  8: "merchant_unverified",
};

export interface DenyBadgeProps {
  decision: DenyDecision;
  denyCode?: number;
  className?: string;
}

export function DenyBadge({ decision, denyCode, className }: DenyBadgeProps) {
  const palette =
    decision === "ALLOW"
      ? "bg-[#14F195]/10 text-[#14F195]"
      : decision === "DENY"
        ? "bg-red-500/10 text-red-400"
        : "bg-amber-400/10 text-amber-300";

  const label =
    decision === "ALLOW"
      ? "ALLOW"
      : decision === "REVIEW"
        ? "REVIEW"
        : denyCode && DENY_LABELS[denyCode]
          ? `DENY · ${DENY_LABELS[denyCode]}`
          : "DENY";

  return (
    <span className={["rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", palette, className ?? ""].join(" ")}>
      {label}
    </span>
  );
}
