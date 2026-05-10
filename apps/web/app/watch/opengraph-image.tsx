import { ImageResponse } from "next/og";

/**
 * /watch OG image — static. 1200×630.
 * Same visual rhythm as /r/[id] poster: SETTLE wordmark, big headline,
 * footer thesis. Black bg matches the /watch dark page theme.
 */

export const runtime = "edge";
export const alt = "Watch an AI agent spend safely on Solana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0a0a0c",
          color: "#e6e6e8",
          padding: "72px 80px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "#9aa0a6",
            }}
          >
            SETTLE · LIVE DEMO
          </div>
          <div
            style={{
              padding: "8px 22px",
              borderRadius: 999,
              background: "rgba(39,201,63,0.15)",
              color: "#27c93f",
              border: "2px solid rgba(39,201,63,0.4)",
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: "0.05em",
            }}
          >
            ON DEVNET · NOW
          </div>
        </div>

        <div style={{ marginTop: 96, display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            Watch an AI agent spend
          </span>
          <span
            style={{
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              color: "#27c93f",
            }}
          >
            — safely.
          </span>
        </div>

        <div style={{ flexGrow: 1 }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#9aa0a6",
            fontSize: 22,
            fontWeight: 500,
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 22,
          }}
        >
          <span>Real txs. Real receipts. Real revoke.</span>
          <span>use-settle.vercel.app/watch</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
