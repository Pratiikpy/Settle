"use client";

import { motion, AnimatePresence } from "framer-motion";

/**
 * M1 — Wax-seal animation for Pact creation.
 *
 * A circular "stamp" presses down with a slight rotation + bounce, then
 * settles. Designed to play once on the success state of an open_pact tx.
 *
 * Mount the component conditionally on the success boolean — it animates
 * its own enter and exit. Stays visible while `active=true`, fades out
 * when toggled false.
 *
 * `prefers-reduced-motion` users get a static seal (no scale/rotation
 * springs) but still see the seal — it's a state indicator, not just
 * decoration.
 */
export interface WaxSealProps {
  active: boolean;
  /** Tiny inscription on the seal. Default "PACT" — short word so it fits. */
  inscription?: string;
  /** Pixel diameter of the seal. Default 96. */
  size?: number;
  className?: string;
}

export function WaxSeal({
  active,
  inscription = "PACT",
  size = 96,
  className,
}: WaxSealProps) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ scale: 1.6, rotate: -12, opacity: 0, y: -20 }}
          animate={{
            scale: [1.6, 0.95, 1.05, 1],
            rotate: [-12, 4, -2, 0],
            opacity: 1,
            y: 0,
          }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{
            duration: 0.9,
            times: [0, 0.5, 0.75, 1],
            ease: [0.16, 1, 0.3, 1],
          }}
          className={[
            "pointer-events-none grid place-items-center motion-reduce:transition-none motion-reduce:[--x-init:0]",
            className ?? "",
          ].join(" ")}
          style={{ width: size, height: size }}
          aria-hidden
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            className="drop-shadow-[0_4px_20px_rgba(155,108,255,0.45)]"
          >
            <defs>
              <radialGradient id="wax-fill" cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#c98aff" />
                <stop offset="55%" stopColor="#9b6cff" />
                <stop offset="100%" stopColor="#6635c6" />
              </radialGradient>
              <radialGradient id="wax-rim" cx="50%" cy="50%" r="50%">
                <stop offset="85%" stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
              </radialGradient>
            </defs>

            {/* Bumpy outer rim — circle with sinusoidal perturbation. */}
            <path
              d={makeBumpyCircle(50, 50, 44, 18)}
              fill="url(#wax-fill)"
            />
            {/* Inner shadow ring */}
            <circle cx={50} cy={50} r={44} fill="url(#wax-rim)" />
            {/* Inner sigil ring */}
            <circle
              cx={50}
              cy={50}
              r={36}
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="0.6"
            />
            <circle
              cx={50}
              cy={50}
              r={32}
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="0.4"
            />
            {/* Inscription */}
            <text
              x={50}
              y={56}
              textAnchor="middle"
              fontFamily="ui-serif, Georgia, serif"
              fontSize="14"
              fontWeight="bold"
              fill="rgba(255,255,255,0.92)"
              letterSpacing="3"
            >
              {inscription}
            </text>
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** SVG path for a circle with bumpy edges (the wax-press marks). */
function makeBumpyCircle(cx: number, cy: number, r: number, bumps: number): string {
  const points: string[] = [];
  const steps = bumps * 8;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const wave = Math.cos(angle * bumps);
    const radius = r + wave * 1.6;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ") + " Z";
}
