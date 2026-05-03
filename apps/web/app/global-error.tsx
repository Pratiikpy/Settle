"use client";

/**
 * Next.js 15 App Router root error boundary.
 *
 * Catches errors thrown anywhere in the App Router tree that bubble
 * past per-route error.tsx boundaries. Without this file, root-level
 * errors render the Next default page and never reach Sentry. (AU-09-008.)
 *
 * Pattern from https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#fafafa",
          color: "#09090b",
          fontFamily:
            'var(--font-w6-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <section
            style={{
              width: "min(100%, 520px)",
              border: "1.5px solid #e4e4e7",
              borderRadius: 8,
              background: "linear-gradient(180deg, #fbfaf5, #fffdf7)",
              padding: 28,
              textAlign: "center",
              boxShadow: "0 1px 0 rgba(10, 10, 10, 0.04)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 28,
                padding: "3px 9px",
                border: "1.5px solid #27272a",
                borderRadius: 4,
                fontFamily:
                  'var(--font-w6-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                transform: "rotate(-3deg)",
              }}
            >
              Render failed
            </div>
            <h1
              style={{
                margin: "24px 0 0",
                fontSize: 28,
                lineHeight: 1.15,
                fontWeight: 650,
              }}
            >
              Settle hit a UI error
            </h1>
            <p
              style={{
                margin: "12px auto 0",
                maxWidth: 420,
                color: "#52525b",
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              The page render failed, but wallet approvals and on-chain state are
              not changed by this screen.
            </p>
            {error.digest ? (
              <code
                style={{
                  display: "inline-flex",
                  marginTop: 16,
                  padding: "6px 10px",
                  border: "1px dashed #c8c4b8",
                  borderRadius: 6,
                  color: "#52525b",
                  fontSize: 11,
                }}
              >
                digest: {error.digest}
              </code>
            ) : null}
            <div
              style={{
                marginTop: 24,
                height: 1,
                background:
                  "repeating-linear-gradient(to right, #c8c4b8 0 5px, transparent 5px 10px)",
              }}
            />
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 34,
                marginTop: 24,
                padding: "0 14px",
                borderRadius: 6,
                background: "#09090b",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Back to home
            </a>
          </section>
        </main>
      </body>
    </html>
  );
}
