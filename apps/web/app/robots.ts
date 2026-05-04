import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://settle.so";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Don't crawl wallet-protected or per-user surfaces — not useful
        // in search and bots can't authenticate. Public surfaces stay
        // crawlable: /, /watch, /start/*, /r/*, /m/[handle],
        // /at/[handle], /verify, /leaderboard, /docs/*, /help,
        // /security, /public-goods, /agents, /agents/templates.
        disallow: [
          "/api/",
          "/claim/",
          "/cards/",
          "/spending/",
          "/settings/",
          "/dashboard/",
          "/audit/",
          "/notifications/",
          "/activity/",
          "/feed/",
          "/allowances/",
          "/groups/",
          "/wishes/",
          "/agents/new/",
          "/agents/streaming/",
          "/agents/collab/",
          "/control-center/",
          "/admin/",
          "/sandbox/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
