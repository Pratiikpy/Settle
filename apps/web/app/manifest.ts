import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Settle",
    short_name: "Settle",
    description: "Pay anyone. Hire any AI. Trust the receipts.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0A",
    theme_color: "#9945FF",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    categories: ["finance", "productivity"],
  };
}
