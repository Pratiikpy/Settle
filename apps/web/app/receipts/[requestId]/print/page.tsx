import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PrintButton } from "./PrintButton";

/**
 * /receipts/[requestId]/print — print-styled receipt for PDF export.
 *
 * Server-rendered by default (only the Print button is client). The
 * print-receipt.css static asset (apps/web/public/print-receipt.css)
 * carries the @page + @media print rules so the browser's "Save as
 * PDF" produces a clean letter-sized document.
 *
 * Why server render + browser print-to-PDF instead of a PDF library:
 * lowest-tech path that produces a real PDF. No `pdfkit`,
 * `@react-pdf/renderer`, or headless Chromium on Vercel. Works on
 * any browser the merchant has. Trade-off: less pixel-perfect than a
 * render-engine-controlled PDF, but for a receipt that's two columns
 * of facts + a hash chain, this is more than enough.
 *
 * Caller flow:
 *   /receipts/[id] → "Save as PDF" link →
 *   /receipts/[id]/print opens → user clicks print → save as PDF.
 */

export const metadata: Metadata = {
  title: "Receipt — Settle",
  description: "Verifiable receipt with kernel commit hashes.",
  robots: { index: false },
};

interface ReceiptResponse {
  ok: true;
  receipt: {
    request_id: string;
    card_pubkey: string;
    pact_pubkey: string | null;
    merchant_pubkey: string;
    sender_pubkey: string | null;
    amount_lamports: string;
    decision: "ALLOW" | "DENY" | "REVIEW";
    deny_code: number | null;
    capability_hash: string | null;
    purpose_text_hash: string | null;
    purpose_hash: string | null;
    receipt_hash: string | null;
    reason_hash: string | null;
    policy_snapshot_hash: string | null;
    target_method: string;
    target_path: string;
    sig_solscan: string | null;
    decision_slot: number;
    policy_version: number;
    created_at: string;
    receipt_kind?: string;
    context_hash?: string | null;
    refund_of_request_id?: string | null;
  };
}

async function fetchReceipt(requestId: string): Promise<ReceiptResponse | null> {
  const base = process.env.NEXT_PUBLIC_BASE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    ?? "http://localhost:3000";
  try {
    const r = await fetch(`${base}/api/receipts/${requestId}`, {
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as ReceiptResponse | { error: string };
    if ("ok" in j && j.ok) return j;
    return null;
  } catch {
    return null;
  }
}

function formatUsdc(lamports: string): string {
  // Sub-cent amounts (e.g. 1000 lamports = $0.001) used to render as
  // "$0.00" because the formatter sliced to 2 decimals. Show 6-decimal
  // precision (trailing zeros trimmed) for sub-cent so a 0.001 USDC tip
  // doesn't look like nothing on a printed receipt.
  const n = BigInt(lamports);
  const whole = (n / 1_000_000n).toString();
  const fracRaw = (n % 1_000_000n).toString().padStart(6, "0");
  const subCent = whole === "0" && fracRaw.slice(0, 2) === "00";
  if (subCent) {
    const trimmed = fracRaw.replace(/0+$/, "") || "0";
    return `$0.${trimmed}`;
  }
  return `$${whole}.${fracRaw.slice(0, 2)}`;
}

function stripBytea(v: string | null | undefined): string {
  if (!v) return "—";
  return v.startsWith("\\x") ? v.slice(2) : v;
}

export default async function PrintReceiptPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const data = await fetchReceipt(requestId);
  if (!data) notFound();

  const r = data.receipt;
  const decisionLabel =
    r.decision === "ALLOW"
      ? "Approved"
      : r.decision === "DENY"
        ? "Denied"
        : "In review";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://use-settle.vercel.app";

  return (
    <html lang="en">
      <head>
        <title>Receipt — Settle</title>
        <link rel="stylesheet" href="/print-receipt.css" />
      </head>
      <body>
        <div className="container">
          <PrintButton />

          {/* Header */}
          <div className="header">
            <div>
              <div className="brand">Settle</div>
              <div className="receipt-id">Receipt · {r.request_id}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="receipt-id">
                {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Amount + decision */}
          <div className="amount">
            {formatUsdc(r.amount_lamports)} USDC
            <span
              className={`decision-pill decision-${r.decision.toLowerCase()}`}
            >
              {decisionLabel}
            </span>
          </div>

          {/* Parties + metadata */}
          <div className="grid">
            <div className="label">Kind</div>
            <div className="value">{r.receipt_kind ?? "x402_spend"}</div>

            {r.sender_pubkey && (
              <>
                <div className="label">From</div>
                <div className="value">{r.sender_pubkey}</div>
              </>
            )}

            <div className="label">To (merchant)</div>
            <div className="value">{r.merchant_pubkey}</div>

            <div className="label">Card</div>
            <div className="value">{r.card_pubkey}</div>

            {r.pact_pubkey && (
              <>
                <div className="label">Spending rule</div>
                <div className="value">{r.pact_pubkey}</div>
              </>
            )}

            {r.target_method && r.target_path && (
              <>
                <div className="label">HTTP target</div>
                <div className="value">
                  {r.target_method} {r.target_path}
                </div>
              </>
            )}

            <div className="label">Decision slot</div>
            <div className="value">{r.decision_slot.toLocaleString()}</div>

            <div className="label">Policy version</div>
            <div className="value">{r.policy_version}</div>

            {r.deny_code !== null && r.deny_code > 0 && (
              <>
                <div className="label">Deny code</div>
                <div className="value">{r.deny_code}</div>
              </>
            )}

            {r.refund_of_request_id && (
              <>
                <div className="label">Refund of</div>
                <div className="value">{r.refund_of_request_id}</div>
              </>
            )}
          </div>

          {/* Hash chain */}
          <div className="hashes">
            <h2>Kernel commit (4 hashes)</h2>
            <div className="hash-row">
              <div className="hash-label">receipt_hash</div>
              <div className="hash-value">{stripBytea(r.receipt_hash)}</div>
            </div>
            <div className="hash-row">
              <div className="hash-label">reason_hash</div>
              <div className="hash-value">{stripBytea(r.reason_hash)}</div>
            </div>
            <div className="hash-row">
              <div className="hash-label">policy_snapshot_hash</div>
              <div className="hash-value">
                {stripBytea(r.policy_snapshot_hash)}
              </div>
            </div>
            <div className="hash-row">
              <div className="hash-label">purpose_hash</div>
              <div className="hash-value">{stripBytea(r.purpose_hash)}</div>
            </div>
            {r.context_hash && (
              <div className="hash-row" style={{ marginTop: "0.75rem" }}>
                <div className="hash-label">context_hash</div>
                <div className="hash-value">{stripBytea(r.context_hash)}</div>
              </div>
            )}
            {r.capability_hash && (
              <div className="hash-row">
                <div className="hash-label">capability_hash</div>
                <div className="hash-value">
                  {stripBytea(r.capability_hash)}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="footer">
            <p>
              <strong>Verifiable forever.</strong> Re-derive the four hashes
              from the canonical receipt JSON via @settle/sdk; if they match,
              this receipt is authentic.
            </p>
            {r.sig_solscan && (
              <p style={{ marginTop: "0.75rem" }}>
                On-chain signature:{" "}
                <span className="verify-link">{r.sig_solscan}</span>
              </p>
            )}
            <p style={{ marginTop: "0.75rem" }}>
              Verify online:{" "}
              <span className="verify-link">
                {baseUrl}/receipts/{r.request_id}
              </span>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
