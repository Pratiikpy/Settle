import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wave 6.2 — `/api/balance?pubkey=<base58>`
 *
 * Returns USDC + SOL balances for the wallet, plus the cluster.
 *
 * On RPC failure we return a soft empty payload (zeros) rather than a
 * 5xx — the dashboard handles this by showing "—" placeholders.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface BalancePayload {
  ok: true;
  pubkey: string;
  cluster: string;
  usdc: string;
  sol: string;
  as_of: string;
}

function emptyBalance(pubkey: string, cluster: string): BalancePayload {
  return {
    ok: true,
    pubkey,
    cluster,
    usdc: "0.00",
    sol: "0.00",
    as_of: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  const pubkey = req.nextUrl.searchParams.get("pubkey")?.trim();
  if (!pubkey || !PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as
    | "devnet"
    | "mainnet";

  const heliusKey = process.env.HELIUS_API_KEY;
  const rpc = heliusKey
    ? `https://${cluster === "mainnet" ? "mainnet" : "devnet"}.helius-rpc.com/?api-key=${heliusKey}`
    : clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");

  let pk: PublicKey;
  try {
    pk = new PublicKey(pubkey);
  } catch {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  const connection = new Connection(rpc, "confirmed");

  let solLamports = 0;
  try {
    solLamports = await connection.getBalance(pk, "confirmed");
  } catch {
    return NextResponse.json(emptyBalance(pubkey, cluster), {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
    });
  }

  const usdcMint = new PublicKey(
    cluster === "mainnet" ? USDC_MINT_MAINNET : USDC_MINT_DEVNET,
  );
  let usdcRaw = 0;
  try {
    const tokenAccs = await connection.getParsedTokenAccountsByOwner(
      pk,
      { mint: usdcMint },
      "confirmed",
    );
    for (const acc of tokenAccs.value) {
      const info = acc.account.data.parsed.info as {
        tokenAmount?: { amount?: string };
      };
      usdcRaw += Number(info.tokenAmount?.amount ?? 0);
    }
  } catch {
    // Soft-fail: if we got SOL but USDC failed, return what we have
  }

  return NextResponse.json(
    {
      ok: true,
      pubkey,
      cluster,
      usdc: (usdcRaw / 1e6).toFixed(2),
      sol: (solLamports / 1e9).toFixed(2),
      as_of: new Date().toISOString(),
    } satisfies BalancePayload,
    {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    },
  );
}
