import type { Metadata } from "next";

interface ReceiptLite {
  request_id?: string;
  decision?: "ALLOW" | "DENY" | null;
  amount_lamports?: string | number | null;
  receipt_hash?: string | null;
}

async function fetchReceipt(id: string): Promise<ReceiptLite | null> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";
  try {
    const r = await fetch(`${base}/api/receipts/${id}`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return null;
    const body = await r.json();
    const data = (body && typeof body === "object" && "receipt" in body
      ? body.receipt
      : body) as ReceiptLite;
    return data;
  } catch {
    return null;
  }
}

/**
 * Metadata layout for the authed /receipts/[requestId] detail page.
 * Page is "use client" (uses wallet hooks + Realtime). This thin
 * server-component layout adds dynamic metadata so shared receipt
 * detail URLs render with useful previews even on platforms that
 * don't render the dedicated /r/[id]/opengraph-image route.
 *
 * Note: /r/[id] (poster) has its own poster + dynamic OG image
 * (added pass 10). This /receipts/[id] route is the authed detail
 * view that mutates (tags, refunds, narration). Shareable but less
 * commonly shared — still deserves real metadata.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ requestId: string }>;
}): Promise<Metadata> {
  const { requestId } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  ) {
    return { title: "Receipt · Settle" };
  }
  const receipt = await fetchReceipt(requestId);
  if (!receipt) {
    return { title: `Receipt · Settle` };
  }
  const allow = receipt.decision !== "DENY";
  const verb = allow ? "Verified" : "Blocked";
  const amount = (Number(receipt.amount_lamports ?? 0) / 1e6).toFixed(2);
  const title = `Receipt · ${verb} · $${amount} USDC · Settle`;
  const desc = `Cryptographic receipt #${(receipt.receipt_hash || "").slice(0, 8)} on Solana — ${verb.toLowerCase()} spend, full 4-hash chain verifiable.`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: "article" },
    twitter: { card: "summary", title, description: desc },
  };
}

export default function ReceiptDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
