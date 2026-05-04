import { WatchAgentDemo } from "../../components/watch-agent-demo";

export const dynamic = "force-static";
export const metadata = {
  title: "Settle · Watch an AI agent spend safely",
  description:
    "Live demo: a real agent on Solana devnet attempts payments — Settle's rules allow safe spends and block over-limit ones. Every receipt links to Solscan.",
};

export default function WatchPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0c",
        color: "#e6e6e8",
        fontFamily:
          "ui-sans-serif, -apple-system, system-ui, Segoe UI, Roboto, sans-serif",
        padding: "32px 16px 64px",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <a
          href="/"
          style={{ color: "#9aa0a6", fontSize: 13, textDecoration: "none" }}
        >
          ← settle.xyz
        </a>
        <header style={{ marginTop: 24 }}>
          <h1
            data-testid="watch-headline"
            style={{
              fontSize: "clamp(32px, 5vw, 56px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            Watch an AI agent spend — safely.
          </h1>
          <p
            style={{
              marginTop: 14,
              fontSize: 17,
              lineHeight: 1.5,
              color: "#9aa0a6",
              maxWidth: 700,
            }}
          >
            A real agent runs on Solana devnet. It tries to spend against a
            programmable rule. Settle allows safe spends, blocks over-limit
            ones, and writes a cryptographic receipt for every decision.
          </p>
        </header>

        <WatchAgentDemo />

        <section
          style={{
            marginTop: 56,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <Pillar
            title="Rule"
            body="Set max-per-tx, daily cap, allowed merchants, schedule. Enforced on-chain."
          />
          <Pillar
            title="Receipt"
            body="Each decision writes a 4-hash chain. Verifiable on-page or via Solscan."
          />
          <Pillar
            title="Revoke"
            body="One transaction kills the agent's budget. Future spend dies instantly."
          />
        </section>

        <section
          data-testid="watch-cta"
          style={{
            marginTop: 56,
            padding: "28px 24px",
            background:
              "linear-gradient(135deg, rgba(153,69,255,0.12) 0%, rgba(20,241,149,0.08) 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
            Try it yourself.
          </div>
          <div style={{ color: "#9aa0a6", fontSize: 15, lineHeight: 1.5, maxWidth: 560 }}>
            Hire your own agent in under a minute. Set a budget, scope what it
            can spend on, and watch it run. You can revoke its keys any time.
          </div>
          <a
            data-testid="watch-cta-link"
            href="/start/agent"
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              background: "#fff",
              color: "#0a0a0c",
              fontWeight: 600,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            Hire an agent →
          </a>
        </section>
      </div>
    </main>
  );
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{title}</div>
      <div style={{ marginTop: 6, color: "#9aa0a6", fontSize: 14, lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  );
}
