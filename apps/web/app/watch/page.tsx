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
