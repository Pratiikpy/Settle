"use client";

import { motion } from "framer-motion";

/**
 * Animated circular progress ring. Used on Pact cards to show remaining cap.
 * Smoothly animates between values via framer-motion strokeDashoffset.
 */
export interface CountdownRingProps {
  /** 0..1 progress (1 = full cap remaining; 0 = depleted) */
  value: number;
  /** Diameter in px */
  size?: number;
  /** Stroke width in px */
  strokeWidth?: number;
  /** Tailwind class for the active arc color */
  colorClassName?: string;
  /** Tailwind class for the track */
  trackClassName?: string;
  children?: React.ReactNode;
}

export function CountdownRing({
  value,
  size = 96,
  strokeWidth = 6,
  colorClassName = "stroke-[#14F195]",
  trackClassName = "stroke-white/10",
  children,
}: CountdownRingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className={trackClassName}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className={colorClassName}
        />
      </svg>
      {children !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      )}
    </div>
  );
}
