"use client";

import { useEffect } from "react";
import Link from "next/link";
import { W6Logo } from "@settle/ui";

/**
 * Wave 6 — Root error boundary.
 *
 * Light W6 prototype palette. Caught by Next.js when a render throws.
 * Tells the user honestly that on-chain state is unaffected (the
 * receipt/anchor logic happens server-side or in the wallet, not in
 * this React tree) and gives a Try-again + Home + Verify CTA path.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[settle] uncaught:", error);
  }, [error]);

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
      <div style={{ marginBottom: 28 }}>
        <Link
          href="/"
          aria-label="Settle home"
          style={{ textDecoration: "none", color: "var(--w6-ink)" }}
        >
          <W6Logo size={28} />
        </Link>
      </div>
      <div
        aria-hidden="true"
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "1.5px solid var(--w6-rule)",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          color: "var(--w6-ink)",
          marginBottom: 24,
        }}
      >
        !
      </div>
      <h1
        className="w6-heading"
        style={{ fontSize: 28, margin: 0, color: "var(--w6-ink)" }}
      >
        Something broke
      </h1>
      <p
        className="w6-muted"
        style={{
          marginTop: 12,
          fontSize: 14,
          maxWidth: 480,
          lineHeight: 1.5,
        }}
      >
        An unexpected error happened in the UI. On-chain state is unaffected
        — only this render failed.
      </p>
      {error.digest && (
        <code
          className="w6-mono"
          style={{
            marginTop: 16,
            padding: "6px 12px",
            borderRadius: 999,
            background: "var(--w6-bg-3)",
            color: "var(--w6-ink-4)",
            fontSize: 11,
          }}
        >
          digest: {error.digest}
        </code>
      )}
      <div
        style={{
          marginTop: 28,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          onClick={reset}
          className="w6-btn w6-btn-primary w6-btn-sm"
        >
          Try again
        </button>
        <Link href="/" className="w6-btn w6-btn-secondary w6-btn-sm">
          Home
        </Link>
        <Link href="/verify" className="w6-btn w6-btn-secondary w6-btn-sm">
          Verify a receipt
        </Link>
      </div>
    </main>
  );
}
