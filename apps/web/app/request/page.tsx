"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Keypair, PublicKey } from "@solana/web3.js";
import { W6AppShell } from "../../components/w6-app-shell";

/**
 * /request — User journey #7: Be a merchant.
 * Generates Solana Pay URL (transfer-request) + QR + Blink.
 * Customer scans QR → pays USDC → Solana Pay reference indexed → loyalty receipt.
 */

const USDC_MINT = {
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

function getUsdcMint(): string {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  return cluster === "mainnet" ? USDC_MINT.mainnet : USDC_MINT.devnet;
}

export default function RequestPage() {
  const { connected, publicKey } = useWallet();
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [generated, setGenerated] = useState<{
    url: string;
    reference: string;
    blink: string;
  } | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  function handleGenerate() {
    if (!amount || !publicKey) {
      toast.error("Connect a wallet — enter amount.");
      return;
    }
    const decimal = parseFloat(amount);
    if (!Number.isFinite(decimal) || decimal <= 0) {
      toast.error("Invalid amount.");
      return;
    }

    // Build canonical Solana Pay transfer URL
    // Spec: solana:<recipient>?spl-token=<mint>&amount=<decimal>&reference=<pubkey>&memo=<utf8>
    const reference = Keypair.generate().publicKey;
    const usdcMint = new PublicKey(getUsdcMint());

    const params = new URLSearchParams();
    params.set("spl-token", usdcMint.toBase58());
    params.set("amount", decimal.toString());
    params.set("reference", reference.toBase58());
    if (memo.trim()) params.set("memo", memo.trim().slice(0, 200));
    params.set("label", "Settle");
    params.set("message", `Pay $${decimal} USDC`);

    const url = `solana:${publicKey.toBase58()}?${params.toString()}`;
    const blink = `${window.location.origin}/request/${reference.toBase58()}`;

    setGenerated({ url, reference: reference.toBase58(), blink });
  }

  useEffect(() => {
    if (!generated || !qrCanvasRef.current) return;
    void QRCode.toCanvas(qrCanvasRef.current, generated.url, {
      width: 256,
      margin: 2,
      color: {
        dark: "#14F195",
        light: "#0A0A0A",
      },
      errorCorrectionLevel: "M",
    });
  }, [generated]);

  function copyUrl() {
    if (!generated) return;
    void navigator.clipboard.writeText(generated.url);
    toast.success("Solana Pay URL copied.");
  }
  function copyBlink() {
    if (!generated) return;
    void navigator.clipboard.writeText(generated.blink);
    toast.success("Shareable Blink URL copied.");
  }

  return (
    <W6AppShell forceSurface="merchant">
      <div style={{ maxWidth: 520 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Merchant · request
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
        >
          Request payment.
        </h1>
        <p
          className="w6-muted"
          style={{
            fontSize: 14,
            marginTop: 8,
            lineHeight: 1.5,
            marginBottom: 24,
          }}
        >
          Generate a Solana Pay QR or Blink. Customer scans, pays USDC.
          The receipt is indexed automatically.
        </p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleGenerate();
        }}
      >
        <div>
          <label className="block text-xs font-medium text-[#52525b]">Amount (USDC)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="5.00"
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#52525b]">Memo (optional)</label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Invoice #1024"
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
          />
        </div>
        <button
          type="submit"
          disabled={!connected}
          className="w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
        >
          {!connected ? "Connect a wallet to generate" : "Generate"}
        </button>
      </form>

      {generated && (
        <div className="mt-8 space-y-6 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6">
          <div>
            <div className="mb-3 text-xs text-[#52525b]">Solana Pay QR</div>
            <div className="flex justify-center rounded-xl bg-black p-4">
              <canvas ref={qrCanvasRef} />
            </div>
            <p className="mt-3 text-center text-xs text-[#71717a]">
              Scan with Phantom or any Solana Pay wallet
            </p>
          </div>

          <div>
            <div className="text-xs text-[#52525b]">Reference pubkey</div>
            <code className="mt-1 block break-all rounded bg-[#f4f4f5] p-2 font-mono text-[10px]">
              {generated.reference}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={copyUrl}
              className="rounded-lg border border-[#a1a1aa] py-2 text-xs hover:bg-[#f4f4f5]"
            >
              Copy URL
            </button>
            <button
              onClick={copyBlink}
              className="rounded-lg border border-[#a1a1aa] py-2 text-xs hover:bg-[#f4f4f5]"
            >
              Copy Blink
            </button>
          </div>
        </div>
      )}

        <p className="w6-muted" style={{ marginTop: 24, fontSize: 12 }}>
          Solana Pay reference pubkey embedded for tracking — locate the
          eventual tx via{" "}
          <code> getSignaturesForAddress(reference)</code>.
        </p>
      </div>
    </W6AppShell>
  );
}
