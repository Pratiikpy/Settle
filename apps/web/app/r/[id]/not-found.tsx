import Link from "next/link";

/**
 * /r/[id] route-scoped 404. Replaces the generic site-wide 404 when a
 * receipt id is malformed or unknown. Gives the user a useful next
 * action (verify a hash or go home) instead of a generic dead-end.
 */
export default function ReceiptNotFound() {
  return (
    <main
      data-testid="receipt-not-found"
      style={{
        minHeight: "100vh",
        background: "var(--w6-bg-2, #fafaf7)",
        color: "var(--w6-ink, #0a0a0c)",
        fontFamily:
          "ui-sans-serif, -apple-system, system-ui, Segoe UI, Roboto, sans-serif",
        padding: "32px 16px 64px",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <Link
          href="/"
          style={{ fontSize: 13, color: "inherit", textDecoration: "none" }}
        >
          ← Settle
        </Link>
        <div
          style={{
            marginTop: 64,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--w6-ink-3, #5a5f66)",
          }}
        >
          SETTLE · RECEIPT
        </div>
        <h1
          style={{
            marginTop: 16,
            fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          Receipt not found.
        </h1>
        <p
          style={{
            marginTop: 14,
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--w6-ink-3, #5a5f66)",
          }}
        >
          Either this id is malformed, the receipt has been pruned, or you
          followed a broken link. If you have the receipt hash, you can still
          verify it directly.
        </p>
        <div
          style={{
            marginTop: 32,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link
            href="/verify"
            data-testid="receipt-not-found-verify-cta"
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              background: "#0a0a0c",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Verify a receipt hash →
          </Link>
          <Link
            href="/"
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              background: "#fff",
              color: "#0a0a0c",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
              border: "1px solid rgba(0,0,0,0.12)",
            }}
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
