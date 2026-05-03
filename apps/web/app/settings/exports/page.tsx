"use client";

/**
 * F2.12 — `/settings/exports` — compliance receipt export UI.
 *
 * Wave 1 / Stream B3.
 */
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { W6AppShell } from "../../../components/w6-app-shell";

const CURRENT_YEAR = new Date().getUTCFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

export default function ExportsPage() {
  const { publicKey, connected } = useWallet();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [jurisdiction, setJurisdiction] = useState<"us" | "eu" | "in" | "generic">(
    "generic",
  );
  const [format, setFormat] = useState<"csv" | "pdf" | "json">("csv");

  function buildUrl(): string | null {
    if (!publicKey) return null;
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${year}-12-31T23:59:59Z`;
    const params = new URLSearchParams({
      pubkey: publicKey.toBase58(),
      from,
      to,
      jurisdiction,
      format,
    });
    return `/api/exports/receipts?${params.toString()}`;
  }

  return (
    <W6AppShell forceSurface="consumer">
      <div style={{ maxWidth: 720 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Settings · exports
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
        >
          Receipt export
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
          Download every receipt for a calendar year, with on-chain
          hash-chain proofs included so anyone can independently verify
          the export.
        </p>

      {!connected && (
        <p className="mt-6 rounded border border-amber-400/30 bg-amber-400/[0.05] p-4 text-sm text-amber-200">
          Connect your wallet to export receipts owned by your pubkey.
        </p>
      )}

      <div className="mt-6 space-y-5">
        <div>
          <label className="block text-xs font-medium text-[#27272a]">
            Year
          </label>
          <select
            value={year}
            onChange={(e) => setYear(Number.parseInt(e.target.value, 10))}
            className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#27272a]">
            Jurisdiction template
          </label>
          <select
            value={jurisdiction}
            onChange={(e) =>
              setJurisdiction(e.target.value as typeof jurisdiction)
            }
            className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
          >
            <option value="generic">Generic</option>
            <option value="us">US — Schedule C</option>
            <option value="eu">EU — VAT</option>
            <option value="in">India — GST</option>
          </select>
          <p className="mt-1 text-[11px] text-[#52525b]">
            Affects PDF formatting only. CSV + JSON contain all fields regardless.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#27272a]">
            Format
          </label>
          <div className="mt-2 flex gap-2">
            {(["csv", "pdf", "json"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  format === f
                    ? "border-accent bg-accent/[0.1] text-accent"
                    : "border-[#e4e4e7] text-[#52525b]"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          {format === "pdf" && (
            <p className="mt-1 text-[11px] text-[#52525b]">
              Opens a print-styled HTML page; use your browser&apos;s
              &ldquo;Print to PDF&rdquo; for the file.
            </p>
          )}
        </div>

        <a
          href={buildUrl() ?? "#"}
          aria-disabled={!connected}
          target={format === "pdf" ? "_blank" : undefined}
          rel="noopener noreferrer"
          className={`mt-2 inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-medium text-background ${
            !connected ? "pointer-events-none opacity-50" : ""
          }`}
        >
          Download {format.toUpperCase()} export →
        </a>
      </div>

      <p className="mt-8 text-[11px] text-[#71717a]">
          Each receipt commits 4 BLAKE3 hashes on-chain. The export includes those
          hashes alongside the row data so the export itself is verifiable —
          anyone can recompute the chain and confirm integrity via Settle&apos;s
          public /verify endpoint.
        </p>
      </div>
    </W6AppShell>
  );
}
