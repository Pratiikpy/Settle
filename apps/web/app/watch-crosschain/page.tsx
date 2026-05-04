import Link from "next/link";

export const dynamic = "force-static";
export const metadata = {
  title: "Watch a cross-chain agent · Settle x Ika",
  description:
    "Live demo: a Solana program approves (or denies) a signature request for an Ethereum Sepolia tx — then the Ika network produces the signature only when policy passes. ALLOW + DENY paths shown side by side.",
};

/**
 * /watch-crosschain — dedicated demo page (kept distinct from /watch).
 *
 * Mirrors /watch's marketing-page styling but tells the cross-chain story.
 * Two scripted scenarios shown side by side:
 *   - ALLOW: $5 ETH spend within cap → signature produced → tx broadcasts on Sepolia
 *   - DENY:  $200 ETH spend over cap → policy fails → no signature ever exists
 *
 * The "live demo" element here is intentionally lighter than /watch's terminal
 * because the cross-chain tx requires a pre-DKG'd dWallet + Sepolia RPC, which
 * we surface as an explicit "run-it-yourself" link to /start/agent-crosschain
 * rather than embedding live data.
 */

export default function WatchCrosschainPage() {
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
      data-testid="watch-crosschain"
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Link href="/" style={{ color: "#9aa0a6", fontSize: 13, textDecoration: "none" }}>
            ← settle.xyz
          </Link>
          <span data-testid="ika-badge" style={ikaBadge}>IKA</span>
        </div>

        <header style={{ marginTop: 24 }}>
          <h1
            data-testid="wcc-headline"
            style={{
              fontSize: "clamp(32px, 5vw, 56px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            Watch a cross-chain agent — under policy.
          </h1>
          <p
            style={{
              marginTop: 14,
              fontSize: 17,
              lineHeight: 1.5,
              color: "#9aa0a6",
              maxWidth: 760,
            }}
          >
            <strong style={{ color: "#fff" }}>Solana defines the policy. Ika enforces custody and signing across chains.
            Settle shows proof of what was allowed, blocked, signed, and executed.</strong>
            <br />
            One agent card. One Solana policy. Spends land on Ethereum Sepolia (and any chain Ika supports). Same hash chain, same audit trail.
          </p>
        </header>

        <div
          data-testid="pre-alpha-banner"
          style={{
            marginTop: 24,
            padding: "12px 14px",
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 10,
            fontSize: 13,
            color: "#f5b041",
          }}
        >
          Ika is in pre-alpha on Solana devnet. Signing uses a single mock signer, not real distributed MPC.
          Receipts produced today are still valid as ALLOW/DENY proofs of the policy gate.
        </div>

        <section
          data-testid="wcc-scenarios"
          style={{
            marginTop: 32,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
            gap: 18,
          }}
        >
          <Scenario
            testId="wcc-allow"
            kind="ALLOW"
            color="#14F195"
            amount="0.005 ETH"
            recipient="0xabc...01"
            steps={[
              "User triggers an agent payment under the daily cap.",
              "Solana program checks: cap, allowlist, capability pin, expiry, revoke.",
              "All checks pass — settle-dwallet-router CPIs `approve_message` on Ika.",
              "Ika network (mock NOA in pre-alpha) produces the secp256k1 signature.",
              "Client reconstructs the EIP-1559 tx and broadcasts on Sepolia.",
              "`record_signed_outcome` writes the Sepolia tx hash into the receipt PDA.",
              "Receipt at /r/<id> shows decision=ALLOW + Etherscan link.",
            ]}
          />
          <Scenario
            testId="wcc-deny"
            kind="DENY"
            color="#FF5C7A"
            amount="0.2 ETH"
            recipient="0xabc...01"
            steps={[
              "User triggers an agent payment over the daily cap.",
              "Solana program checks the policy gate.",
              "amount > daily_cap_minor — deny_code = OverCap.",
              "Receipt PDA sealed with decision=DENY, no CPI made.",
              "No MessageApproval PDA is allocated. Ika never sees the request.",
              "No signature exists. The tx cannot be broadcast.",
              "Receipt at /r/<id> shows decision=DENY + reason; no Etherscan link.",
            ]}
          />
        </section>

        <section
          data-testid="wcc-cta"
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
            Try it on devnet.
          </div>
          <div style={{ color: "#9aa0a6", fontSize: 15, lineHeight: 1.5, maxWidth: 640 }}>
            Bring a pre-DKG'd Ika dWallet (created via Ika's reference tooling), set a policy in the form, hire the agent, and watch it spend. ALLOW and DENY both produce sealed receipts on Solana.
          </div>
          <Link
            href="/start/agent-crosschain"
            data-testid="wcc-cta-link"
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              background: "#fff",
              color: "#0a0a0c",
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            Hire a cross-chain agent →
          </Link>
        </section>

        <footer
          data-testid="wcc-trust-footer"
          style={{
            marginTop: 36,
            paddingTop: 18,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            fontSize: 12,
            color: "#9aa0a6",
            lineHeight: 1.6,
          }}
        >
          Settle does not custody your cross-chain assets. Your funds stay on their native chain. Your dWallet's
          private key is split between you and the Ika network using 2PC-MPC. Settle's program approves the signing
          request only when policy passes; Ika produces the signature; you broadcast it on the target chain. If the
          policy fails, no signature is ever produced and a deny receipt is sealed on Solana.
        </footer>
      </div>
    </main>
  );
}

const ikaBadge: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  padding: "4px 8px",
  borderRadius: 6,
  background: "rgba(99,102,241,0.18)",
  color: "rgb(168,170,255)",
  border: "1px solid rgba(99,102,241,0.4)",
};

function Scenario({
  testId,
  kind,
  color,
  amount,
  recipient,
  steps,
}: {
  testId: string;
  kind: "ALLOW" | "DENY";
  color: string;
  amount: string;
  recipient: string;
  steps: string[];
}) {
  return (
    <div
      data-testid={testId}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            background: kind === "ALLOW" ? "rgba(20,241,149,0.12)" : "rgba(255,92,122,0.12)",
            color,
            border: `1px solid ${color}40`,
          }}
        >
          {kind}
        </span>
        <span style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{amount}</span>
        <span style={{ fontSize: 12, color: "#9aa0a6", fontFamily: "ui-monospace, monospace" }}>→ {recipient}</span>
      </div>

      <ol style={{ marginTop: 18, paddingLeft: 18, lineHeight: 1.55, color: "#cfd2d6" }}>
        {steps.map((s, i) => (
          <li key={i} style={{ marginBottom: 6, fontSize: 13.5 }}>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
