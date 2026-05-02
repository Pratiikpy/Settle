"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * F2.7 — Hash-chain animation.
 *
 * Visual: 4 chain links drawing in sequence (one per hash:
 * receipt → reason → policy_snapshot → purpose). Each link is an SVG
 * `<path>` with stroke-dasharray/dashoffset animated; total duration
 * ~1.2s.
 *
 * Plays at most ONCE per receipt-id per browser session, gated on
 * sessionStorage so re-rendering the receipt page doesn't re-play.
 *
 * `prefers-reduced-motion: reduce` skips the draw and renders the static
 * end state immediately — accessibility default.
 */
export interface HashChainAnimationProps {
  /** receipt request_id — used as the sessionStorage key. */
  receiptId: string;
  className?: string;
}

const STORAGE_PREFIX = "settle:chain-animated:";

export function HashChainAnimation({ receiptId, className }: HashChainAnimationProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Respect reduced-motion at component level — Framer's motion-reduce: hidden
    // hides the animated overlay, but we want the static end state to be
    // visible even with reduced motion. So we skip the animation but still mount.
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      setShouldAnimate(false);
      return;
    }
    const key = `${STORAGE_PREFIX}${receiptId}`;
    if (sessionStorage.getItem(key)) {
      setShouldAnimate(false);
      return;
    }
    sessionStorage.setItem(key, "1");
    setShouldAnimate(true);
  }, [receiptId]);

  // Position 4 link "ovals" in a row, each connected to the next.
  // Coordinate space: 0..400 wide, 0..80 tall.
  const labels = ["receipt", "reason", "policy", "purpose"] as const;

  return (
    <div className={["w-full", className ?? ""].join(" ")}>
      <svg
        viewBox="0 0 400 80"
        className="h-20 w-full"
        aria-label="hash chain"
      >
        <defs>
          <linearGradient id="link-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(20,241,149,0.9)" />
            <stop offset="100%" stopColor="rgba(155,108,255,0.9)" />
          </linearGradient>
        </defs>

        {/* Connector segments behind each pair of links. pathLength is a
            Framer Motion convenience that handles stroke-dasharray internally
            so we don't have to do the math. */}
        {labels.slice(0, -1).map((_, i) => {
          const x1 = 50 + i * 100 + 28;
          const x2 = 50 + (i + 1) * 100 - 28;
          const fullPath = `M${x1},40 L${x2},40`;
          return (
            <motion.path
              key={`c-${i}`}
              d={fullPath}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="2"
              fill="none"
              {...(shouldAnimate
                ? {
                    initial: { pathLength: 0 },
                    animate: { pathLength: 1 },
                    transition: {
                      duration: 0.18,
                      delay: 0.15 + i * 0.22,
                    },
                  }
                : {})}
            />
          );
        })}

        {/* The 4 link rings */}
        {labels.map((label, i) => {
          const cx = 50 + i * 100;
          return (
            <g key={label}>
              <motion.ellipse
                cx={cx}
                cy={40}
                rx="22"
                ry="14"
                fill="none"
                stroke="url(#link-stroke)"
                strokeWidth="2.5"
                {...(shouldAnimate
                  ? {
                      initial: { pathLength: 0, opacity: 0 },
                      animate: { pathLength: 1, opacity: 1 },
                      transition: {
                        duration: 0.35,
                        delay: i * 0.22,
                        ease: [0.16, 1, 0.3, 1],
                      },
                    }
                  : {})}
              />
              <motion.text
                x={cx}
                y={68}
                fontSize="9"
                textAnchor="middle"
                fill="rgba(255,255,255,0.55)"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                {...(shouldAnimate
                  ? {
                      initial: { opacity: 0 },
                      animate: { opacity: 1 },
                      transition: { duration: 0.2, delay: 0.2 + i * 0.22 },
                    }
                  : {})}
              >
                {label}
              </motion.text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
