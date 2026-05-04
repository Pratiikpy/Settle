"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { W6AppShell } from "../../components/w6-app-shell";

export default function ReceivePage() {
  const { connected, publicKey } = useWallet();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  const address = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!address || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, address, {
      width: 220,
      margin: 2,
      color: { dark: "#09090b", light: "#fdfdfb" },
    });
  }, [address]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  return (
    <W6AppShell>
      <div style={{ maxWidth: 480 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Wallet · Receive
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.1 }}
        >
          Receive USDC
        </h1>
        <p
          className="w6-muted"
          style={{ fontSize: 14, marginTop: 8, marginBottom: 28, lineHeight: 1.5 }}
        >
          Share your address or QR code. Anyone on Solana can send you USDC.
        </p>

        {!connected ? (
          <div className="w6-card" style={{ padding: 32, textAlign: "center" }}>
            <p className="w6-muted" style={{ fontSize: 14 }}>
              Connect a wallet to see your receive address.
            </p>
          </div>
        ) : (
          <div className="w6-card" style={{ padding: 28 }}>
            {/* QR code */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
              <div
                style={{
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid var(--w6-rule)",
                  padding: 12,
                  background: "#fdfdfb",
                  display: "inline-block",
                }}
              >
                <canvas ref={canvasRef} />
              </div>
            </div>

            {/* Address display */}
            <div
              style={{
                background: "var(--w6-bg-3)",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 16,
                wordBreak: "break-all",
              }}
            >
              <div className="w6-micro" style={{ marginBottom: 4 }}>
                Wallet address
              </div>
              <span className="w6-mono" style={{ fontSize: 13 }}>
                {address}
              </span>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="w6-btn w6-btn-primary"
                style={{ flex: 1 }}
              >
                {copied ? "Copied ✓" : "Copy address"}
              </button>
              <Link
                href="/request"
                className="w6-btn w6-btn-secondary"
                style={{ flex: 1, textAlign: "center" }}
              >
                Request specific amount →
              </Link>
            </div>
          </div>
        )}

        <p className="w6-muted" style={{ fontSize: 11, marginTop: 20, lineHeight: 1.6 }}>
          Settle uses USDC on Solana. Only send USDC to this address. Sending
          other tokens may result in permanent loss.
        </p>
      </div>
    </W6AppShell>
  );
}
