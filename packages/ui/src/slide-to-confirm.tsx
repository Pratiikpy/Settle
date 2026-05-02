"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useRef, useState } from "react";

/**
 * F3.8 — Slide-to-confirm gesture for destructive actions.
 *
 * Drag the puck right past the threshold (default 80%) to confirm. Release
 * before threshold = snap-back cancel. Hard-confirm intentionally requires
 * a real intentional motion (not a tap or accidental swipe) so card revoke
 * is impossible by mistake.
 *
 * Why this and not a confirm dialog: confirm dialogs train users to click
 * "yes" without reading. A slide gesture asks for ~1.5 seconds of
 * deliberate motion. That's the whole point of killchain — make the act
 * feel weighty in proportion to its blast radius.
 *
 * `onConfirm` fires once when the puck crosses the threshold. The puck
 * stays at the right edge until the consumer toggles `confirmed` back to
 * false (typically by setting `revoked=true` on the parent card so this
 * component unmounts).
 */
export interface SlideToConfirmProps {
  /** Label to render. Use the destructive verb. e.g. "Slide to revoke" */
  label: string;
  /** Called once when the puck crosses the threshold. */
  onConfirm: () => void;
  /** 0..1, fraction of track to consider "confirmed". Default 0.8. */
  threshold?: number;
  /** Disable interaction (e.g. during the on-chain submit). */
  disabled?: boolean;
  className?: string;
}

const TRACK_HEIGHT = 48;
const PUCK_SIZE = 40;

export function SlideToConfirm({
  label,
  onConfirm,
  threshold = 0.8,
  disabled = false,
  className,
}: SlideToConfirmProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [confirmed, setConfirmed] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  // Visual progress 0..1 — drives the fill bar + label opacity.
  const progress = useTransform(x, [0, Math.max(1, trackWidth - PUCK_SIZE - 4)], [0, 1]);
  const labelOpacity = useTransform(progress, [0, 0.6], [1, 0.3]);
  const fillWidth = useTransform(progress, (p) => `${p * 100}%`);

  function handleDragEnd() {
    if (!trackRef.current || confirmed) return;
    const max = trackWidth - PUCK_SIZE - 4;
    const cur = x.get();
    if (cur / Math.max(1, max) >= threshold) {
      setConfirmed(true);
      animate(x, max, { duration: 0.2 });
      onConfirm();
    } else {
      animate(x, 0, {
        type: "spring",
        stiffness: 500,
        damping: 30,
      });
    }
  }

  return (
    <div
      ref={(el) => {
        trackRef.current = el;
        if (el) setTrackWidth(el.clientWidth);
      }}
      className={[
        "relative overflow-hidden rounded-full border border-red-500/40 bg-red-500/[0.08]",
        disabled ? "opacity-60" : "",
        className ?? "",
      ].join(" ")}
      style={{ height: TRACK_HEIGHT }}
    >
      {/* Fill bar — grows behind the puck */}
      <motion.div
        className="pointer-events-none absolute inset-y-0 left-0 bg-red-500/30"
        style={{ width: fillWidth }}
      />

      {/* Centered label */}
      <motion.span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-red-400"
        style={{ opacity: labelOpacity }}
      >
        {confirmed ? "Confirming…" : label}
      </motion.span>

      {/* Draggable puck */}
      <motion.button
        type="button"
        drag={disabled || confirmed ? false : "x"}
        dragConstraints={{
          left: 0,
          right: Math.max(0, trackWidth - PUCK_SIZE - 4),
        }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        whileTap={{ scale: 1.05 }}
        style={{ x, width: PUCK_SIZE, height: PUCK_SIZE, top: 4, left: 2 }}
        className="absolute grid place-items-center rounded-full bg-red-500 text-background shadow-lg disabled:cursor-not-allowed"
        aria-label={label}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M9 18l6-6-6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </motion.button>
    </div>
  );
}
