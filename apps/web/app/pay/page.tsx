"use client";

import Link from "next/link";
import Script from "next/script";
import { createElement, useState } from "react";
import { toast } from "sonner";
import { W6AppShell } from "../../components/w6-app-shell";

/**
 * /pay — Settle Pay developer landing.
 *
 * The external surface for "drop this into your site to accept Settle
 * payments." Three things this page does:
 *
 *   1. Shows a working <settle-pay> button live (visitors can click +
 *      try the flow against the merchant we hardcode here).
 *   2. Provides a copy-paste snippet that points to the same pay.js
 *      hosted at this origin — anyone using it gets a verified path.
 *   3. Links to the verify side: <settle-verify> for proving an
 *      already-fired receipt, useful for buyer-confirmation pages.
 *
 * Deliberately a single page (not a docs subtree) — the entire surface
 * fits in one screen for a developer's first visit. Deeper docs live
 * at /docs.
 */

const DEMO_MERCHANT = "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY";

export default function PayLandingPage() {
  const [hostname, setHostname] = useState("https://settle.app");
  // Snippet uses the production hostname by default; user can paste
  // their own deployment URL.

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  }

  const payHtml = `<script src="${hostname}/pay.js"></script>
<settle-pay
  merchant="${DEMO_MERCHANT}"
  amount="0.50"
  note="Coffee">
</settle-pay>`;

  const verifyHtml = `<script src="${hostname}/verify.js"></script>
<settle-verify
  request-id="REQUEST_ID_FROM_RECEIPT">
</settle-verify>`;

  const reactExample = `// In any React component
useEffect(() => {
  const el = document.querySelector("settle-pay");
  el?.addEventListener("settle:success", (e) => {
    console.log("paid:", e.detail);
    // e.detail = { signature, request_id, amount_usdc, recipient }
  });
}, []);`;

  return (
    <W6AppShell forceSurface="developer">
      <Script src="/pay.js" strategy="afterInteractive" />
      <Script src="/verify.js" strategy="afterInteractive" />
      <div style={{ maxWidth: 880 }}>
        <header style={{ marginBottom: 32 }}>
          <p className="w6-eyebrow" style={{ fontSize: 12 }}>
            Settle Pay
          </p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight">
            Accept Settle payments in 2 lines.
          </h1>
          <p className="mt-3 text-sm text-foreground/60">
            One{" "}
            <code className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs">
              &lt;script&gt;
            </code>
            , one{" "}
            <code className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs">
              &lt;settle-pay&gt;
            </code>{" "}
            tag, no framework. Every payment leaves a verifiable on-chain
            receipt your customer can prove forever.
          </p>
        </header>

        {/* Live demo */}
        <section className="mb-10 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.03] p-6">
          <p className="text-[11px] uppercase tracking-wide text-emerald-400/70">
            Live demo
          </p>
          <p className="mt-2 text-xs text-foreground/60">
            Click below — opens a popup to pay $0.50 USDC to a demo merchant
            on devnet. Your wallet stays the same; we never see your keys.
          </p>
          <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
            {/* Custom element rendered via createElement so JSX does not need
                to know the custom element's intrinsic type. */}
            {(() => {
              const props: Record<string, string> = {
                merchant: DEMO_MERCHANT,
                amount: "0.50",
                note: "settle.app demo",
              };
              return createElement("settle-pay", props);
            })()}
          </div>
        </section>

        {/* Snippet */}
        <section className="mb-10">
          <h2 className="text-lg font-medium">Drop into any HTML</h2>
          <p className="mt-2 text-xs text-foreground/60">
            No build step. No framework. The custom element handles the
            popup, wallet connect, receipt creation, confirmation.
          </p>
          <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[10px] uppercase tracking-wide text-foreground/40">
                Source
              </p>
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className="rounded border border-foreground/10 bg-transparent px-2 py-0.5 text-[11px] text-foreground/70"
              />
            </div>
            <pre className="overflow-auto rounded-lg bg-foreground/[0.04] p-3 text-xs">
              <code>{payHtml}</code>
            </pre>
            <button
              onClick={() => copy(payHtml)}
              className="mt-3 rounded-full border border-foreground/20 px-3 py-1 text-[11px] hover:bg-foreground/5"
            >
              Copy
            </button>
          </div>
        </section>

        {/* Events */}
        <section className="mb-10">
          <h2 className="text-lg font-medium">Hook into events</h2>
          <p className="mt-2 text-xs text-foreground/60">
            Listen on the element to get the receipt details after a
            successful payment. No backend webhook required for client-side
            confirmations.
          </p>
          <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
            <pre className="overflow-auto rounded-lg bg-foreground/[0.04] p-3 text-xs">
              <code>{reactExample}</code>
            </pre>
            <button
              onClick={() => copy(reactExample)}
              className="mt-3 rounded-full border border-foreground/20 px-3 py-1 text-[11px] hover:bg-foreground/5"
            >
              Copy
            </button>
          </div>
          <ul className="mt-3 space-y-1 text-[11px] text-foreground/60">
            <li>
              <code>settle:success</code> — payment confirmed on chain
            </li>
            <li>
              <code>settle:error</code> — popup blocked, wallet rejected, etc
            </li>
            <li>
              <code>settle:cancel</code> — user closed the popup
            </li>
          </ul>
        </section>

        {/* Verify */}
        <section className="mb-10">
          <h2 className="text-lg font-medium">Verify any receipt</h2>
          <p className="mt-2 text-xs text-foreground/60">
            Use <code>&lt;settle-verify&gt;</code> on a confirmation page to
            prove a receipt is real. Re-derives the 4-hash kernel commit
            client-side and shows ✓ if it matches the on-chain anchor.
          </p>
          <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
            <pre className="overflow-auto rounded-lg bg-foreground/[0.04] p-3 text-xs">
              <code>{verifyHtml}</code>
            </pre>
            <button
              onClick={() => copy(verifyHtml)}
              className="mt-3 rounded-full border border-foreground/20 px-3 py-1 text-[11px] hover:bg-foreground/5"
            >
              Copy
            </button>
          </div>
        </section>

        {/* Webhook for server-side */}
        <section className="mb-10 rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
          <h2 className="text-sm font-medium">Want server-side confirmation?</h2>
          <p className="mt-2 text-xs text-foreground/60">
            Register a webhook URL with Settle and we POST a
            Stripe-shaped envelope when a receipt addressed to your
            merchant pubkey lands. Signed with HMAC-SHA256 so you can
            verify it came from us.
          </p>
          <Link
            href="/docs#webhooks"
            className="mt-3 inline-block rounded-full border border-foreground/20 px-4 py-1.5 text-xs hover:bg-foreground/5"
          >
            Webhook docs →
          </Link>
        </section>

        {/* Footer links */}
        <nav className="flex flex-wrap gap-2 text-[11px]">
          <Link
            href="/docs"
            className="rounded-full border border-foreground/15 px-3 py-1.5 text-foreground/60 hover:bg-foreground/5"
          >
            API docs
          </Link>
          <Link
            href="/stats"
            className="rounded-full border border-foreground/15 px-3 py-1.5 text-foreground/60 hover:bg-foreground/5"
          >
            Network stats
          </Link>
          <Link
            href="https://github.com/settle-protocol"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-foreground/15 px-3 py-1.5 text-foreground/60 hover:bg-foreground/5"
          >
            GitHub ↗
          </Link>
        </nav>
      </div>
    </W6AppShell>
  );
}
