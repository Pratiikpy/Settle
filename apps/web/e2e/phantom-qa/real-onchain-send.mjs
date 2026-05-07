#!/usr/bin/env node
/**
 * Real on-chain consumer-send driver — actually broadcasts a signed
 * SPL TransferChecked from id.json (B4cArR1M…) to a freshly-generated
 * recipient wallet, proving the core "send money" path works
 * end-to-end on devnet.
 *
 * No mocks, no Phantom theater. Real Ed25519 signing, real RPC,
 * real on-chain confirm.
 */

import { readFileSync } from "fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";

const ID_JSON = process.platform === "win32"
  ? "C:\\Users\\prate\\.config\\solana\\id.json"
  : "/mnt/c/Users/prate/.config/solana/id.json";
const RPC = clusterApiUrl("devnet");
const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const A = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(ID_JSON, "utf8"))));
const R = Keypair.generate();
console.log(`A (sender):    ${A.publicKey.toBase58()}`);
console.log(`R (recipient): ${R.publicKey.toBase58()}`);

const connection = new Connection(RPC, { commitment: "confirmed" });

// 1. Verify A has USDC + balance
const fromAta = await getAssociatedTokenAddress(USDC_MINT_DEVNET, A.publicKey);
const fromAcc = await getAccount(connection, fromAta);
const balanceAtomic = Number(fromAcc.amount);
const balanceUsdc = (balanceAtomic / 1e6).toFixed(2);
console.log(`A USDC balance: ${balanceUsdc} ($${balanceAtomic} atomic units)`);
if (balanceAtomic < 10_000) {
  console.error("FAIL: insufficient USDC for 0.01 send");
  process.exit(1);
}

// 2. Build TransferChecked tx
const toAta = await getAssociatedTokenAddress(USDC_MINT_DEVNET, R.publicKey);
const tx = new Transaction();

// Create recipient ATA (since R is fresh, no ATA exists)
tx.add(createAssociatedTokenAccountInstruction(A.publicKey, toAta, R.publicKey, USDC_MINT_DEVNET));

// SPL TransferChecked of 0.01 USDC = 10000 atomic
tx.add(
  createTransferCheckedInstruction(
    fromAta,
    USDC_MINT_DEVNET,
    toAta,
    A.publicKey,
    10_000n,
    6,
  ),
);

// 3. Sign + send
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
tx.recentBlockhash = blockhash;
tx.lastValidBlockHeight = lastValidBlockHeight;
tx.feePayer = A.publicKey;
tx.sign(A);

const sig = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,
  preflightCommitment: "confirmed",
});
console.log(`tx sig: ${sig}`);
console.log(`solscan: https://solscan.io/tx/${sig}?cluster=devnet`);

// 4. Confirm
console.log("waiting for confirmation…");
const confirm = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
if (confirm.value.err) {
  console.error("FAIL: tx rejected:", confirm.value.err);
  process.exit(1);
}
console.log("CONFIRMED");

// 5. Verify recipient ATA balance changed
const toAcc = await getAccount(connection, toAta);
const recvAtomic = Number(toAcc.amount);
console.log(`R received: ${(recvAtomic / 1e6).toFixed(6)} USDC ($${recvAtomic} atomic)`);
if (recvAtomic !== 10_000) {
  console.error(`FAIL: expected 10000 atomic, got ${recvAtomic}`);
  process.exit(1);
}

// 6. Verify sender balance decremented
const fromAccAfter = await getAccount(connection, fromAta);
const balanceAtomicAfter = Number(fromAccAfter.amount);
const delta = balanceAtomic - balanceAtomicAfter;
console.log(`A balance delta: -${(delta / 1e6).toFixed(6)} USDC ($${delta} atomic)`);
if (delta !== 10_000) {
  console.error(`FAIL: expected delta 10000, got ${delta}`);
  process.exit(1);
}

console.log("\nPASS — real on-chain consumer-send proven end-to-end");
console.log(`  sig:     ${sig}`);
console.log(`  amount:  0.01 USDC`);
console.log(`  sender:  ${A.publicKey.toBase58()} (${balanceUsdc} → ${(balanceAtomicAfter / 1e6).toFixed(2)} USDC)`);
console.log(`  recv:    ${R.publicKey.toBase58()} (0 → 0.01 USDC)`);
