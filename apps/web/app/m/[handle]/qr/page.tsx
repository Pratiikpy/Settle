"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { W6AppShell } from "../../../../components/w6-app-shell";
import { toast } from "sonner";

/**
 * /m/[handle]/qr — Generate payment QR codes & shareable links.
 *
 * Merchant-side authoring page. Customers scan or click these to pay.
 * Two modes:
 *   - Fixed amount: pre-fill USDC amount + memo → unique QR/link
 *   - Open amount: customer types the amount themselves
 *
 * Uses the existing /embed/pay route as the destination, so the
 * customer-side experience reuses the embed widget.
 */
export default function MerchantQrPage() {
  const params = useParams<{ handle: string }>();
  const { connected, publicKey } = useWallet();

  const [merchantPubkey, setMerchantPubkey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Resolve handle → merchant pubkey.
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!params?.handle) return;
      // For "me", use the connected wallet's pubkey directly.
      if (params.handle === "me") {
        if (publicKey) setMerchantPubkey(publicKey.toBase58());
        return;
      }
      try {
        const r = await fetch(`/api/resolve?handle=${encodeURIComponent(params.handle)}`);
        if (!cancelled && r.ok) {
          const j = await r.json();
          setMerchantPubkey(j.pubkey ?? null);
        }
      } catch {
        // ignore — leave merchantPubkey null
      }
    }
    void resolve();
    return () => { cancelled = true; };
  }, [params?.handle, publicKey]);

  // Build the customer-facing pay URL.
  function buildPayUrl(includeAmount: boolean): string | null {
    if (!merchantPubkey) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const u = new URL(`${origin}/embed/pay`);
    u.searchParams.set("merchant", merchantPubkey);
    if (includeAmount && amount && parseFloat(amount) > 0) {
      u.searchParams.set("amount", amount);
    }
    if (memo) u.searchParams.set("note", memo);
    return u.toString();
  }

  async function generate(fixed: boolean) {
    const url = buildPayUrl(fixed);
    if (!url) {
      toast.error("Connect your wallet first.");
      return;
    }
    setQrUrl(url);

    // Render QR code into canvas. Lazy-import qrcode lib.
    try {
      const QRCode = (await import("qrcode")).default;
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, url, {
          width: 280,
          margin: 1,
          color: { dark: "#000000", light: "#ffffff" },
        });
      }
    } catch (e) {
      console.warn("QR render failed", e);
    }
  }

  function copy(text: string) {
    if (!navigator.clipboard) return toast.error("Clipboard unavailable.");
    void navigator.clipboard.writeText(text).then(() => toast.success("Copied."));
  }

  if (!connected) {
    return (
      <W6AppShell forceSurface="merchant">
        <div className="rounded-2xl border border-[#e4e4e7] p-8 text-center" style={{ maxWidth: 560 }}>
          <p className="text-sm text-[#52525b]">Connect a wallet to generate payment QR codes for your merchant page.</p>
        </div>
      </W6AppShell>
    );
  }

  return (
    <W6AppShell forceSurface="merchant">
      <div style={{ maxWidth: 720 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>Merchant · QR & links</div>
        <h1 className="w6-heading" style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.1 }}>
          Payment QR & links
        </h1>
        <p className="w6-muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5, marginBottom: 24 }}>
          Print a QR or share a link. Customers scan or click, pay USDC, you get a verifiable receipt.
        </p>

        {merchantPubkey ? (
          <p className="w6-muted" style={{ fontSize: 12, marginBottom: 24 }}>
            Receiving as: <code className="w6-mono">{merchantPubkey.slice(0, 8)}…{merchantPubkey.slice(-6)}</code>
          </p>
        ) : (
          <p className="w6-muted" style={{ fontSize: 12, marginBottom: 24 }}>
            Resolving handle…
          </p>
        )}

        <section className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5" style={{ marginBottom: 16 }}>
          <h2 className="text-sm font-medium">Fixed amount</h2>
          <p className="mt-1 text-xs text-[#52525b]">Pre-fill an amount. Best for invoices, single SKUs.</p>
          <div className="mt-3 grid gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount in USDC (e.g. 5.00)"
              inputMode="decimal"
              className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
            />
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Memo (optional, e.g. Invoice #1024)"
              maxLength={200}
              className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void generate(true)}
              disabled={!merchantPubkey || !amount || parseFloat(amount) <= 0}
              className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-background disabled:opacity-50"
            >
              Generate fixed-amount QR
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5" style={{ marginBottom: 16 }}>
          <h2 className="text-sm font-medium">Open amount</h2>
          <p className="mt-1 text-xs text-[#52525b]">Customer types the amount. Best for tipping, donations, variable items.</p>
          <button
            type="button"
            onClick={() => void generate(false)}
            disabled={!merchantPubkey}
            className="mt-3 rounded-full border border-[#a1a1aa] px-5 py-2 text-xs disabled:opacity-50"
          >
            Generate open-amount QR
          </button>
        </section>

        {qrUrl && (
          <section className="rounded-2xl border border-[#e4e4e7] bg-white p-5">
            <div className="flex flex-col items-center gap-4">
              <canvas ref={canvasRef} className="rounded-lg border border-[#e4e4e7]" />
              <code
                className="w6-mono break-all rounded-lg bg-[#fafafa] p-3 text-[11px] text-[#27272a]"
                style={{ width: "100%" }}
              >
                {qrUrl}
              </code>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copy(qrUrl)}
                  className="rounded-full border border-[#a1a1aa] px-4 py-1.5 text-xs hover:bg-[#f4f4f5]"
                >
                  Copy link
                </button>
                <Link
                  href={qrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[#a1a1aa] px-4 py-1.5 text-xs hover:bg-[#f4f4f5]"
                >
                  Open preview ↗
                </Link>
              </div>
              <p className="text-[11px] text-[#71717a]">
                Print the QR or share the link. Every payment commits an on-chain receipt back to you.
              </p>
            </div>
          </section>
        )}
      </div>
    </W6AppShell>
  );
}
