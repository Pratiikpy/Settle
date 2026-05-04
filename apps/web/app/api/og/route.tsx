import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

/**
 * GET /api/og — default Twitter card OG image.
 * Used as the og:image for the home page + Blink share previews.
 */

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          // Satori (next/og engine) rejects mixed solid-color + multi-
          // gradient background shorthand. Split into solid backgroundColor
          // + gradient-only backgroundImage.
          backgroundColor: "#0A0A0A",
          backgroundImage:
            "radial-gradient(120% 100% at 0% 0%, rgba(153, 69, 255, 0.35) 0%, transparent 50%), radial-gradient(120% 100% at 100% 100%, rgba(20, 241, 149, 0.25) 0%, transparent 50%)",
          padding: "80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 36, color: "rgba(255,255,255,0.6)", letterSpacing: "0.2em" }}>
          SETTLE
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              color: "white",
              lineHeight: 1,
            }}
          >
            Pay anyone.
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              color: "white",
              lineHeight: 1,
            }}
          >
            Hire any AI.
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              background: "linear-gradient(135deg, #9945FF 0%, #14F195 100%)",
              backgroundClip: "text",
              color: "transparent",
              lineHeight: 1,
            }}
          >
            Trust the receipts.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 28,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          The payment app for the AI age. On Solana.
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // OG image is fully static (no params, no dynamic data).
        // Long-cache it: 1h s-maxage + 1d SWR. Reduces edge runtime
        // hits — Twitter/Slack/Discord scrapers refetch each share.
        "Cache-Control":
          "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
