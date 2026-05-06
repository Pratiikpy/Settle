import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/cnft/[id]/metadata.json
 *
 * Token Metadata JSON for an individual Settle Receipt cNFT.
 * `id` is the receipt index (decision_slot, set during cnft mint).
 *
 * If the receipt exists in Supabase, we render rich metadata (merchant, amount, hashes).
 * Otherwise we render a generic placeholder (e.g. for receipts not yet indexed).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300", // 5min â€” receipts are immutable but Supabase reads aren't free
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://use-settle.vercel.app";

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let receipt: {
    merchant_pubkey: string;
    amount_lamports: string;
    decision_slot: number;
    receipt_hash: string;
    target_method: string;
    target_path: string;
    created_at: string;
  } | null = null;

  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await supabase
        .from("receipts")
        .select(
          "merchant_pubkey, amount_lamports, decision_slot, receipt_hash, target_method, target_path, created_at",
        )
        .eq("decision_slot", Number(id))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      receipt = data;
    } catch {
      // Ignore â€” fall through to placeholder
    }
  }

  if (receipt) {
    const usdc = (Number(receipt.amount_lamports) / 1_000_000).toFixed(2);
    const merchant = `${receipt.merchant_pubkey.slice(0, 6)}â€¦${receipt.merchant_pubkey.slice(-4)}`;
    const receiptHashStr =
      typeof receipt.receipt_hash === "string"
        ? receipt.receipt_hash.startsWith("\\x")
          ? receipt.receipt_hash.slice(2)
          : receipt.receipt_hash
        : "";

    return NextResponse.json(
      {
        name: `Settle Receipt #${id}`,
        symbol: "SETTLE",
        description: `Cryptographic receipt for an AI-agent payment of $${usdc} USDC to ${merchant}. Verifiable on-chain via @settle/sdk verifyReceipt().`,
        image: `${baseUrl}/og/cnft-receipt.png?slot=${id}`,
        external_url: `${baseUrl}/cards/${id}`,
        attributes: [
          { trait_type: "Merchant", value: merchant },
          { trait_type: "Amount (USDC)", value: usdc },
          { trait_type: "Decision Slot", value: receipt.decision_slot },
          { trait_type: "HTTP", value: `${receipt.target_method} ${receipt.target_path}` },
          { trait_type: "Receipt Hash", value: receiptHashStr.slice(0, 16) + "â€¦" },
          { trait_type: "Created", value: receipt.created_at },
          { trait_type: "Verifiable", value: "@settle/sdk verifyReceipt()" },
        ],
        properties: {
          category: "image",
          files: [{ uri: `${baseUrl}/og/cnft-receipt.png?slot=${id}`, type: "image/png" }],
        },
      },
      { headers: CORS },
    );
  }

  // Placeholder metadata (receipt not in DB yet)
  return NextResponse.json(
    {
      name: `Settle Receipt #${id}`,
      symbol: "SETTLE",
      description:
        "AI-agent payment receipt on Solana. This receipt's full metadata is pending indexer ingestion.",
      image: `${baseUrl}/og/cnft-receipt-placeholder.png`,
      external_url: baseUrl,
      attributes: [
        { trait_type: "Status", value: "Pending" },
        { trait_type: "Slot", value: id },
      ],
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return NextResponse.json(null, {
    headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}
