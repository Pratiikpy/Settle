import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #9945FF 0%, #14F195 100%)",
          color: "#0A0A0A",
          fontSize: 110,
          fontWeight: 800,
          letterSpacing: "-0.05em",
        }}
      >
        S
      </div>
    ),
    size,
  );
}
