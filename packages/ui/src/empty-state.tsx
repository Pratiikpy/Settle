"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * F1.5 — Teaching empty state.
 *
 * Drop into any list view that can be empty. Communicates:
 *   1. There's nothing here YET — not a bug, not a 404
 *   2. Why someone would want this thing
 *   3. The exact next action that creates the first one
 *
 * Visual: icon glyph + 1-line headline + 2-line teach copy + primary CTA
 * + optional secondary link. Subtle entry animation so it doesn't feel
 * like a bug-page void.
 */
export interface EmptyStateProps {
  /** A single emoji or short string. Used as the visual anchor. */
  icon?: string;
  /** Single sentence. "No receipts yet." */
  title: string;
  /** 1–3 sentences. Why this matters + how to make one appear. */
  teach: ReactNode;
  /** Primary action — gradient pill, the "obvious next step." */
  primary?: { label: string; href?: string; onClick?: () => void };
  /** Secondary action — text link below. */
  secondary?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}

export function EmptyState({
  icon = "✦",
  title,
  teach,
  primary,
  secondary,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={[
        "rounded-3xl border border-foreground/10 bg-foreground/[0.02] p-10 text-center",
        className ?? "",
      ].join(" ")}
    >
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-foreground/10 bg-foreground/[0.04] text-2xl">
        {icon}
      </div>
      <h3 className="mt-5 text-lg font-medium">{title}</h3>
      <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-foreground/60">
        {teach}
      </div>
      {(primary || secondary) && (
        <div className="mt-6 flex flex-col items-center gap-2">
          {primary && <PrimaryButton {...primary} />}
          {secondary && <SecondaryButton {...secondary} />}
        </div>
      )}
    </motion.div>
  );
}

function PrimaryButton(p: { label: string; href?: string; onClick?: () => void }) {
  const cls =
    "inline-flex h-11 items-center justify-center rounded-full bg-accent px-7 text-sm font-medium text-background transition hover:opacity-90";
  if (p.href) {
    return (
      <a href={p.href} className={cls}>
        {p.label}
      </a>
    );
  }
  return (
    <button type="button" onClick={p.onClick} className={cls}>
      {p.label}
    </button>
  );
}

function SecondaryButton(p: { label: string; href?: string; onClick?: () => void }) {
  const cls = "text-xs text-foreground/50 hover:text-foreground";
  if (p.href) {
    return (
      <a href={p.href} className={cls}>
        {p.label}
      </a>
    );
  }
  return (
    <button type="button" onClick={p.onClick} className={cls}>
      {p.label}
    </button>
  );
}
