import { NextResponse } from "next/server";

/**
 * GET /api/cnft/collection.json
 *
 * Token Metadata JSON for the Settle Receipts collection NFT.
 * Phantom + Backpack fetch this when displaying the collection in a wallet.
 *
 * Spec: https://docs.metaplex.com/programs/token-metadata/token-standard
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=86400, immutable",
};

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://settle.so";

  return NextResponse.json(
    {
      name: "Settle Receipts",
      symbol: "SETTLE",
      description:
        "Cryptographic receipts for AI-agent payments on Solana. Every receipt commits 3 BLAKE3 hashes on-chain plus a binding off-chain purpose_hash. Verifiable by anyone via @settle/sdk verifyReceipt() — no Settle servers required.",
      image: `${baseUrl}/og/cnft-collection.png`,
      external_url: baseUrl,
      attributes: [
        { trait_type: "Collection", value: "Settle Receipts" },
        { trait_type: "Standard", value: "Bubblegum V1 cNFT" },
        { trait_type: "Verifiable", value: "@settle/sdk verifyReceipt()" },
      ],
      properties: {
        category: "image",
        files: [
          {
            uri: `${baseUrl}/og/cnft-collection.png`,
            type: "image/png",
          },
        ],
      },
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return NextResponse.json(null, {
    headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}
