"use client";

/**
 * Wave 6.1 — landing stats strip.
 *
 * Fetches `/api/stats/landing` on mount. If `is_presentable` is false,
 * renders nothing — the strip stays hidden rather than show small or
 * fake numbers. Numbers count up on first scroll-into-view.
 */

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

interface LandingStats {
  ok: true;
  total_allow_volume_usdc: string;
  total_allow_volume_display: string;
  p50_confirmation_ms: number;
  total_denied_count: number;
  is_presentable: boolean;
  as_of: string;
}

export function LandingStatsStrip() {
  const [data, setData] = useState<LandingStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/landing")
      .then((r) => r.json())
      .then((j: LandingStats) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || !data || !data.is_presentable) {
    return null;
  }

  return (
    <section
      style={{
        maxWidth: 1216,
        margin: "0 auto",
        padding: "28px 32px",
        borderTop: "1px solid var(--w6-rule)",
        borderBottom: "1px solid var(--w6-rule)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 0,
        }}
        className="w6-stats-grid"
      >
        <StatCell
          value={data.total_allow_volume_display}
          label="agent spend governed"
          sub="Every dollar is scoped by a human-approved rule."
          divider
        />
        <StatCell
          value={`${data.p50_confirmation_ms}ms`}
          label="receipt finality, p50"
          sub="Fast enough for agents, legible enough for people."
          divider
        />
        <StatCell
          value={data.total_denied_count.toLocaleString()}
          label="blocked policy attempts"
          sub="Denied spends become auditable proof, not vague errors."
        />
      </div>
      <style>{`
        @media (max-width: 880px) {
          .w6-stats-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .w6-stats-grid > div { padding: 0 !important; border-right: 0 !important; }
        }
      `}</style>
    </section>
  );
}

function StatCell({
  value,
  label,
  sub,
  divider,
}: {
  value: string;
  label: string;
  sub: string;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        padding: "0 32px",
        ...(divider ? { borderRight: "1px solid var(--w6-rule)" } : {}),
      }}
    >
      <CountUp final={value} />
      <div style={{ fontWeight: 600, fontSize: 14, marginTop: 6 }}>{label}</div>
      <div
        className="w6-muted"
        style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}
      >
        {sub}
      </div>
    </div>
  );
}

/**
 * Count-up: animates a numeric prefix while preserving the trailing
 * unit ($, ms, etc.). Skips animation when prefers-reduced-motion.
 */
function CountUp({ final }: { final: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => {
    // Extract numeric portion and surrounding non-numeric chars.
    const match = final.match(/^(\D*)([\d,.]+)([A-Za-z]*)$/);
    if (!match) return final;
    const prefix = match[1] ?? "";
    const numStr = match[2] ?? "0";
    const suffix = match[3] ?? "";
    const finalNum = parseFloat(numStr.replace(/,/g, ""));
    const cur = (v / 100) * finalNum;
    const decimals =
      numStr.includes(".") ? numStr.split(".")[1]!.length : 0;
    return `${prefix}${cur.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;
  });

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      mv.set(100);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const ctrl = animate(mv, 100, { duration: 0.6, ease: "easeOut" });
            obs.disconnect();
            return () => ctrl.stop();
          }
        }
        return undefined;
      },
      { threshold: 0.4 },
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [mv]);

  return (
    <motion.span
      ref={ref}
      className="w6-heading"
      style={{
        fontSize: 36,
        lineHeight: 1.05,
        display: "inline-block",
      }}
    >
      <motion.span>{display}</motion.span>
    </motion.span>
  );
}
