import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Keypair,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";

export const runtime = "nodejs";

/**
 * POST /api/sandbox/airdrop  body: { pubkey: string }
 *
 * Devnet ONLY. Two airdrops in sequence:
 *   1. 0.5 SOL via Solana devnet faucet (for tx fees)
 *   2. 25.00 test-USDC via our own mint (we hold the authority)
 *
 * The test-USDC mint is created by the operator and configured via
 *   SETTLE_TEST_USDC_MINT
 *   SETTLE_TEST_USDC_MINT_AUTHORITY_KEYPAIR_B58 (64-byte ed25519 secret)
 *
 * Rate-limited via Upstash: 1 airdrop per pubkey per 24h.
 *
 * Why our own mint instead of Circle's devnet USDC:
 *   - Circle's devnet USDC faucet is IP rate-limited (5 req/h)
 *   - We need every visitor to get $25 instantly on connect
 *   - The AgentCard allowlist references whatever mint we use, so consistency matters
 */

const COOLDOWN_SECONDS = 60 * 60 * 24; // 24h
const SOL_AIRDROP_LAMPORTS = 0.5 * LAMPORTS_PER_SOL;
const USDC_DECIMALS = 6;
const TEST_USDC_AMOUNT = 25_000_000n; // 25.00 USDC in base units

interface UpstashResp {
  result: number | string | null;
}

async function upstash(command: string[]): Promise<UpstashResp | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url}/${command.join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as UpstashResp;
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) return `https://devnet.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl("devnet");
}

async function mintTestUsdc(
  connection: Connection,
  recipient: PublicKey,
): Promise<{ ok: true; sig: string } | { ok: false; reason: string }> {
  const mintStr = process.env.SETTLE_TEST_USDC_MINT;
  const authorityB58 = process.env.SETTLE_TEST_USDC_MINT_AUTHORITY_KEYPAIR_B58;
  if (!mintStr || !authorityB58) {
    return {
      ok: false,
      reason: "test-USDC mint not configured (SETTLE_TEST_USDC_MINT + _AUTHORITY)",
    };
  }
  let mint: PublicKey;
  let authority: Keypair;
  try {
    mint = new PublicKey(mintStr);
    authority = Keypair.fromSecretKey(bs58.decode(authorityB58));
  } catch (e) {
    return { ok: false, reason: `invalid mint config: ${(e as Error).message}` };
  }

  try {
    const ata = await getAssociatedTokenAddress(mint, recipient);

    const tx = new Transaction().add(
      // Idempotent ATA create — no-op if it already exists
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ata, recipient, mint),
      // Mint TEST_USDC_AMOUNT to the user's ATA (authority signs)
      createMintToInstruction(mint, ata, authority.publicKey, TEST_USDC_AMOUNT),
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    return { ok: true, sig };
  } catch (e) {
    return { ok: false, reason: `mint_failed: ${(e as Error).message}` };
  }
}

export async function POST(req: NextRequest) {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (cluster !== "devnet") {
    return NextResponse.json({ error: "sandbox_devnet_only", cluster }, { status: 400 });
  }

  let body: { pubkey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.pubkey || typeof body.pubkey !== "string") {
    return NextResponse.json({ error: "missing_pubkey" }, { status: 400 });
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  // Cooldown check
  const cooldownKey = `sandbox:airdrop:${body.pubkey}`;
  const setResult = await upstash(["set", cooldownKey, "1", "EX", String(COOLDOWN_SECONDS), "NX"]);
  if (setResult && setResult.result !== "OK" && setResult.result !== null) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: COOLDOWN_SECONDS },
      { status: 429 },
    );
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(body.pubkey);
  } catch {
    return NextResponse.json({ error: "invalid_pubkey_decode" }, { status: 400 });
  }

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  // 1. SOL airdrop
  let solSig: string;
  try {
    solSig = await connection.requestAirdrop(pubkey, SOL_AIRDROP_LAMPORTS);
    void connection
      .confirmTransaction(solSig, "confirmed")
      .catch((e) => console.warn("[airdrop] sol confirm failed:", e));
  } catch (e) {
    return NextResponse.json(
      { error: "sol_airdrop_failed", message: (e as Error).message },
      { status: 500 },
    );
  }

  // 2. test-USDC mint (best-effort — SOL airdrop already succeeded)
  const usdcResult = await mintTestUsdc(connection, pubkey);

  return NextResponse.json({
    ok: true,
    sol_airdrop_sig: solSig,
    sol_airdrop_lamports: SOL_AIRDROP_LAMPORTS,
    usdc_mint_sig: usdcResult.ok ? usdcResult.sig : null,
    usdc_mint_amount: usdcResult.ok ? "25.00" : null,
    note: usdcResult.ok ? undefined : `usdc_mint_skipped: ${usdcResult.reason}`,
  });
}
