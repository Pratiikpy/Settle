/**
 * WAVE_6 — Settle logo.
 *
 * Two streams settling into a single anchor point — the receipt.
 * Inline SVG so it scales without rasterization, takes theme via
 * currentColor for the wordmark, and doesn't add an HTTP request.
 *
 * Identical mark also dumped to `apps/web/public/logo.svg` for og:image
 * + favicon source + brand-page download.
 */

export interface W6LogoProps {
  size?: number;
  mark?: boolean;
  wordmark?: boolean;
  className?: string;
}

export function W6Logo({
  size = 22,
  mark = true,
  wordmark = true,
  className,
}: W6LogoProps) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 9 }}
    >
      {mark ? (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-label="Settle"
          role="img"
        >
          <rect x="0.5" y="0.5" width="23" height="23" rx="6.5" fill="#0a0a0a" />
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
            opacity="0.95"
          />
          <path
            d="M12 15c2.5 0 4 1 7 1"
            stroke="#10b981"
            strokeWidth="1.7"
            strokeLinecap="round"
            opacity="0.95"
          />
          <circle cx="12" cy="12" r="1.6" fill="#fff" />
        </svg>
      ) : null}
      {wordmark ? (
        <span
          className="w6-heading"
          style={{
            fontSize: size * 0.92,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            color: "currentColor",
          }}
        >
          Settle
        </span>
      ) : null}
    </span>
  );
}
