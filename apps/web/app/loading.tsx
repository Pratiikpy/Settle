/**
 * Wave 6 — global loading fallback.
 *
 * Rendered by Next.js while a server component segment is streaming.
 * For client-rendered pages this is what a judge sees in the very first
 * SSR HTML, before JS hydrates. Showing a structured skeleton (header
 * line, content rows) instead of a bare "Loading..." prevents the
 * "blank page" perception on slow connections and JS-disabled browsers.
 */
export default function GlobalLoading() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--w6-bg-2)",
        color: "var(--w6-ink)",
        padding: "24px clamp(14px, 3vw, 28px) 88px",
        maxWidth: 1100,
        margin: "0 auto",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      {/* Top chrome strip — mimics the topbar so the layout feels intact */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 28,
          paddingBottom: 12,
          borderBottom: "1px solid var(--w6-rule)",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          Settle
        </div>
        <div
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            border: "2px solid var(--w6-rule)",
            borderTopColor: "var(--w6-ink)",
            borderRadius: "50%",
            animation: "w6-spin 0.7s linear infinite",
            marginLeft: "auto",
          }}
        />
      </div>

      {/* Page title skeleton */}
      <Skeleton width="62%" height={32} marginBottom={10} />
      <Skeleton width="38%" height={16} marginBottom={28} />

      {/* Three content rows */}
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />

      <noscript>
        <p style={{ marginTop: 24, fontSize: 13, color: "var(--w6-ink-2)" }}>
          Settle requires JavaScript to render the live dashboard, verifier,
          and receipt views. The on-chain receipts themselves are
          framework-agnostic and can be re-derived using the public SDKs against{" "}
          <a
            href="https://github.com/Pratiikpy/Settle"
            style={{ color: "var(--w6-ink)" }}
          >
            github.com/Pratiikpy/Settle
          </a>
          .
        </p>
      </noscript>

      <style>{`
        @keyframes w6-spin { to { transform: rotate(360deg); } }
        @keyframes w6-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-hidden="true"] { animation: none !important; }
          [data-skeleton] { animation: none !important; }
        }
      `}</style>
    </main>
  );
}

function Skeleton({
  width,
  height,
  marginBottom,
}: {
  width: string | number;
  height: number;
  marginBottom?: number;
}) {
  return (
    <div
      data-skeleton="1"
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height,
        background:
          "linear-gradient(90deg, var(--w6-rule) 0%, var(--w6-paper) 50%, var(--w6-rule) 100%)",
        backgroundSize: "200% 100%",
        borderRadius: 6,
        marginBottom: marginBottom ?? 0,
        animation: "w6-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

function SkeletonRow() {
  return (
    <div
      style={{
        marginBottom: 24,
        padding: 18,
        borderRadius: 10,
        background: "var(--w6-bg)",
        border: "1px solid var(--w6-rule)",
      }}
    >
      <Skeleton width="32%" height={14} marginBottom={12} />
      <Skeleton width="78%" height={12} marginBottom={8} />
      <Skeleton width="56%" height={12} />
    </div>
  );
}
