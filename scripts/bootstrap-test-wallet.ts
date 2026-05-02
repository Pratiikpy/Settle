#!/usr/bin/env tsx
/**
 * One-time bootstrap of a dedicated test wallet for end-to-end smoke tests.
 *
 * Why a dedicated test wallet?
 *   - Keeps "buyer/authority" role separate from FACILITATOR (agent role).
 *   - Lets us run repeatable smoke tests without touching operator keys.
 *   - The demo-user keypair from seed-demo-card.ts is regenerated each run; this
 *     test wallet is committed to .test-wallet.json so we can re-faucet once,
 *     then reuse forever.
 *
 * What it does:
 *   1. Loads or generates a Keypair and writes to .test-wallet.json (gitignored).
 *   2. Requests 2 SOL airdrop on devnet (rate-limited; retries 3x).
 *   3. Prints the address + a Circle faucet URL.
 *
 * After running this once, paste the printed address into:
 *   https://faucet.circle.com/   (devnet USDC)
 *
 * Then re-run scripts/check-usdc-balances.ts (with TEST_WALLET in env) to verify.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WALLET_PATH = resolve(process.cwd(), ".test-wallet.json");
const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
const heliusKey = process.env.HELIUS_API_KEY;
const rpc = heliusKey
  ? `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`
  : `https://api.${cluster}.solana.com`;
// Helius's devnet does NOT support requestAirdrop — only the official devnet RPC does.
const airdropRpc = `https://api.${cluster}.solana.com`;
const conn = new Connection(rpc, "confirmed");
const airdropConn = new Connection(airdropRpc, "confirmed");

const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

async function main() {
  let kp: Keypair;
  if (existsSync(WALLET_PATH)) {
    const raw = JSON.parse(readFileSync(WALLET_PATH, "utf8")) as number[];
    kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    console.log(`Loaded existing test wallet from ${WALLET_PATH}`);
  } else {
    kp = Keypair.generate();
    writeFileSync(WALLET_PATH, JSON.stringify(Array.from(kp.secretKey)));
    console.log(`Generated NEW test wallet → ${WALLET_PATH}`);
  }
  const pubkey = kp.publicKey.toBase58();
  console.log(`\n  ADDRESS:  ${pubkey}`);

  // Check current SOL
  const solNow = await conn.getBalance(kp.publicKey, "confirmed");
  console.log(`  SOL now:  ${(solNow / LAMPORTS_PER_SOL).toFixed(3)}`);

  // Airdrop 2 SOL if low (faucets cap at 2 SOL/req on devnet, so we accept partial)
  if (solNow < 1 * LAMPORTS_PER_SOL) {
    console.log("\n  Requesting 2 SOL airdrop (devnet faucet)…");
    let lastErr: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        const sig = await airdropConn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
        await airdropConn.confirmTransaction(sig, "confirmed");
        const after = await conn.getBalance(kp.publicKey, "confirmed");
        console.log(`  Airdrop OK. SOL now: ${(after / LAMPORTS_PER_SOL).toFixed(3)}`);
        break;
      } catch (e) {
        lastErr = e;
        const msg = (e as Error).message ?? String(e);
        console.log(`  Airdrop attempt ${i + 1}/3 failed: ${msg}`);
        if (i < 2) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (lastErr && (await conn.getBalance(kp.publicKey, "confirmed")) < 1 * LAMPORTS_PER_SOL) {
      console.log(`  All 3 airdrop attempts failed. The devnet faucet is rate-limited;`);
      console.log(`  use https://faucet.solana.com/ or wait 30 min and re-run.`);
    }
  }

  // Check USDC ATA
  const ata = await getAssociatedTokenAddress(usdcMint, kp.publicKey);
  let usdc = "no ATA";
  try {
    const info = await conn.getTokenAccountBalance(ata, "confirmed");
    usdc = `${info.value.uiAmountString} USDC`;
  } catch {
    usdc = "no ATA (faucet has not been used yet)";
  }
  console.log(`  USDC:     ${usdc}`);
  console.log(`  USDC ATA: ${ata.toBase58()}`);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`NEXT STEP — manually faucet devnet USDC to this wallet:`);
  console.log(`  1. Open  https://faucet.circle.com/`);
  console.log(`  2. Select chain: Solana, network: Devnet`);
  console.log(`  3. Paste address: ${pubkey}`);
  console.log(`  4. Click "Get USDC" (10 USDC, rate-limited per IP)`);
  console.log(`  5. Re-run this script to verify USDC arrived.`);
  console.log(`${"=".repeat(70)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
