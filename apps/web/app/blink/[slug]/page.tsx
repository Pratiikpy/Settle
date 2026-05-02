/**
 * /blink/[slug] — Public Blink share page.
 *
 * Wave 6 — light W6 prototype palette. Server-rendered preview of the
 * agent template; the actual Blink rendering on Twitter/Phantom is
 * driven by `/api/actions/hire/[slug]`. This page is the fallback HTML
 * view a recipient lands on if their client doesn't unfurl Solana
 * Actions.
 */

import Link from "next/link";
import { W6Logo } from "@settle/ui";

interface BlinkParams {
  params: Promise<{ slug: string }>;
}

export default async function BlinkPage({ params }: BlinkParams) {
  const { slug } = await params;
  const isResearch = slug === "research";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--w6-bg-2)",
        color: "var(--w6-ink)",
        padding: "32px 24px",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href="/"
          aria-label="Settle home"
          style={{ textDecoration: "none", color: "var(--w6-ink)" }}
        >
          <W6Logo size={22} />
        </Link>
        <Link
          href="/agents/templates"
          className="w6-btn w6-btn-ghost w6-btn-sm"
        >
          Browse templates →
        </Link>
      </div>

      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div className="w6-card" style={{ padding: 28 }}>
          <div className="w6-eyebrow" style={{ fontSize: 11, marginBottom: 8 }}>
            Solana Blink · share link
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 28, margin: 0, lineHeight: 1.05 }}
          >
            Hire this AI agent
          </h1>
          <p
            className="w6-muted"
            style={{
              marginTop: 10,
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            {isResearch
              ? "Research any topic, $0.50–$2 max. Returns a 3-page brief in 5 minutes."
              : "Custom agent template."}
          </p>

          <div
            className="w6-card-flat"
            style={{
              padding: 16,
              marginTop: 22,
              fontSize: 13,
            }}
          >
            <Row label="Cap" value="$0.50 USDC" mono />
            <Row
              label="Allowlist"
              value="ArxivFetch · TranslateAPI · SummaryLLM"
            />
            <Row label="Expiry" value="15 min" />
          </div>

          <Link
            href={`/agents/templates/${slug}`}
            className="w6-btn w6-btn-primary w6-btn-lg"
            style={{ width: "100%", marginTop: 22, justifyContent: "center" }}
          >
            Hire — connect Phantom
          </Link>

          <p
            className="w6-muted"
            style={{
              marginTop: 16,
              fontSize: 11.5,
              textAlign: "center",
              lineHeight: 1.55,
            }}
          >
            You sign a Pact card. Watch the agent work. Get a deliverable +
            cNFT receipt.
          </p>
        </div>

        <p
          className="w6-muted"
          style={{
            marginTop: 24,
            textAlign: "center",
            fontSize: 11,
          }}
        >
          Powered by Solana Actions · Phantom-renderable on Twitter
        </p>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="w6-eyebrow" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div
        className={mono ? "w6-mono" : ""}
        style={{
          marginTop: 2,
          fontSize: 13,
          color: "var(--w6-ink)",
          fontWeight: mono ? 500 : 400,
        }}
      >
        {value}
      </div>
    </div>
  );
}
