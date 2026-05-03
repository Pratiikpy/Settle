"use client";

import Script from "next/script";
import Link from "next/link";
import { useEffect, useState } from "react";
import { W6AppShell } from "../../../components/w6-app-shell";

/**
 * F5.4 docs page + live demo of <settle-pay>.
 *
 * The element opens a popup, runs the pay flow there, and posts the
 * signature back via postMessage. We listen for the success event and
 * render it inline so a curious dev can confirm the round-trip works.
 */

interface PaySuccessEvent {
  signature: string;
  request_id: string;
  amount_usdc: string;
  recipient: string;
}

const DEMO_MERCHANT =
  process.env.NEXT_PUBLIC_DEMO_PAY_MERCHANT ??
  "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY"; // facilitator pubkey on devnet

export default function PayComponentDocs() {
  const [lastResult, setLastResult] = useState<PaySuccessEvent | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    function onSuccess(e: Event) {
      const detail = (e as CustomEvent).detail as PaySuccessEvent;
      setLastResult(detail);
      setLastError(null);
    }
    function onError(e: Event) {
      const detail = (e as CustomEvent).detail as { message: string };
      setLastError(detail.message);
    }
    document.addEventListener("settle:success", onSuccess as EventListener);
    document.addEventListener("settle:error", onError as EventListener);
    return () => {
      document.removeEventListener("settle:success", onSuccess as EventListener);
      document.removeEventListener("settle:error", onError as EventListener);
    };
  }, []);

  return (
    <W6AppShell forceSurface="developer">
      <Script src="/pay.js" strategy="afterInteractive" />
      <div style={{ maxWidth: 880 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Embed component
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
        >
          &lt;settle-pay&gt;
        </h1>
        <p className="mt-2 text-sm text-[#52525b] max-w-xl">
          Embeddable pay button for any merchant. Two HTML tags and your
          page accepts USDC on Solana with a 4-hash on-chain receipt.
          Buyer signs in Phantom in a popup; your page receives the signed
          tx signature via postMessage.
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-medium tracking-tight">Install</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-[#27272a]">
            <code>{`<script src="https://settle.so/pay.js"></script>

<settle-pay
  merchant="<your-base58-pubkey>"
  amount="0.50"
  note="Optional invoice text"
></settle-pay>

<script>
  document.querySelector("settle-pay")
    .addEventListener("settle:success", (e) => {
      console.log("paid:", e.detail.signature);
    });
</script>`}</code>
          </pre>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-medium tracking-tight">Live demo</h2>
          <p className="mt-3 text-sm text-[#09090b]/65">
            Click below to pay $0.10 USDC to the demo merchant on devnet.
            Phantom will open a popup; Settle handles the rest. The
            signature comes back to this page via postMessage.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <settle-pay
              merchant={DEMO_MERCHANT}
              amount="0.10"
              note="settle-pay component demo"
              label="Pay $0.10 (devnet demo)"
            />
            <settle-pay
              merchant={DEMO_MERCHANT}
              amount="1.00"
              note="settle-pay component demo (bigger)"
              label="Pay $1.00 (devnet demo)"
            />
          </div>

          {lastResult && (
            <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.05] p-5 text-sm">
              <p className="font-medium text-emerald-300">
                ✓ Got payment-success event
              </p>
              <div className="mt-3 grid gap-1 text-xs font-mono text-[#09090b]/75">
                <div>
                  <span className="text-[#71717a]">signature:</span>{" "}
                  <span className="break-all">{lastResult.signature}</span>
                </div>
                <div>
                  <span className="text-[#71717a]">request_id:</span>{" "}
                  {lastResult.request_id || "(unknown)"}
                </div>
                <div>
                  <span className="text-[#71717a]">amount:</span>{" "}
                  {lastResult.amount_usdc} USDC
                </div>
              </div>
              <div className="mt-3 flex gap-3">
                <a
                  href={`https://solscan.io/tx/${lastResult.signature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center rounded-full border border-[#a1a1aa] px-4 text-xs hover:bg-[#f4f4f5]"
                >
                  Solscan ↗
                </a>
                {lastResult.request_id && (
                  <Link
                    href={`/receipts/${lastResult.request_id}`}
                    className="inline-flex h-9 items-center rounded-full border border-[#a1a1aa] px-4 text-xs hover:bg-[#f4f4f5]"
                  >
                    Receipt →
                  </Link>
                )}
              </div>
            </div>
          )}

          {lastError && (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-5 text-xs text-red-300">
              error: {lastError}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-medium tracking-tight">Attributes</h2>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e4e4e7] text-left text-xs uppercase tracking-wide text-[#52525b]">
                <th className="py-2">attr</th>
                <th>required</th>
                <th>description</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              <Row name="merchant" req={true} desc="Recipient base58 pubkey." />
              <Row name="amount" req={true} desc="USDC decimal (e.g. '0.50' = $0.50)." />
              <Row name="note" req={false} desc="Free-text note. Becomes a Memo + the kernel purpose_text." />
              <Row name="label" req={false} desc="Override the button text. Default: 'Pay $X with Settle'." />
              <Row
                name="endpoint"
                req={false}
                desc="Override the popup origin. Default: same origin as pay.js."
              />
            </tbody>
          </table>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-medium tracking-tight">Events</h2>
          <ul className="mt-4 space-y-3 text-sm text-[#09090b]/75">
            <li>
              <code className="font-mono text-[#27272a]">settle:success</code>{" "}
              — detail: <code>{`{ signature, request_id, amount_usdc, recipient }`}</code>
            </li>
            <li>
              <code className="font-mono text-[#27272a]">settle:error</code>{" "}
              — detail: <code>{`{ message }`}</code>
            </li>
            <li>
              <code className="font-mono text-[#27272a]">settle:cancel</code>{" "}
              — fired when the popup closes without a payment.
            </li>
          </ul>
          <p className="mt-3 text-xs text-[#52525b]">
            Listen on the element directly (recommended) or on{" "}
            <code>document</code> (events bubble through the shadow root).
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-medium tracking-tight">Why a popup, not a redirect</h2>
          <p className="mt-3 text-sm text-[#09090b]/65">
            Phantom&apos;s wallet adapter requires a real browser window
            with a same-origin React tree. A redirect-based flow would
            mean the host page loses its state every time someone
            paid. The popup keeps the host&apos;s page alive; the success
            postMessage delivers the result without a refresh.
          </p>
        </section>

        <div className="mt-12 flex gap-3">
          <Link
            href="/docs"
            className="inline-flex h-10 items-center rounded-full border border-[#a1a1aa] px-5 text-xs hover:bg-[#f4f4f5]"
          >
            ← Docs
          </Link>
          <Link
            href="/docs/verify-component"
            className="inline-flex h-10 items-center rounded-full border border-[#a1a1aa] px-5 text-xs hover:bg-[#f4f4f5]"
          >
            &lt;settle-verify&gt; →
          </Link>
        </div>
      </div>
    </W6AppShell>
  );
}

function Row({ name, req, desc }: { name: string; req: boolean; desc: string }) {
  return (
    <tr className="border-b border-[#f4f4f5]">
      <td className="py-2 font-mono text-[#27272a]">{name}</td>
      <td>{req ? "yes" : "—"}</td>
      <td className="text-[#52525b]">{desc}</td>
    </tr>
  );
}
