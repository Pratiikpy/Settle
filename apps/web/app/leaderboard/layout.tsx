import type { Metadata } from "next";

/**
 * Metadata-only layout for /leaderboard. The page is "use client"
 * (Supabase Realtime + filtering) so it can't directly export
 * metadata. This server-component layout adds the title and
 * description used by search engines + share previews.
 */
export const metadata: Metadata = {
  title: "Service leaderboard · Settle",
  description:
    "Live capability/service leaderboard on Solana — ranked by spend volume across verified merchants. Settle's Supabase Realtime aggregation of public ALLOW receipts.",
};

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
