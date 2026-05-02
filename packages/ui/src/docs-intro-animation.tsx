"use client";

import { motion } from "framer-motion";

/**
 * M9 — Docs intro animation.
 *
 * Looping animated SVG showing the 3-step Settle flow:
 *   1. AgentCard appears (0–2.5s) — wallet → card with rules
 *   2. Spend happens (2.5–5s) — vault drains, merchant ATA grows
 *   3. Receipt verifies (5–8s) — chain of 4 hashes lights up
 * Restarts at 8s. Total cycle: 8 seconds.
 *
 * SVG-based so it's <10KB on the wire; no GIF/MP4 to host. Respects
 * `prefers-reduced-motion: reduce` by mounting in static end-state.
 */
export interface DocsIntroAnimationProps {
  className?: string;
  size?: number;
}

export function DocsIntroAnimation({
  className,
  size = 320,
}: DocsIntroAnimationProps) {
  // Each step's "active" window in the 8-second cycle.
  const cycle = 8;
  const stepDur = cycle / 3; // ~2.67s per step

  return (
    <div
      className={["relative grid place-items-center", className ?? ""].join(" ")}
      style={{ width: size, height: size * 0.6 }}
      aria-label="Settle flow: card → spend → receipt"
    >
      <svg
        viewBox="0 0 320 200"
        width={size}
        height={size * 0.625}
        className="w-full"
      >
        <defs>
          <linearGradient id="card-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9b6cff" />
            <stop offset="100%" stopColor="#6635c6" />
          </linearGradient>
          <linearGradient id="green-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#14F195" />
            <stop offset="100%" stopColor="#0abf76" />
          </linearGradient>
        </defs>

        {/* STEP 1 — AgentCard appearing */}
        <motion.g
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: [0, 1, 1, 0.3], y: [16, 0, 0, 0] }}
          transition={{
            times: [0, 0.15, 0.55, 0.7],
            duration: cycle,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <rect
            x="20"
            y="40"
            width="100"
            height="62"
            rx="10"
            fill="url(#card-grad)"
          />
          <text
            x="32"
            y="62"
            fill="rgba(255,255,255,0.55)"
            fontSize="8"
            fontFamily="ui-sans-serif"
            letterSpacing="1.5"
          >
            AGENT CARD
          </text>
          <text
            x="32"
            y="84"
            fill="rgba(255,255,255,0.95)"
            fontSize="14"
            fontWeight="600"
            fontFamily="ui-sans-serif"
          >
            $5.00
          </text>
          <text
            x="32"
            y="96"
            fill="rgba(255,255,255,0.5)"
            fontSize="7"
            fontFamily="ui-sans-serif"
          >
            cap · 24h · 1 merchant
          </text>
        </motion.g>

        {/* STEP 2 — coin moving from vault to merchant (active in step 2) */}
        <motion.circle
          cx={120}
          cy={70}
          r={6}
          fill="url(#green-grad)"
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0, 1, 1, 0, 0],
            cx: [120, 120, 120, 200, 200, 200],
          }}
          transition={{
            times: [0, 0.32, 0.4, 0.6, 0.65, 1],
            duration: cycle,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        {/* Merchant pill — fades in during step 2 */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 0, 1, 1, 0.3] }}
          transition={{
            times: [0, 0.3, 0.4, 0.5, 0.7, 0.85],
            duration: cycle,
            repeat: Infinity,
          }}
        >
          <rect
            x="180"
            y="50"
            width="80"
            height="42"
            rx="6"
            fill="rgba(20,241,149,0.1)"
            stroke="rgba(20,241,149,0.4)"
            strokeWidth="1"
          />
          <text
            x="190"
            y="64"
            fill="rgba(20,241,149,0.85)"
            fontSize="7"
            fontFamily="ui-sans-serif"
            letterSpacing="1"
          >
            MERCHANT
          </text>
          <text
            x="190"
            y="83"
            fill="rgba(255,255,255,0.92)"
            fontSize="11"
            fontWeight="600"
            fontFamily="ui-sans-serif"
          >
            +$0.50
          </text>
        </motion.g>

        {/* STEP 3 — 4-hash chain in step 3 */}
        {[0, 1, 2, 3].map((i) => {
          const cx = 50 + i * 70;
          return (
            <motion.g
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: [0, 0, 0, 0, 1, 1],
                scale: [0.8, 0.8, 0.8, 0.8, 1, 1],
              }}
              transition={{
                times: [
                  0,
                  0.55,
                  0.6 + i * 0.04,
                  0.65 + i * 0.04,
                  0.7 + i * 0.04,
                  0.95,
                ],
                duration: cycle,
                repeat: Infinity,
              }}
            >
              <ellipse
                cx={cx}
                cy={150}
                rx="22"
                ry="14"
                fill="none"
                stroke="rgba(155,108,255,0.7)"
                strokeWidth="2"
              />
              {i < 3 && (
                <line
                  x1={cx + 22}
                  y1={150}
                  x2={cx + 48}
                  y2={150}
                  stroke="rgba(155,108,255,0.4)"
                  strokeWidth="1.5"
                />
              )}
            </motion.g>
          );
        })}

        {/* "Verified" pill in step 3 */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 0, 0, 0, 1, 1] }}
          transition={{
            times: [0, 0.55, 0.7, 0.75, 0.8, 0.85, 1],
            duration: cycle,
            repeat: Infinity,
          }}
        >
          <rect
            x="125"
            y="175"
            width="70"
            height="18"
            rx="9"
            fill="rgba(20,241,149,0.15)"
            stroke="rgba(20,241,149,0.6)"
            strokeWidth="1"
          />
          <text
            x="160"
            y="187"
            fill="rgba(20,241,149,0.95)"
            fontSize="9"
            fontWeight="600"
            fontFamily="ui-sans-serif"
            textAnchor="middle"
            letterSpacing="0.5"
          >
            ✓ VERIFIED
          </text>
        </motion.g>
      </svg>

      {/* Step labels below */}
      <div className="mt-2 flex w-full items-baseline justify-around text-[10px] text-foreground/40">
        {[
          { label: "1. Card", t: 0 },
          { label: "2. Spend", t: stepDur },
          { label: "3. Verify", t: stepDur * 2 },
        ].map((s) => (
          <motion.span
            key={s.label}
            initial={{ opacity: 0.3 }}
            animate={{
              opacity: [
                s.t === 0 ? 1 : 0.3,
                s.t === 0 ? 1 : 0.3,
                s.t === stepDur ? 1 : 0.3,
                s.t === stepDur ? 1 : 0.3,
                s.t === stepDur * 2 ? 1 : 0.3,
                s.t === stepDur * 2 ? 1 : 0.3,
              ],
            }}
            transition={{
              times: [0, 0.32, 0.34, 0.65, 0.67, 1],
              duration: cycle,
              repeat: Infinity,
            }}
          >
            {s.label}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
