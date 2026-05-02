import { type ReactNode } from "react";

/**
 * WAVE_6 — pill primitive for status, kind, decision tags.
 *
 * Tone variants map to the prototype's `pill / pill-ok / pill-bad`.
 * Always renders a dot + text so color isn't the only signal (color
 * blindness friendly).
 */

export type W6PillTone = "neutral" | "ok" | "bad" | "warn" | "mono";

export interface W6PillProps {
  tone?: W6PillTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const TONE_CLASS: Record<W6PillTone, string> = {
  neutral: "w6-pill",
  ok: "w6-pill w6-pill-ok",
  bad: "w6-pill w6-pill-bad",
  warn: "w6-pill",
  mono: "w6-pill w6-mono",
};

export function W6Pill({
  tone = "neutral",
  dot = true,
  children,
  className,
}: W6PillProps) {
  const cls = [TONE_CLASS[tone], className ?? ""].filter(Boolean).join(" ");
  return (
    <span className={cls}>
      {dot && tone !== "mono" ? <span className="dot" aria-hidden /> : null}
      {children}
    </span>
  );
}
