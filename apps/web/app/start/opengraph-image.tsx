import { ImageResponse } from "next/og";

/**
 * /start OG image — static. 1200×630.
 * Light theme matching the /start picker page. Three-fork visual:
 * "I send / I sell / I build".
 */

export const runtime = "edge";
export const alt = "Pick how you'll use Settle";
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
          background: "#fafaf7",
          color: "#0a0a0c",
          padding: "64px 80px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.04em" }}>
          SETTLE · GET STARTED
        </div>

        <div style={{ marginTop: 56, display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 88,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
            }}
          >
            Pick how you'll
          </span>
          <span
            style={{
              fontSize: 88,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
            }}
          >
            use Settle.
          </span>
        </div>

        <div
          style={{
            marginTop: 56,
            display: "flex",
            gap: 18,
          }}
        >
          {["I send", "I sell", "I build"].map((label) => (
            <div
              key={label}
              style={{
                flex: 1,
                display: "flex",
                background: "#fff",
                border: "2px solid rgba(0,0,0,0.08)",
                borderRadius: 18,
                padding: "32px 28px",
                fontSize: 36,
                fontWeight: 700,
                color: "#0a0a0c",
              }}
            >
              {label}
            </div>
          ))}
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
          <span>Three paths. Each ends with a real receipt on Solana.</span>
          <span>use-settle.vercel.app/start</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
