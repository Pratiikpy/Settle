import type { Metadata } from "next";
import Link from "next/link";
import { W6AppShell } from "../../components/w6-app-shell";

export const metadata: Metadata = {
  title: "Public goods — Settle",
  description:
    "What's open-source, what's MIT-licensed, and what we're committing back to the Solana ecosystem.",
};

export default function PublicGoodsPage() {
  return (
    <W6AppShell forceSurface="public">
      <div style={{ maxWidth: 760 }}>
        <div style={{ marginBottom: 32 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Public goods
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            What we&rsquo;re committing back.
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginTop: 8,
              maxWidth: 640,
              lineHeight: 1.5,
            }}
          >
            We took shortcuts on a lot of things. But not on what we owe
            back to the Solana ecosystem.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Block title="MIT-licensed @settle/sdk">
            The full TypeScript SDK ships under MIT. That includes the
            canonical hash builder, the verify-receipt path, the webhook
            HMAC, the sealed-box crypto helpers, the handle parser, the
            Anchor IDL re-export, and the PDA derivation helpers. 83 unit
            tests today.
          </Block>

          <Block title="Open Anchor program">
            The <code>settle-agent-card</code> program is open source. Two
            account types (<code>AgentCard</code>, <code>Pact</code>), 14
            instructions, and a tagged <code>PactMode</code> enum (
            <code>OneShot</code> / <code>Streaming</code> /{" "}
            <code>DeliveryEscrow</code>). Everything an auditor needs to
            recompute on-chain commits is in the Rust source plus the IDL.
            No proprietary policy engine on-chain.
          </Block>

          <Block title="Reusable Solana primitives">
            Settle composes the Solana primitives we actually use today:
            Anchor 0.31, SPL Token + ATA + Memo, Solana Pay, Address Lookup
            Tables + v0 versioned transactions, Bubblegum V1 cNFTs, Solana
            Attestation Service, Squads V4 detection, Lighthouse
            transaction assertions, Jupiter Lite API, Pyth Hermes pull
            oracle (live SOL/USD ticker), Bonfida SNS, Helius RPC + WebSocket
            onLogs, Helius Sender, Solana Actions / Blinks, VAPID Web Push
            (RFC 8291/8292), and a Codama-equivalent IDL drift detector in
            CI.
          </Block>

          <Block title="Hash-committed receipts as a primitive">
            The four-hash chain (receipt → reason → policy_snapshot →
            purpose) isn&rsquo;t proprietary to Settle — it&rsquo;s a
            generally useful pattern for AI agent audit trails on-chain.
            We documented it openly so anyone building x402-style payment
            gateways can adopt it.
          </Block>

          <Block title="What we’re keeping closed (for now)">
            The consumer app shell, branded UI, hosted infrastructure
            (Helius config, Vercel deployment, push notification service),
            and demo merchant accounts. The infra is reproducible; the
            brand isn&rsquo;t.
          </Block>
        </div>

        <p className="w6-muted" style={{ marginTop: 32, fontSize: 12 }}>
          Read the{" "}
          <Link href="/docs" style={{ color: "var(--w6-ink)" }}>
            docs
          </Link>
          , audit the source on GitHub, ask in the issues, fork the SDK.
        </p>
      </div>
    </W6AppShell>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="w6-card" style={{ padding: 22 }}>
      <h2
        className="w6-heading"
        style={{
          fontSize: 16,
          margin: 0,
          marginBottom: 8,
          color: "var(--w6-ink)",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--w6-ink-2)",
          margin: 0,
        }}
      >
        {children}
      </p>
    </section>
  );
}
