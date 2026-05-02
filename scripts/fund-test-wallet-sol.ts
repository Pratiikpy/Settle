#!/usr/bin/env tsx
/**
 * Fallback when devnet faucet is rate-limited: transfer SOL from
 * FACILITATOR → TEST_WALLET. Idempotent — checks balance first.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
const heliusKey = process.env.HELIUS_API_KEY;
const rpc = heliusKey
  ? `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`
  : `https://api.${cluster}.solana.com`;
const conn = new Connection(rpc, "confirmed");

const TARGET_SOL = 0.5;
const FACILITATOR_PRIVKEY = process.env.SETTLE_FACILITATOR_PRIVKEY;
if (!FACILITATOR_PRIVKEY) {
  console.error("SETTLE_FACILITATOR_PRIVKEY not set");
  process.exit(1);
}

const WALLET_PATH = resolve(process.cwd(), ".test-wallet.json");
if (!existsSync(WALLET_PATH)) {
  console.error("Run scripts/bootstrap-test-wallet.ts first to generate .test-wallet.json");
  process.exit(1);
}

async function main() {
  const facilitator = Keypair.fromSecretKey(bs58.decode(FACILITATOR_PRIVKEY!));
  const testWallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(WALLET_PATH, "utf8")) as number[]),
  );
  const test = testWallet.publicKey;

  const before = await conn.getBalance(test, "confirmed");
  console.log(`Test wallet ${test.toBase58()} now has ${(before / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  if (before >= TARGET_SOL * LAMPORTS_PER_SOL) {
    console.log(`Already at or above ${TARGET_SOL} SOL — no transfer needed.`);
    return;
  }
  const need = TARGET_SOL * LAMPORTS_PER_SOL - before;

  const facBefore = await conn.getBalance(facilitator.publicKey, "confirmed");
  console.log(
    `Facilitator ${facilitator.publicKey.toBase58()} has ${(facBefore / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
  );
  if (facBefore < need + 0.01 * LAMPORTS_PER_SOL) {
    console.error(
      `Facilitator has insufficient SOL to transfer ${(need / LAMPORTS_PER_SOL).toFixed(3)}. ` +
        `Faucet the facilitator first or wait for devnet faucet rate-limit reset.`,
    );
    process.exit(1);
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: facilitator.publicKey,
      toPubkey: test,
      lamports: Math.floor(need),
    }),
  );
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = facilitator.publicKey;
  tx.sign(facilitator);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  console.log(`Sent: ${sig}`);
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  const after = await conn.getBalance(test, "confirmed");
  console.log(
    `Confirmed. Test wallet now has ${(after / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
  );
  console.log(`Solscan: https://solscan.io/tx/${sig}?cluster=${cluster}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
