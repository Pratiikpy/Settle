import Link from "next/link";

export const dynamic = "force-static";
export const metadata = {
  title: "Get started · Settle",
  description:
    "Choose how you'll use Settle: send money safely, accept payments, or build with AI agents.",
};

export default function StartPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--w6-bg-2, #fafaf7)",
        color: "var(--w6-ink, #0a0a0c)",
        fontFamily:
          "ui-sans-serif, -apple-system, system-ui, Segoe UI, Roboto, sans-serif",
        padding: "32px 16px 64px",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <Link href="/" style={{ fontSize: 13, color: "inherit", textDecoration: "none" }}>
          ← settle.xyz
        </Link>
        <header style={{ marginTop: 24, textAlign: "center" }}>
          <h1
            data-testid="start-headline"
            style={{
              fontSize: "clamp(36px, 5vw, 56px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            Pick how you'll use Settle.
          </h1>
          <p
            style={{
              marginTop: 14,
              fontSize: 17,
              lineHeight: 1.5,
              color: "var(--w6-ink-3, #5a5f66)",
              maxWidth: 600,
              margin: "14px auto 0",
            }}
          >
            Three paths. Each ends with a real cryptographic receipt on Solana.
          </p>
        </header>

        <section
          style={{
            marginTop: 48,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          <ForkCard
            testId="fork-consumer"
            badge="I send"
            title="Send money safely"
            body="Pay people, set spending rules, see every transfer with a receipt you can verify forever."
            cta="Start sending"
            href="/start/consumer"
          />
          <ForkCard
            testId="fork-merchant"
            badge="I sell"
            title="Accept payments"
            body="Get a merchant page, payment QR, and webhook in 60 seconds. Every customer gets a verifiable receipt."
            cta="Start selling"
            href="/start/merchant"
          />
          <ForkCard
            testId="fork-agent"
            badge="I build"
            title="Build with AI agents"
            body="Give an agent its own budget. Set rules. Watch it spend with full audit logs and instant revoke."
            cta="Start building"
            href="/start/agent"
          />
        </section>
      </div>
    </main>
  );
}

function ForkCard({
  testId,
  badge,
  title,
  body,
  cta,
  href,
}: {
  testId: string;
  badge: string;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      style={{
        display: "block",
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 16,
        padding: 24,
        color: "inherit",
        textDecoration: "none",
        boxShadow: "0 1px 0 rgba(0,0,0,0.02), 0 12px 32px rgba(0,0,0,0.05)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      <span
        style={{
          display: "inline-block",
          padding: "4px 10px",
          borderRadius: 999,
          background: "#0a0a0c",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {badge.toUpperCase()}
      </span>
      <h2
        style={{
          marginTop: 16,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          lineHeight: 1.15,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          marginTop: 8,
          fontSize: 14.5,
          lineHeight: 1.55,
          color: "var(--w6-ink-3, #5a5f66)",
        }}
      >
        {body}
      </p>
      <span
        style={{
          marginTop: 18,
          display: "inline-flex",
          fontSize: 14,
          fontWeight: 600,
          color: "#0a0a0c",
        }}
      >
        {cta} →
      </span>
    </Link>
  );
}
