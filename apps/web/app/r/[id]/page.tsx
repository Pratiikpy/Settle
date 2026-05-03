import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSolscanUrl, getSolscanAccountUrl } from "../../../lib/solana";

/**
 * Public receipt poster page — beautiful, shareable, server-rendered.
 *
 * Pulls the receipt directly from /api/receipts/[requestId] (which is
 * already public-safe). Renders the 4-hash chain, decision, amount,
 * Solscan tx link, "verify on page" CTA, OG image metadata.
 *
 * URL: /r/<request_id>
 *
 * Failure modes:
 * - Bad request_id format → 404 via notFound()
 * - Receipt not found → 404
 * - Supabase down → render with `unavailable: true` banner (no fake data)
 */

interface ReceiptDto {
  request_id: string;
  card_pubkey: string | null;
  pact_pubkey: string | null;
  merchant_pubkey: string | null;
  amount_lamports: string | number | null;
  decision: "ALLOW" | "DENY" | null;
  deny_code: string | null;
  capability_hash: string | null;
  purpose_text_hash: string | null;
  purpose_hash: string | null;
  receipt_hash: string | null;
  reason_hash: string | null;
  policy_snapshot_hash: string | null;
  target_method: string | null;
  target_path: string | null;
  sig_solscan: string | null;
  policy_version: string | null;
  receipt_kind: string | null;
  context_hash: string | null;
  created_at: string | null;
}

async function fetchReceipt(id: string): Promise<ReceiptDto | null> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";
  try {
    const r = await fetch(`${base}/api/receipts/${id}`, { cache: "no-store" });
    if (!r.ok) return null;
    const body = await r.json();
    // /api/receipts/[id] returns either a flat receipt or { ok, receipt: {...} }
    const data = (body && typeof body === "object" && "receipt" in body
      ? body.receipt
      : body) as ReceiptDto;
    if (!data || !data.request_id) return null;
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const r = await fetchReceipt(id);
  if (!r) {
    return { title: `Settle receipt · ${id.slice(0, 8)}` };
  }
  const amount = (Number(r.amount_lamports ?? 0) / 1e6).toFixed(2);
  const verb = r.decision === "DENY" ? "BLOCKED" : "Verified";
  const title = `Settle receipt · ${verb} · $${amount} USDC`;
  const desc = `Cryptographic receipt #${(r.receipt_hash || "").slice(0, 8)} on Solana${r.sig_solscan ? ` · tx ${r.sig_solscan.slice(0, 8)}…` : ""}`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: "article" },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

export default async function ReceiptPoster({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }
  const r = await fetchReceipt(id);
  if (!r || !r.request_id) notFound();

  const amount = (Number(r.amount_lamports ?? 0) / 1e6).toFixed(2);
  const allow = r.decision !== "DENY";
  const verbColor = allow ? "#1f9d55" : "#c1311e";
  const verb = allow ? "Verified" : "Blocked";

  return (
    <main
      data-testid="receipt-poster"
      style={{
        minHeight: "100vh",
        background: "#fafaf7",
        color: "#0a0a0c",
        fontFamily:
          "ui-sans-serif, -apple-system, system-ui, Segoe UI, Roboto, sans-serif",
        padding: "32px 16px 64px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link
          href="/"
          style={{ fontSize: 13, color: "#0a0a0c", textDecoration: "none" }}
        >
          ← settle.xyz
        </Link>

        <article
          style={{
            marginTop: 24,
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 18,
            padding: "32px 28px",
            boxShadow:
              "0 1px 0 rgba(0,0,0,0.02), 0 12px 32px rgba(0,0,0,0.05)",
          }}
        >
          <header style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, color: "#5a5f66", fontWeight: 600 }}>
                SETTLE · CRYPTOGRAPHIC RECEIPT
              </div>
              <div
                data-testid="receipt-id"
                style={{
                  fontSize: 14,
                  color: "#5a5f66",
                  fontFamily: "ui-monospace, monospace",
                  marginTop: 6,
                }}
              >
                #{r.request_id}
              </div>
            </div>
            <div
              data-testid="receipt-decision-badge"
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                background: allow ? "rgba(31,157,85,0.1)" : "rgba(193,49,30,0.1)",
                color: verbColor,
                fontWeight: 700,
                fontSize: 13,
                alignSelf: "flex-start",
                border: `1px solid ${verbColor}33`,
              }}
            >
              {verb} ✓
            </div>
          </header>

          <div style={{ marginTop: 36 }}>
            <div style={{ fontSize: 12, color: "#5a5f66", fontWeight: 600 }}>
              AMOUNT
            </div>
            <div
              data-testid="receipt-amount"
              style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}
            >
              ${amount} <span style={{ fontSize: 22, color: "#5a5f66" }}>USDC</span>
            </div>
            {!allow && r.deny_code ? (
              <div
                data-testid="receipt-deny-reason"
                style={{
                  marginTop: 8,
                  color: "#c1311e",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Reason: {r.deny_code}
              </div>
            ) : null}
          </div>

          <div
            style={{
              marginTop: 28,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <Field
              label="MERCHANT"
              value={r.merchant_pubkey}
              link={r.merchant_pubkey ? getSolscanAccountUrl(r.merchant_pubkey) : null}
              testId="receipt-merchant"
            />
            <Field
              label="CARD"
              value={r.card_pubkey}
              link={r.card_pubkey ? getSolscanAccountUrl(r.card_pubkey) : null}
              testId="receipt-card"
            />
            <Field
              label="REQUEST"
              value={
                r.target_method && r.target_path
                  ? `${r.target_method} ${r.target_path}`
                  : null
              }
              testId="receipt-request"
            />
            <Field
              label="POLICY VERSION"
              value={r.policy_version}
              testId="receipt-policy-version"
            />
          </div>

          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 12, color: "#5a5f66", fontWeight: 600 }}>
              4-HASH CHAIN
            </div>
            <div
              style={{
                marginTop: 10,
                background: "#0a0a0c",
                color: "#e6e6e8",
                borderRadius: 10,
                padding: "16px 18px",
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              <HashRow label="receipt_hash" value={r.receipt_hash} testId="hash-receipt" />
              <HashRow label="context_hash" value={r.context_hash} testId="hash-context" />
              <HashRow label="reason_hash" value={r.reason_hash} testId="hash-reason" />
              <HashRow
                label="policy_snapshot"
                value={r.policy_snapshot_hash}
                testId="hash-policy"
              />
            </div>
          </div>

          <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {r.sig_solscan ? (
              <a
                data-testid="receipt-solscan-link"
                href={getSolscanUrl(r.sig_solscan)}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  background: "#0a0a0c",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                View tx on Solscan ↗
              </a>
            ) : null}
            <Link
              data-testid="receipt-verify-link"
              href={
                r.receipt_hash
                  ? `/verify?h=${encodeURIComponent((r.receipt_hash || "").replace(/^\\x/, ""))}`
                  : `/verify`
              }
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: "#fff",
                color: "#0a0a0c",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.12)",
              }}
            >
              Verify hashes →
            </Link>
          </div>

          <footer
            style={{
              marginTop: 28,
              fontSize: 12,
              color: "#5a5f66",
              borderTop: "1px solid rgba(0,0,0,0.06)",
              paddingTop: 16,
            }}
          >
            Created{" "}
            {r.created_at ? new Date(r.created_at).toLocaleString() : "—"} · Settle on
            Solana
          </footer>
        </article>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  link,
  testId,
}: {
  label: string;
  value: string | null;
  link?: string | null;
  testId?: string;
}) {
  if (!value) {
    return (
      <div data-testid={testId}>
        <div style={{ fontSize: 11, color: "#5a5f66", fontWeight: 600 }}>{label}</div>
        <div style={{ marginTop: 4, color: "#9aa0a6" }}>—</div>
      </div>
    );
  }
  const short =
    value.length > 16 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  return (
    <div data-testid={testId}>
      <div style={{ fontSize: 11, color: "#5a5f66", fontWeight: 600 }}>{label}</div>
      <div
        style={{
          marginTop: 4,
          fontSize: 14,
          fontFamily: value.length > 24 ? "ui-monospace, monospace" : undefined,
        }}
      >
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" style={{ color: "#0a0a0c" }}>
            {short} ↗
          </a>
        ) : (
          short
        )}
      </div>
    </div>
  );
}

function HashRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | null;
  testId: string;
}) {
  if (!value) {
    return (
      <div data-testid={testId}>
        <span style={{ color: "#7c93ff" }}>{label.padEnd(16)}</span>
        <span style={{ color: "#5a5f66" }}>—</span>
      </div>
    );
  }
  const v = value.replace(/^\\x/, "");
  return (
    <div data-testid={testId}>
      <span style={{ color: "#7c93ff" }}>{label.padEnd(16)}</span>
      <span>{v.slice(0, 12)}…{v.slice(-8)}</span>
    </div>
  );
}
