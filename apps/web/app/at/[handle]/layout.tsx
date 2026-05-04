import type { Metadata } from "next";

interface ProfileLite {
  handle?: string;
  display_name?: string | null;
  public_receipts_count?: number;
  public_total_usdc?: string;
}

async function fetchProfile(handle: string): Promise<ProfileLite | null> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";
  try {
    const r = await fetch(`${base}/api/handles/${handle}/profile`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j as ProfileLite;
  } catch {
    return null;
  }
}

/**
 * Metadata layout for /at/[handle]. Page is "use client" so this
 * server-component layout owns dynamic metadata. Falls back to a
 * generic title when the handle isn't found.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await fetchProfile(handle);
  if (!profile || !profile.handle) {
    return { title: `@${handle} · Settle` };
  }
  const name = profile.display_name || `@${profile.handle}`;
  const title = `${name} on Settle · @${profile.handle}`;
  const totalUsdc = profile.public_total_usdc ?? "0.00";
  const desc = `${profile.public_receipts_count ?? 0} public receipts · $${totalUsdc} USDC settled. Verify any payment cryptographically on Solana.`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: "profile" },
    twitter: { card: "summary", title, description: desc },
  };
}

export default function AtHandleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
