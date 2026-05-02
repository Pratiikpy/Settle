import { type ReactNode } from "react";

/**
 * WAVE_6 — stat block: big number + label + optional sub.
 * Used in landing strip + per-page bento cells.
 *
 * The `value` is rendered as Outfit (heading font). Pass a string —
 * caller is responsible for formatting (`$1,234.50`, `423ms`, etc.).
 */

export interface W6StatProps {
  value: string;
  label: string;
  sub?: string | undefined;
  size?: "sm" | "md" | "lg" | "xl" | undefined;
  className?: string | undefined;
  /** Optional skeleton placeholder while async data loads. */
  loading?: boolean | undefined;
}

const SIZE_PX: Record<NonNullable<W6StatProps["size"]>, number> = {
  sm: 22,
  md: 28,
  lg: 36,
  xl: 64,
};

export function W6Stat({
  value,
  label,
  sub,
  size = "lg",
  className,
  loading = false,
}: W6StatProps) {
  const valueFontSize = SIZE_PX[size];
  return (
    <div className={className}>
      {loading ? (
        <span
          className="w6-skel block"
          style={{ width: 120, height: valueFontSize, marginBottom: 8 }}
          aria-busy="true"
          aria-label={`${label} loading`}
        />
      ) : (
        <span
          className="w6-heading block"
          style={{ fontSize: valueFontSize, lineHeight: 1.05, color: "var(--w6-ink)" }}
        >
          {value}
        </span>
      )}
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginTop: 6,
          color: "var(--w6-ink)",
        }}
      >
        {label}
      </div>
      {sub ? (
        <div
          className="w6-muted"
          style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}
