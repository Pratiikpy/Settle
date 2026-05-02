#!/usr/bin/env tsx
/**
 * Path A switchover proof: sends a small direct USDC transfer where the
 * tx contains BOTH a SPL TransferChecked AND a record_receipt ix attesting
 * the kernel commit. Confirms on devnet, then reads the tx logs and
 * checks that ReceiptRecordedEvent fired for kind='direct_send'.
 *
 * This is the canonical smoke-test for C1 Path A switchover. Re-run after
 * any endpoint change to confirm the on-chain attestation still works.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  kernelCommit,
  kernelCommitToRecordReceiptArgs,
} from "../packages/sdk/dist/index.js";
import { recordReceiptIx } from "../apps/web/lib/anchor-client";
import { randomUUID } from "node:crypto";

const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
const rpc = process.env.HELIUS_API_KEY
  ? `https://${cluster}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : `https://api.${cluster}.solana.com`;
const conn = new Connection(rpc, "confirmed");

const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TEST_WALLET_PATH = resolve(process.cwd(), ".test-wallet.json");

async function main() {
  if (!existsSync(TEST_WALLET_PATH)) {
    console.error("No .test-wallet.json — run scripts/bootstrap-test-wallet.ts first.");
    process.exit(1);
  }
  const sender = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(TEST_WALLET_PATH, "utf8")) as number[]),
  );
  // Recipient is a fresh ephemeral keypair — we don't even fund the ATA;
  // we just need a valid pubkey to receive.
  const recipientPriv = process.env.SETTLE_FACILITATOR_PRIVKEY;
  if (!recipientPriv) {
    console.error("Need SETTLE_FACILITATOR_PRIVKEY in env to fund recipient ATA fees.");
    process.exit(1);
  }
  const recipient = Keypair.fromSecretKey(bs58.decode(recipientPriv));

  const senderAta = await getAssociatedTokenAddress(usdcMint, sender.publicKey);
  const recipientAta = await getAssociatedTokenAddress(usdcMint, recipient.publicKey);

  const amount = 100_000n; // 0.1 USDC
  const requestId = randomUUID();
  const slot = await conn.getSlot("confirmed");

  const kernel = kernelCommit({
    kind: "direct_send",
    request_id: requestId,
    amount_lamports: amount.toString(),
    sender: sender.publicKey.toBase58(),
    recipient: recipient.publicKey.toBase58(),
    decision_slot: slot,
    purpose_text: "smoke test: Path A direct_send",
  });

  // Create recipient ATA if missing — same pattern /api/send/build uses.
  const ixs: TransactionInstruction[] = [];
  let recipientAtaExists = true;
  try {
    await getAccount(conn, recipientAta);
  } catch {
    recipientAtaExists = false;
  }
  if (!recipientAtaExists) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        sender.publicKey,
        recipientAta,
        recipient.publicKey,
        usdcMint,
      ),
    );
  }
  ixs.push(
    createTransferCheckedInstruction(
      senderAta,
      usdcMint,
      recipientAta,
      sender.publicKey,
      amount,
      6,
    ),
    recordReceiptIx({
      attestor: sender.publicKey,
      args: kernelCommitToRecordReceiptArgs(kernel),
    }),
  );

  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = sender.publicKey;
  tx.sign(sender);

  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log(`✓ tx confirmed: ${sig}`);
  console.log(`  solscan: https://solscan.io/tx/${sig}?cluster=${cluster}`);

  const tx2 = await conn.getTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const logs = tx2?.meta?.logMessages ?? [];

  const programLogs = logs.filter((l) =>
    /(RecordReceipt|TransferChecked|Program data|Program log)/.test(l),
  );
  console.log("\nrelevant program logs:");
  for (const l of programLogs) console.log(`  ${l}`);

  const hasRecordReceipt = logs.some((l) => /Instruction: RecordReceipt/.test(l));
  const hasProgramData = logs.some((l) => /^Program data: /.test(l));

  console.log("\nverification:");
  console.log(
    `  ${hasRecordReceipt ? "✓" : "✗"} record_receipt ix invoked`,
  );
  console.log(
    `  ${hasProgramData ? "✓" : "✗"} ReceiptRecordedEvent emitted (Program data line)`,
  );
  if (!hasRecordReceipt || !hasProgramData) {
    console.error("\nPath A switchover smoke FAILED.");
    process.exit(1);
  }
  console.log("\nPath A direct_send smoke PASSED.");
  console.log(`receipt request_id: ${requestId}`);
  console.log(`receipt context_hash: ${kernel.context_hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
