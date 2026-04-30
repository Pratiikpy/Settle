import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "../../components/footer";

export const metadata: Metadata = {
  title: "Public goods — Settle",
  description:
    "What&apos;s open-source, what's MIT-licensed, and what we&apos;re committing back to the Solana ecosystem.",
};

export default function PublicGoodsPage() {
  return (
    <>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Public goods</h1>
        <p className="mt-2 text-sm text-foreground/60">
          We took shortcuts on a lot of things. But not on what we owe back.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/75">
          <Block title="MIT-licensed @settle/sdk">
            The full TypeScript SDK ships under MIT. That includes the canonical hash builder,
            the verify-receipt path, the webhook HMAC, the sealed-box crypto helpers, the handle
            parser, the Anchor IDL re-export, and the PDA derivation helpers. 83 unit tests today.
          </Block>

          <Block title="Open Anchor program">
            The <code>settle-agent-card</code> program is open source. Two account types
            (<code>AgentCard</code>, <code>Pact</code>), 14 instructions, and a tagged{" "}
            <code>PactMode</code> enum (<code>OneShot</code> / <code>Streaming</code> /{" "}
            <code>DeliveryEscrow</code>). Everything an auditor needs to recompute on-chain
            commits is in the Rust source plus the IDL. No proprietary policy engine on-chain.
          </Block>

          <Block title="Reusable Solana primitives">
            Settle composes the Solana primitives we actually use today: Anchor 0.31, SPL
            Token + ATA + Memo, Solana Pay (transfer-request + transaction-request + reference
            pubkeys), Address Lookup Tables + v0 versioned transactions, Bubblegum V1 cNFTs,
            Solana Attestation Service (verified merchants), Squads V4 detection, Lighthouse
            transaction assertions, Jupiter Lite API, Bonfida SNS, Helius RPC + WebSocket{" "}
            onLogs subscription, Helius Sender (Jito-bundle wrapper for confirmed-on-first-try
            sends), Solana Actions / Blinks, VAPID Web Push (RFC 8291/8292). What we leave on
            the table for v0.4 — Bubblegum V2, Token-2022 transfer hooks, Solana Mobile MWA,
            Pyth pull oracle, Codama-generated client — is documented honestly in{" "}
            <code>docs/PRODUCT_SPEC.md §7</code>.
          </Block>

          <Block title="Hash-committed receipts as a primitive">
            The four-hash chain (receipt → reason → policy_snapshot → purpose) isn&apos;t proprietary
            to Settle — it&apos;s a generally useful pattern for AI agent audit trails on-chain. We
            documented it openly so anyone building x402-style payment gateways can adopt it.
          </Block>

          <Block title="What we&apos;re keeping closed (for now)">
            The consumer app shell, branded UI, hosted infrastructure (Helius config, Vercel
            deployment, push notification service), and demo merchant accounts. The infra is
            reproducible; the brand isn&apos;t.
          </Block>
        </div>

        <p className="mt-10 text-xs text-foreground/40">
          Read the <Link href="/docs" className="text-accent">docs</Link>, audit the source on
          GitHub, ask in the issues, fork the SDK.
        </p>
      </main>
      <Footer />
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <p className="mt-2">{children}</p>
    </section>
  );
}
