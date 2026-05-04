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
          "/allowances/",
          "/groups/",
          "/wishes/",
          "/agents/new/",
          "/agents/streaming/",
          "/agents/collab/",
          "/control-center/",
          "/admin/",
          "/sandbox/",
          // /onboarding/ is the guided wallet-flow page; it requires
          // a connected wallet to do anything meaningful, so bots
          // would just see the connect prompt. /start/* is the
          // public, informational alternative.
          "/onboarding/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
