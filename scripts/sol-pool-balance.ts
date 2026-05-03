/**
 * Spreads SOL across the 3 funding wallets so each has enough for tx
 * fees + ATA creation. Master starts with all the SOL (only one the
 * Solana faucet airdropped to); funder-2 + funder-3 received USDC
 * directly from Circle but no SOL.
 *
 * Each funder needs ~0.3 SOL to:
 *  - create its USDC ATA (~0.002 SOL rent)
 *  - run a few hundred persona-funding txns (~0.000005 each)
 *
 * Run once after Circle USDC funding lands:
 *   pnpm tsx scripts/sol-pool-balance.ts
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  PublicKey,
} from "@solana/web3.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const TARGET_SOL = 0.3;

function load(path: string): Keypair {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), path), "utf8"),
  ) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const conn = new Connection(RPC_URL, "confirmed");
  const master = load(".test-master.json");
  const f2 = load(".test-funder-2.json");
  const f3 = load(".test-funder-3.json");

  for (const target of [f2, f3]) {
    const bal = (await conn.getBalance(target.publicKey)) / LAMPORTS_PER_SOL;
    if (bal >= TARGET_SOL) {
      console.log(
        `  ${target.publicKey.toBase58()}  already has ${bal.toFixed(4)} SOL ✓`,
      );
      continue;
    }
    const send = TARGET_SOL - bal;
    const lamports = Math.round(send * LAMPORTS_PER_SOL);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: master.publicKey,
        toPubkey: target.publicKey,
        lamports,
      }),
    );
    const sig = await conn.sendTransaction(tx, [master], {
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(sig, "confirmed");
    console.log(
      `  master → ${target.publicKey.toBase58()}  +${send.toFixed(4)} SOL  (${sig.slice(0, 8)}…)`,
    );
  }

  console.log("");
  console.log("Final balances:");
  for (const [name, kp] of [
    ["MASTER  ", master],
    ["FUNDER-2", f2],
    ["FUNDER-3", f3],
  ] as const) {
    const sol = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
    console.log(`  ${name}  ${kp.publicKey.toBase58()}  ${sol.toFixed(4)} SOL`);
  }
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
