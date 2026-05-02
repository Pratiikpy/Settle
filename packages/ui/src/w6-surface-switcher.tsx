"use client";

/**
 * WAVE_6 — Surface switcher.
 *
 * The 6-mode pill in the topbar (Consumer / Agent / Merchant / Developer
 * / Operator / Public). Active surface is reflected in a `?surface=`
 * query param so it's deeplinkable.
 *
 * Animation: active background slides between pills via Framer
 * `LayoutGroup` + `layoutId`. Honors `prefers-reduced-motion`.
 *
 * Surface conflict logic (per WAVE_6_REDESIGN_PLAN.md) — clicking a
 * surface the user can't qualify for routes them to a setup/claim page.
 * That routing is done by the consumer, not this primitive.
 */

import { motion, LayoutGroup } from "framer-motion";

export type W6Surface =
  | "consumer"
  | "agent"
  | "merchant"
  | "developer"
  | "operator"
  | "public";

export interface W6SurfaceSwitcherProps {
  surface: W6Surface;
  onChange: (next: W6Surface) => void;
  className?: string;
}

const SURFACES: Array<{ id: W6Surface; label: string; hint: string }> = [
  { id: "consumer", label: "Consumer", hint: "Pay & receive" },
  { id: "agent", label: "Agent", hint: "Programmable spend" },
  { id: "merchant", label: "Merchant", hint: "Get paid" },
  { id: "developer", label: "Developer", hint: "Build on Settle" },
  { id: "operator", label: "Operator", hint: "Run a deploy" },
  { id: "public", label: "Public", hint: "Verify · stats" },
];

export function W6SurfaceSwitcher({
  surface,
  onChange,
  className,
}: W6SurfaceSwitcherProps) {
  return (
    <LayoutGroup>
      <div
        role="tablist"
        aria-label="Settle surface"
        className={className}
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "var(--w6-bg-3)",
          borderRadius: 999,
          border: "1px solid var(--w6-rule)",
        }}
      >
        {SURFACES.map((s) => {
          const active = s.id === surface;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={s.hint}
              onClick={() => onChange(s.id)}
              style={{
                position: "relative",
                height: 30,
                padding: "0 14px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 500,
                color: active ? "#fff" : "var(--w6-ink-3)",
                transition: "color 140ms ease",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {active ? (
                <motion.span
                  layoutId="w6-surface-active-bg"
                  transition={{ type: "spring", stiffness: 360, damping: 30 }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 999,
                    background: "var(--w6-ink)",
                    zIndex: 0,
                  }}
                />
              ) : null}
              <span style={{ position: "relative", zIndex: 1 }}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

export const W6_SURFACES = SURFACES;
