import { ImageResponse } from "next/og";

/**
 * Dynamic OG image for /r/[id] receipt poster.
 *
 * Next.js auto-wires this route as the OG image for the receipt poster
 * page. Generates a 1200×630 PNG with decision, amount, receipt id,
 * and the Settle wordmark — so a shared link looks like a poster, not
 * a generic preview.
 *
 * Falls back to a generic Settle card if the receipt can't be fetched.
 */

export const runtime = "edge";
export const alt = "Settle cryptographic receipt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface ReceiptDto {
  request_id?: string;
  amount_lamports?: string | number | null;
  decision?: "ALLOW" | "DENY" | null;
  receipt_hash?: string | null;
}

async function fetchReceipt(id: string): Promise<ReceiptDto | null> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";
  try {
    // Honor upstream cache for OG generation — receipts are immutable
    // so a cached fetch is fine here too.
    const r = await fetch(`${base}/api/receipts/${id}`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return null;
    const body = await r.json();
    return (body && typeof body === "object" && "receipt" in body
      ? body.receipt
      : body) as ReceiptDto;
  } catch {
    return null;
  }
}

export default async function OG({ params }: { params: { id: string } }) {
  const receipt = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    params.id,
  )
    ? await fetchReceipt(params.id)
    : null;

  const allow = receipt?.decision !== "DENY";
  const verb = receipt ? (allow ? "VERIFIED" : "BLOCKED") : "RECEIPT";
  const verbColor = allow ? "#1f9d55" : "#c1311e";
  const amount = receipt
    ? (Number(receipt.amount_lamports ?? 0) / 1e6).toFixed(2)
    : null;
  const idShort = receipt?.request_id
    ? `#${receipt.request_id.slice(0, 8)}`
    : `#${params.id.slice(0, 8)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#fafaf7",
          color: "#0a0a0c",
          padding: "72px 80px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.04em" }}>
            SETTLE · ON SOLANA
          </div>
          <div
            style={{
              padding: "8px 22px",
              borderRadius: 999,
              background: allow ? "rgba(31,157,85,0.12)" : "rgba(193,49,30,0.12)",
              color: verbColor,
              border: `2px solid ${verbColor}33`,
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: "0.05em",
            }}
          >
            {`${verb} ${allow ? "✓" : "✗"}`}
          </div>
        </div>

        <div style={{ marginTop: 80, display: "flex", flexDirection: "column" }}>
          {amount ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <span style={{ fontSize: 180, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
                ${amount}
              </span>
              <span style={{ fontSize: 48, color: "#5a5f66", fontWeight: 600 }}>USDC</span>
            </div>
          ) : (
            <span style={{ fontSize: 96, fontWeight: 800, letterSpacing: "-0.02em" }}>
              Cryptographic receipt
            </span>
          )}
          <div
            style={{
              marginTop: 28,
              fontSize: 26,
              color: "#5a5f66",
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.04em",
            }}
          >
            {idShort}
          </div>
        </div>

        <div style={{ flexGrow: 1 }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#5a5f66",
            fontSize: 20,
            fontWeight: 500,
            borderTop: "1px solid rgba(0,0,0,0.08)",
            paddingTop: 22,
          }}
        >
          <span>Verifiable money on Solana.</span>
          <span>settle.xyz</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
