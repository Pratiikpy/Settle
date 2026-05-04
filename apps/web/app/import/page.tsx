"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { W6AppShell } from "../../components/w6-app-shell";

/**
 * F5.11 — Receipt importer page.
 *
 * "Bring any Solana Pay tx into the verification layer."
 *
 * User pastes a tx signature; the API endpoint fetches the tx,
 * extracts the USDC transfer + memos, computes a kernel commit, and
 * mirrors it as a receipt. The user is then linked to the public
 * proof page and the receipt detail page.
 */

interface ImportResponse {
  ok?: boolean;
  idempotent?: boolean;
  request_id?: string;
  receipt_hash?: string;
  context_hash?: string;
  sender?: string;
  recipient?: string;
  amount_lamports?: string;
  memos?: string[];
  imported_at?: string;
  error?: string;
  message?: string;
}

export default function ImportPage() {
  const { connected, publicKey } = useWallet();
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function handleImport() {
    if (!connected || !publicKey) {
      toast.error("Connect a wallet first.");
      return;
    }
    const sig = signature.trim();
    if (!sig) {
      toast.error("Paste a tx signature.");
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/import/solana-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: sig,
          caller_pubkey: publicKey.toBase58(),
        }),
      });
      const json = (await res.json()) as ImportResponse;
      setResult(json);
      if (json.ok) {
        if (json.idempotent) {
          toast.info("Already imported. Showing existing receipt.");
        } else {
          toast.success("Receipt imported. The kernel commit is live.");
        }
      } else {
        toast.error(json.message ?? json.error ?? "Import failed.");
      }
    } catch (e) {
      toast.error(`Network error: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <W6AppShell>
      <div style={{ maxWidth: 720 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Tools · Import
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.1 }}
        >
          Import a receipt
        </h1>
        <p
          className="w6-muted"
          style={{
            fontSize: 14,
            marginTop: 8,
            maxWidth: 640,
            lineHeight: 1.5,
            marginBottom: 24,
          }}
        >
          Paste any Solana Pay (or any USDC transfer) signature. Settle
          computes the 4-hash kernel commit and mirrors it into the
          verification layer — no signing, no wallet pop-up. The original
          tx is unchanged on-chain.
        </p>

        {!connected ? (
          <div
            className="w6-card"
            style={{ padding: 32, textAlign: "center" }}
          >
            <p className="w6-muted" style={{ fontSize: 14 }}>
              Connect a wallet to import a receipt.
            </p>
          </div>
        ) : (
          <section className="w6-card" style={{ padding: 24 }}>
            <label className="text-[11px] uppercase tracking-wide text-[#52525b]">
              Tx signature
            </label>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="2buhegX2LH…"
              maxLength={128}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="mt-2 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-4 py-2.5 font-mono text-xs outline-none focus:border-accent"
            />
            <button
              onClick={() => void handleImport()}
              disabled={submitting || !signature.trim()}
              className="mt-4 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
            >
              {submitting ? "Importing…" : "Import receipt"}
            </button>
            <p className="mt-3 text-[11px] text-[#71717a]">
              You must be either the sender or recipient. Stops strangers
              from polluting your trust graph with unrelated txs.
            </p>
          </section>
        )}

        {result?.ok && result.request_id && result.receipt_hash && (
          <section className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
            <p className="text-sm font-medium text-emerald-300">
              {result.idempotent ? "Already in the index" : "Imported ✓"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <span className="text-[#71717a]">amount</span>
              <span>
                {(Number(result.amount_lamports ?? "0") / 1e6).toFixed(2)} USDC
              </span>
              {result.sender && (
                <>
                  <span className="text-[#71717a]">sender</span>
                  <span className="font-mono">
                    {result.sender.slice(0, 6)}…{result.sender.slice(-4)}
                  </span>
                </>
              )}
              {result.recipient && (
                <>
                  <span className="text-[#71717a]">recipient</span>
                  <span className="font-mono">
                    {result.recipient.slice(0, 6)}…{result.recipient.slice(-4)}
                  </span>
                </>
              )}
              {result.memos && result.memos.length > 0 && (
                <>
                  <span className="text-[#71717a]">memos</span>
                  <span>{result.memos.join(" · ")}</span>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/receipts/${result.request_id}`}
                className="inline-flex h-9 items-center rounded-full border border-[#a1a1aa] px-4 text-xs hover:bg-[#f4f4f5]"
              >
                Open receipt →
              </Link>
              <Link
                href={`/verify/${result.receipt_hash}`}
                className="inline-flex h-9 items-center rounded-full border border-[#a1a1aa] px-4 text-xs hover:bg-[#f4f4f5]"
              >
                Public proof →
              </Link>
            </div>
          </section>
        )}

        {result && !result.ok && (
          <section className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-5 text-sm text-red-300">
            <p className="font-medium">Import failed</p>
            <p className="mt-2 text-xs text-red-200/70">
              {result.message ?? result.error ?? "Unknown error"}
            </p>
          </section>
        )}

        <section
          className="w6-card"
          style={{ padding: 20, marginTop: 24 }}
        >
          <h2
            className="w6-heading"
            style={{ fontSize: 16, margin: 0, marginBottom: 12 }}
          >
            What gets imported
          </h2>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--w6-ink-2)",
            }}
          >
            <li style={{ marginBottom: 8 }}>
              <strong style={{ color: "var(--w6-ink)" }}>
                SPL TransferChecked of USDC
              </strong>{" "}
              — sender, recipient, amount.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong style={{ color: "var(--w6-ink)" }}>
                Memo program ix&rsquo;s
              </strong>{" "}
              — joined into the kernel&rsquo;s purpose_text.
            </li>
            <li>
              <strong style={{ color: "var(--w6-ink)" }}>Block time</strong> —
              preserved as the receipt&rsquo;s created_at, so the import
              doesn&rsquo;t backdate the trust graph.
            </li>
          </ul>
          <p className="w6-muted" style={{ marginTop: 12, fontSize: 11 }}>
            Multi-asset and non-USDC imports are a future feature. Helio +
            Sphere importers ship the same shape under{" "}
            <code>import_source = &#39;helio&#39; / &#39;sphere&#39;</code>.
          </p>
        </section>
      </div>
    </W6AppShell>
  );
}
