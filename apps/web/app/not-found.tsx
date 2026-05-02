import Link from "next/link";
import { W6Logo } from "@settle/ui";

/**
 * Wave 6 — 404 page.
 *
 * Light-first prototype palette so it sits naturally inside the rest of
 * the W6 surfaces. Standalone (no W6AppShell since the user might be
 * deep-linked to a path that doesn't belong to any surface) but uses
 * the same tokens.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--w6-bg-2)",
        color: "var(--w6-ink)",
        textAlign: "center",
      }}
    >
      <div style={{ marginBottom: 32 }}>
        <Link
          href="/"
          aria-label="Settle home"
          style={{ textDecoration: "none", color: "var(--w6-ink)" }}
        >
          <W6Logo size={28} />
        </Link>
      </div>
      <div
        className="w6-heading"
        style={{
          fontSize: 84,
          lineHeight: 1,
          color: "var(--w6-ink)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        404
      </div>
      <p
        style={{
          marginTop: 24,
          fontSize: 18,
          fontWeight: 500,
          color: "var(--w6-ink)",
          maxWidth: 480,
        }}
      >
        This page doesn&rsquo;t exist on Solana.
      </p>
      <p
        className="w6-muted"
        style={{
          marginTop: 8,
          fontSize: 14,
          maxWidth: 480,
          lineHeight: 1.5,
        }}
      >
        Maybe the link is wrong, or the resource was revoked. Every Settle
        path resolves to a verifiable receipt — this one didn&rsquo;t.
      </p>
      <div
        style={{
          marginTop: 32,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <Link href="/" className="w6-btn w6-btn-primary w6-btn-sm">
          Back to home
        </Link>
        <Link href="/dashboard" className="w6-btn w6-btn-secondary w6-btn-sm">
          Open dashboard
        </Link>
        <Link href="/verify" className="w6-btn w6-btn-secondary w6-btn-sm">
          Verify a receipt
        </Link>
      </div>
    </main>
  );
}
