"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { W6AppShell } from "../../../../components/w6-app-shell";

interface Pricelist {
  ok: true;
  label: string;
  description: string | null;
  amount_usdc: number;
  paused: boolean;
}

/**
 * F9 QR display page. Encodes a Solana Pay transaction-request URL pointing at our
 * /api/sp/<merchant>/<slug> endpoint. Same QR forever; price resolves at scan time.
 */
export default function QrPage() {
  const params = useParams<{ merchant: string; slug: string }>();
  const [data, setData] = useState<Pricelist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Build the Solana Pay URL: `solana:<URL>`. We point at our /api/sp endpoint directly
  // so wallets follow the transaction-request spec (GET preview, POST tx).
  const origin = typeof window !== "undefined" ? window.location.origin : "https://settle.so";
  const sp = `solana:${origin}/api/sp/${params.merchant}/${params.slug}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // We don't have a public read endpoint; reuse the SP GET to surface label + amount.
        const res = await fetch(`/api/sp/${params.merchant}/${params.slug}`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          if (!cancelled) setError((j as { error?: string }).error ?? "fetch_failed");
          return;
        }
        const j = await res.json();
        if (cancelled) return;
        setData({
          ok: true,
          label: (j.title ?? j.label) as string,
          description: (j.description as string | null) ?? null,
          // Amount isn't surfaced through GET (it's only resolved on POST), so we read
          // a server-rendered hint via a separate cheap route — fall back to "—" otherwise.
          amount_usdc: 0,
          paused: false,
        });
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.merchant, params.slug]);

  // Render the QR
  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, sp, {
      width: 320,
      margin: 2,
      color: { dark: "#0A0A0A", light: "#FFFFFF" },
    });
  }, [sp]);

  function downloadPng() {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `settle-qr-${params.slug}.png`;
    a.click();
  }

  function copyLink() {
    void navigator.clipboard.writeText(sp);
  }

  return (
    <W6AppShell forceSurface="merchant">
      <div style={{ maxWidth: 880 }}>
        <Link href={`/at/${params.merchant}`} className="text-xs text-foreground/45 hover:text-accent">
          ← Profile
        </Link>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          {data?.label ?? "Loading…"}
        </h1>
        {data?.description && (
          <p className="mt-2 text-sm text-foreground/60">{data.description}</p>
        )}

        <div className="mt-8 rounded-3xl border border-foreground/10 bg-white p-6">
          <canvas ref={canvasRef} className="mx-auto block" />
        </div>

        <p className="mt-4 text-center text-[11px] text-foreground/45">
          Scan with any Solana Pay wallet · price resolves at scan time
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={downloadPng}
            className="flex-1 rounded-full border border-foreground/20 py-2 text-xs hover:bg-foreground/5"
          >
            Download PNG
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="flex-1 rounded-full border border-foreground/20 py-2 text-xs hover:bg-foreground/5"
          >
            Copy link
          </button>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error === "not_found_or_paused"
              ? "This QR doesn't exist yet or has been paused."
              : `Error: ${error}`}
          </div>
        )}

        <p className="mt-10 text-[11px] leading-relaxed text-foreground/45">
          The QR encodes a Solana Pay transaction-request URL pointing at Settle&apos;s
          server. The amount lives in the merchant&apos;s pricelist row, not in the QR
          itself — change the price, the same QR updates everywhere.
        </p>
      </div>
    </W6AppShell>
  );
}
