"use client";

import { motion } from "framer-motion";

/**
 * M2 — Vault graphic with rules ring.
 *
 * Visual anchor for "this card has rules": a stylized vault dial with
 * a fill level + a surrounding ring of rule pips (cap, expiry, allowlist
 * count, capability pinning).
 *
 * Render anywhere an AgentCard's funded state is shown — the dashboard
 * Business card, the card detail page header, the agent profile.
 *
 * The fill animates on mount + on `fillPct` change. Each rule pip
 * highlights based on whether that constraint is currently active.
 */
export interface VaultGraphicProps {
  /** 0..1 — fraction of cap remaining (1 = full vault, 0 = drained). */
  fillPct: number;
  /** Dollar string label, e.g. "$4.80". Centered inside the vault. */
  label: string;
  /** Active rule indicators. */
  rules: {
    /** Daily cap is set. */
    hasCap: boolean;
    /** Expiry is in the future. */
    hasExpiry: boolean;
    /** Allowlist has at least 1 merchant. */
    hasAllowlist: boolean;
    /** Capability hash is pinned for at least 1 merchant. */
    hasCapability: boolean;
  };
  size?: number;
  className?: string;
}

const RULE_PIPS = ["hasCap", "hasExpiry", "hasAllowlist", "hasCapability"] as const;
const RULE_LABELS: Record<(typeof RULE_PIPS)[number], string> = {
  hasCap: "cap",
  hasExpiry: "exp",
  hasAllowlist: "list",
  hasCapability: "pin",
};

export function VaultGraphic({
  fillPct,
  label,
  rules,
  size = 140,
  className,
}: VaultGraphicProps) {
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  // Clamp fillPct so we never render weird negative offsets.
  const safe = Math.max(0, Math.min(1, fillPct));

  return (
    <div
      className={["relative inline-grid place-items-center", className ?? ""].join(" ")}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="rotate-[-90deg]"
      >
        <defs>
          <linearGradient id="vault-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#14F195" />
            <stop offset="100%" stopColor="#9b6cff" />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={50}
          cy={50}
          r={radius}
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="0.7"
        />

        {/* Fill arc — animates from full circumference to (1-safe)*circ
            offset, drawing more of the ring as the vault stays full. */}
        <motion.circle
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          stroke="url(#vault-fill)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - safe) }}
          transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Rules ring — 4 small pips at quadrant centers. Active = solid,
            inactive = hollow. */}
        {RULE_PIPS.map((rule, i) => {
          const angle = (i / 4) * Math.PI * 2;
          const r = 49;
          const cx = 50 + Math.cos(angle) * r;
          const cy = 50 + Math.sin(angle) * r;
          const active = rules[rule];
          return (
            <circle
              key={rule}
              cx={cx}
              cy={cy}
              r="2.6"
              fill={active ? "#14F195" : "rgba(255,255,255,0.1)"}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth="0.4"
            />
          );
        })}
      </svg>

      {/* Center label — un-rotated since SVG is rotated -90 above */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-xs font-semibold tracking-tight">{label}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wide text-foreground/40">
            vault
          </div>
        </div>
      </div>

      {/* Rule legend below the dial */}
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-wide">
          {RULE_PIPS.map((rule) => (
            <span
              key={rule}
              className={
                rules[rule]
                  ? "text-emerald-300"
                  : "text-foreground/30"
              }
              title={`${rule}: ${rules[rule] ? "active" : "inactive"}`}
            >
              {RULE_LABELS[rule]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
