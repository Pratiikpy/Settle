"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Apple-Pay-style trust gesture overlay shown briefly when the user signs with Phantom.
 * Subtle haptic-tier visual; resolves into success/fail.
 *
 * F2 polish:
 *   • Tighter animation timings (160ms enter / 200ms exit) so the overlay itself doesn't
 *     mask the actual <400ms chain settlement we're trying to celebrate.
 *   • Haptic on each transition edge (signing → confirming → success / error). Calibrated:
 *     small tick on signing, slightly bigger on confirming, three-pulse on success, double-
 *     tap-error on failure. No-op on desktop / reduced-motion.
 *   • Elapsed-time readout ("Confirmed in 0.42s") computed from when state transitioned
 *     from signing to success. Speed becomes the headline.
 *   • Custom easing curve [0.32, 0.72, 0, 1.0] — the iOS-physics motion curve, makes the
 *     resolve feel snappier without being abrupt.
 */
export interface TrustGestureProps {
  state: "idle" | "signing" | "confirming" | "success" | "error";
  message?: string;
}

function lightHaptic(pattern: number | number[]) {
  if (typeof window === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

export function TrustGesture({ state, message }: TrustGestureProps) {
  const startedAtRef = useRef<number | null>(null);
  const lastStateRef = useRef<TrustGestureProps["state"]>("idle");
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    const prev = lastStateRef.current;
    if (state === "signing" && prev !== "signing") {
      startedAtRef.current = performance.now();
      setElapsedMs(null);
      lightHaptic(8);
    } else if (state === "confirming" && prev === "signing") {
      lightHaptic(10);
    } else if (state === "success" && prev !== "success") {
      const start = startedAtRef.current;
      setElapsedMs(start !== null ? Math.max(0, Math.round(performance.now() - start)) : null);
      lightHaptic([15, 30, 15]);
    } else if (state === "error" && prev !== "error") {
      lightHaptic([40, 20, 40]);
    }
    lastStateRef.current = state;
  }, [state]);

  if (state === "idle") return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: state === "success" ? 0.16 : 0.2, ease: [0.32, 0.72, 0.0, 1.0] }}
        className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center"
      >
        <div className="rounded-full border border-white/10 bg-black/80 px-4 py-2 text-xs backdrop-blur">
          {state === "signing" && (
            <span className="flex items-center gap-2 text-white/80">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              {message ?? "Signing in Phantom…"}
            </span>
          )}
          {state === "confirming" && (
            <span className="flex items-center gap-2 text-white/80">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#14F195]" />
              {message ?? "Confirming on Solana…"}
            </span>
          )}
          {state === "success" && (
            <span className="flex items-center gap-2 text-[#14F195]">
              <span className="h-2 w-2 rounded-full bg-[#14F195]" />
              {message ?? formatSuccess(elapsedMs)}
            </span>
          )}
          {state === "error" && (
            <span className="flex items-center gap-2 text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              {message ?? "Failed — try again"}
            </span>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Formats the success line as "Confirmed in 0.42s" — speed becomes the headline. */
function formatSuccess(elapsedMs: number | null): string {
  if (elapsedMs === null) return "Confirmed";
  const seconds = (elapsedMs / 1000).toFixed(2);
  return `Confirmed in ${seconds}s`;
}
