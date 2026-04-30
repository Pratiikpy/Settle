import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://settle.so";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Don't crawl wallet-protected or API endpoints; they're not useful in search anyway.
        disallow: ["/api/", "/claim/", "/cards/", "/spending/", "/settings/", "/onboarding/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
