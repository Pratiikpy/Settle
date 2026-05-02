import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * Settle favicon — same mark as W6Logo (`packages/ui/src/w6-logo.tsx`):
 * dark rounded square with two white-ink horizontal strokes (the
 * "settled" pair) and two emerald strokes (the counter-flow), centered
 * by a white anchor dot. Renders crisp at 16×16 and 32×32.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          borderRadius: 14,
        }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 7c3 0 4.5 2 7 2"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M5 17c3 0 4.5-2 7-2"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M12 9c2.5 0 4-1 7-1"
            stroke="#10b981"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M12 15c2.5 0 4 1 7 1"
            stroke="#10b981"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="1.6" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
