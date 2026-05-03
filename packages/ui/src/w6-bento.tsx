import { type CSSProperties, type ReactNode, forwardRef } from "react";

/**
 * WAVE_6 — bento card primitive.
 *
 * Variants:
 *   - "default": white gradient bg, 24px radius, 1px zinc-200 border
 *   - "flat": no gradient, smaller radius — for inline cards
 *   - "strip": dark zinc-950, white text — for the For-Builders + balance hero
 *
 * Layout helpers via classNames `span-2`, `row-2` already defined in
 * `globals.css` under `.w6-bento-grid`.
 */

export type W6BentoVariant = "default" | "flat" | "strip";

export interface W6BentoCardProps {
  variant?: W6BentoVariant;
  hover?: boolean;
  span?: 1 | 2;
  rowSpan?: 1 | 2;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onClick?: () => void;
}

const VARIANT_CLASS: Record<W6BentoVariant, string> = {
  default: "w6-card",
  flat: "w6-card-flat",
  strip: "w6-strip",
};

export const W6BentoCard = forwardRef<HTMLDivElement, W6BentoCardProps>(
  function W6BentoCard(
    {
      variant = "default",
      hover = false,
      span,
      rowSpan,
      className,
      style,
      children,
      onClick,
    },
    ref,
  ) {
    const cls = [
      VARIANT_CLASS[variant],
      hover ? "w6-card-hover" : "",
      span === 2 ? "span-2" : "",
      rowSpan === 2 ? "row-2" : "",
      "p-5 md:p-6",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <div ref={ref} className={cls} style={style} onClick={onClick}>
        {children}
      </div>
    );
  },
);

/**
 * Standardized 4-col bento grid wrapper. Use this for top-level layout;
 * `<W6BentoCard span={2}>` cells join the grid.
 */
export function W6BentoGrid({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={["w6-bento-grid", className ?? ""].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
