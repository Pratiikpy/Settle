import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

/**
 * GET /api/og/cnft/[slot]
 *
 * Dynamically renders a 1024×1024 PNG for a Settle Receipt cNFT.
 * Used as the `image` URI in cNFT metadata JSON; rendered by Phantom + Backpack.
 *
 * V1: rendered from URL params (slot, merchant, amount). V2: query Supabase for the receipt
 * by decision_slot and render real merchant + USDC + truncated hash.
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slot: string }> },
) {
  const { slot } = await params;
  const url = new URL(req.url);
  const merchant = url.searchParams.get("merchant") ?? "Settle";
  const amount = url.searchParams.get("amount") ?? "0.00";

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
          background:
            "radial-gradient(120% 100% at 0% 0%, rgba(153, 69, 255, 0.4) 0%, transparent 50%), radial-gradient(120% 100% at 100% 100%, rgba(20, 241, 149, 0.3) 0%, transparent 50%), #0A0A0A",
          padding: "80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: 28,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.7)",
              fontWeight: 600,
            }}
          >
            Settle Receipt
          </div>
          <div
            style={{
              fontSize: 144,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              color: "white",
              lineHeight: 1,
            }}
          >
            #{slot}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 32 }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Merchant</span>
            <span style={{ color: "white", fontWeight: 600 }}>{merchant}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 32 }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Amount</span>
            <span
              style={{
                color: "#14F195",
                fontWeight: 600,
                fontFamily: "monospace",
              }}
            >
              ${amount}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 22,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginTop: "32px",
            }}
          >
            Bubblegum · Solana
          </div>
        </div>
      </div>
    ),
    { width: 1024, height: 1024 },
  );
}
