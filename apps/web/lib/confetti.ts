"use client";

import confetti from "canvas-confetti";

/**
 * Confetti calibrated to amount (F1).
 *
 * Most apps treat $1 and $1000 the same. We don't: small puff for tiny tips, screen-takeover
 * for big ones. The magnitude of celebration matches the magnitude of money. This is a small
 * UX detail that compounds with sub-400ms confirm time to make settlement feel sensory rather
 * than transactional.
 *
 * Tier breakpoints (USDC):
 *   under $1   → puff (20 particles, light haptic)
 *   $1 to $5   → standard (80 particles, brand colors, single cannon)
 *   $5 to $50  → mid (160 particles, two side cannons, gold accents)
 *   $50+       → takeover (300+ particles in 3 salvos, sustained, full haptic burst)
 *
 * Backward-compat: callers that pass no amount get "standard" — same as the legacy behavior.
 */

const SOLANA_PURPLE = "#9945FF";
const SOLANA_GREEN = "#14F195";
const GOLD = "#FFD166";
const WHITE = "#FFFFFF";

export type ConfettiTier = "puff" | "standard" | "mid" | "takeover";

export function tierForAmountUsdc(amountUsdc: number): ConfettiTier {
  if (amountUsdc < 1) return "puff";
  if (amountUsdc < 5) return "standard";
  if (amountUsdc < 50) return "mid";
  return "takeover";
}

function reducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Fire confetti calibrated to a USDC amount. Pass undefined to use "standard" — same as
 * the original behavior, used by paths that don't yet thread an amount.
 */
export function fireSettlementConfetti(amountUsdc?: number) {
  const tier = amountUsdc !== undefined ? tierForAmountUsdc(amountUsdc) : "standard";
  fireTier(tier);
}

export function fireTier(tier: ConfettiTier) {
  if (reducedMotion()) return;
  switch (tier) {
    case "puff":
      void confetti({
        particleCount: 20,
        spread: 40,
        startVelocity: 18,
        origin: { y: 0.6 },
        colors: [SOLANA_GREEN, SOLANA_PURPLE, WHITE],
        ticks: 90,
        gravity: 1.4,
        scalar: 0.6,
        disableForReducedMotion: true,
      });
      return;
    case "standard":
      void confetti({
        particleCount: 80,
        spread: 70,
        startVelocity: 35,
        origin: { y: 0.7 },
        colors: [SOLANA_PURPLE, SOLANA_GREEN],
        ticks: 200,
        gravity: 1.1,
        scalar: 0.9,
        disableForReducedMotion: true,
      });
      return;
    case "mid": {
      const opts = {
        particleCount: 80,
        spread: 60,
        startVelocity: 40,
        ticks: 240,
        gravity: 1.0,
        scalar: 1.0,
        colors: [SOLANA_PURPLE, SOLANA_GREEN, GOLD],
        disableForReducedMotion: true,
      };
      void confetti({ ...opts, origin: { x: 0.2, y: 0.7 } });
      void confetti({ ...opts, origin: { x: 0.8, y: 0.7 } });
      return;
    }
    case "takeover": {
      const baseOpts = {
        spread: 90,
        startVelocity: 55,
        ticks: 320,
        gravity: 0.85,
        scalar: 1.15,
        colors: [SOLANA_PURPLE, SOLANA_GREEN, GOLD, WHITE],
        disableForReducedMotion: true,
      };
      void confetti({ ...baseOpts, particleCount: 120, origin: { x: 0.05, y: 0.85 } });
      void confetti({ ...baseOpts, particleCount: 120, origin: { x: 0.95, y: 0.85 } });
      window.setTimeout(() => {
        void confetti({ ...baseOpts, particleCount: 80, origin: { x: 0.5, y: 0.6 } });
      }, 250);
      window.setTimeout(() => {
        void confetti({
          ...baseOpts,
          particleCount: 120,
          startVelocity: 35,
          origin: { x: 0.5, y: 0.4 },
          gravity: 1.2,
          ticks: 400,
        });
      }, 600);
      return;
    }
  }
}

/** Smaller burst used for individual receipt mints during agent activity. */
export function fireReceiptBurst() {
  fireTier("puff");
}

/**
 * Haptic-tier feedback. Calibrated by tier so the whole celebration scales together.
 * No-op on desktop / reduced-motion.
 *
 * Backward-compat: trustGesture() with no amount keeps the original 8ms vibrate.
 */
export function trustGesture(amountUsdc?: number) {
  if (typeof window === "undefined" || !("vibrate" in navigator)) return;
  if (amountUsdc === undefined) {
    try {
      navigator.vibrate?.(8);
    } catch {
      // ignore
    }
    return;
  }
  const tier = tierForAmountUsdc(amountUsdc);
  try {
    switch (tier) {
      case "puff":
        navigator.vibrate?.(8);
        return;
      case "standard":
        navigator.vibrate?.(15);
        return;
      case "mid":
        navigator.vibrate?.([20, 40, 30]);
        return;
      case "takeover":
        navigator.vibrate?.([30, 60, 30, 60, 80]);
        return;
    }
  } catch {
    // ignore
  }
}

/** Big-tip threshold ($50+) — used by the proxy push path to send an extra-emphatic push. */
export const BIG_TIP_USDC_THRESHOLD = 50;
