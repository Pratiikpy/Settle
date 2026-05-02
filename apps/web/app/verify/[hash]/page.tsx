"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HashChainAnimation, TrustScoreBadge } from "@settle/ui";
import { W6AppShell } from "../../../components/w6-app-shell";

/**
 * F2.5 / M8 — Public proof page.
 *
 * URL: `/verify/<any-of-the-4-hashes>` — paste any of the receipt's 4
 * commit-chain hashes (or the 5th binding `context_hash`) and this page
 * will resolve to the receipt and render a 4-check verification.
 *
 * Public, no auth, no wallet connect required. Designed to be the link
 * a merchant sends a customer when they want third-party proof; the link
 * is also embeddable as an OG-image card.
 *
 * Why a page separate from /receipts/[requestId]:
 *   - /receipts/[id] expects the request_id (UUID v4); /verify/[hash]
 *     accepts any of 5 hashes — closer to "I have a hash, find me a
 *     receipt" semantics.
 *   - The forensic UI on the receipt page assumes the user owns the
 *     receipt or is the merchant. /verify is purely public-safe.
 */

interface VerifyResponse {
  ok: boolean;
  matched_on?: string;
  receipt?: {
    request_id: string;
    receipt_kind: string;
    card_pubkey: string | null;
    pact_pubkey: string | null;
    merchant_pubkey: string;
    amount_lamports: string;
    decision: "ALLOW" | "DENY" | "REVIEW";
    hashes: {
      receipt_hash: string | null;
      reason_hash: string | null;
      policy_snapshot_hash: string | null;
      purpose_hash: string | null;
      context_hash: string | null;
    };
    sig_solscan: string | null;
    decision_slot: number;
    policy_version: number;
    created_at: string;
    narration_text: string | null;
  };
  error?: string;
  message?: string;
}

export default function VerifyByHashPage() {
  const params = useParams<{ hash: string }>();
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!params.hash) return;
    setLoading(true);
    void fetch(`/api/verify/${params.hash}`)
      .then((r) => r.json())
      .then((j) => setData(j as VerifyResponse))
      .catch(() => setData({ ok: false, error: "fetch_failed" }))
      .finally(() => setLoading(false));
  }, [params.hash]);

  return (
    <W6AppShell forceSurface="public">
      <div style={{ maxWidth: 760 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Public proof · by hash
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
        >
          Verify
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
          Paste any of a receipt&apos;s 5 hashes to find and verify it. No
          wallet, no signup. Anyone can run this; the math is the same on
          every machine.
        </p>

        <div className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
          <p className="text-[11px] uppercase tracking-wide text-foreground/40">
            Hash
          </p>
          <code className="mt-2 block break-all font-mono text-xs text-foreground/70">
            {params.hash}
          </code>
        </div>

        {loading && (
          <p className="mt-6 text-sm text-foreground/50">Looking up…</p>
        )}

        {data && !data.ok && (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-5 text-sm text-red-300">
            <p className="font-medium">Not found in our index.</p>
            <p className="mt-2 text-xs text-red-200/70">
              {data.message ?? data.error}
            </p>
            <p className="mt-3 text-[11px] text-foreground/50">
              The hash format is valid 32-byte hex, but no receipt with this
              hash is in Settle's index. The receipt may still exist on-chain
              if it was committed via a non-Settle path.
            </p>
          </div>
        )}

        {data?.ok && data.receipt && (
          <>
            <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-emerald-300">
                  Receipt found
                </p>
                <span className="rounded-full border border-foreground/15 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] tracking-wide text-foreground/70">
                  matched on {data.matched_on}
                </span>
              </div>
              {data.receipt.narration_text && (
                <p className="mt-3 text-sm leading-relaxed text-foreground/85">
                  {data.receipt.narration_text}
                </p>
              )}
            </div>

            {/* Hash-chain animation — first-view only per receipt-id. */}
            <section className="mt-6">
              <HashChainAnimation receiptId={data.receipt.request_id} />
            </section>

            {/* Receipt summary */}
            <section className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <span className="text-foreground/40">decision</span>
                <span
                  className={
                    data.receipt.decision === "ALLOW"
                      ? "text-emerald-300"
                      : "text-red-300"
                  }
                >
                  {data.receipt.decision}
                </span>
                <span className="text-foreground/40">amount</span>
                <span>
                  {(Number(data.receipt.amount_lamports) / 1e6).toFixed(2)} USDC
                </span>
                <span className="text-foreground/40">kind</span>
                <span className="font-mono">{data.receipt.receipt_kind}</span>
                <span className="text-foreground/40">merchant</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono">
                    {data.receipt.merchant_pubkey.slice(0, 6)}…
                    {data.receipt.merchant_pubkey.slice(-4)}
                  </span>
                  <TrustScoreBadge
                    pubkey={data.receipt.merchant_pubkey}
                    variant="compact"
                  />
                </span>
                <span className="text-foreground/40">slot</span>
                <span className="font-mono">{data.receipt.decision_slot}</span>
                <span className="text-foreground/40">created</span>
                <span>{new Date(data.receipt.created_at).toLocaleString()}</span>
              </div>
            </section>

            {/* All 5 hashes */}
            <section className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-medium">Hashes</h2>
              <p className="mt-1 text-xs text-foreground/50">
                The 5 BLAKE3 hashes that bind this receipt. Run any of them
                back through this page to re-verify.
              </p>
              <ul className="mt-3 grid gap-2 text-[11px] font-mono text-foreground/60">
                {(
                  [
                    ["receipt_hash", data.receipt.hashes.receipt_hash],
                    ["reason_hash", data.receipt.hashes.reason_hash],
                    ["policy_snapshot_hash", data.receipt.hashes.policy_snapshot_hash],
                    ["purpose_hash", data.receipt.hashes.purpose_hash],
                    ["context_hash", data.receipt.hashes.context_hash],
                  ] as Array<[string, string | null]>
                ).map(([label, value]) => (
                  <li key={label} className="flex items-baseline gap-3">
                    <span className="w-44 text-foreground/45">{label}</span>
                    {value ? (
                      <Link
                        href={`/verify/${value}`}
                        className="break-all hover:text-accent"
                      >
                        {value}
                      </Link>
                    ) : (
                      <span className="text-foreground/30">(null)</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-6 flex gap-3">
              <Link
                href={`/receipts/${data.receipt.request_id}`}
                className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
              >
                Open full receipt →
              </Link>
              {data.receipt.sig_solscan && (
                <a
                  href={`https://solscan.io/tx/${data.receipt.sig_solscan}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
                >
                  Solscan ↗
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </W6AppShell>
  );
}
