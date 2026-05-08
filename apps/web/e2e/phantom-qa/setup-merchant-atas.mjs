#!/usr/bin/env node
/**
 * Pre-create USDC ATAs for the 3 demo merchant pubkeys so spend_via_pact
 * doesn't fail with AccountNotInitialized (Anchor error 3012). Idempotent —
 * any ATA that already exists is skipped.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const ID_JSON = resolve(homedir(), ".config", "solana", "id.json");
const deployer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(ID_JSON, "utf8"))),
);

const MERCHANTS = [
  ["arxiv-fetch", "5xyG5PpFZYwVsR5mzec1Yg4HbyqqacUSPvW9oGeUDFnm"],
  ["translate", "ARyNYt1pavsDYSLFqUQEHreFY5df4LsWHxD27uXTnRrd"],
  ["summarize", "2MWU5oGWseQpLzCqauh5zU1HewyiEgMUy1q3MirWVSZE"],
];

const conn = new Connection(RPC, { commitment: "confirmed" });
console.log(`Funder: ${deployer.publicKey.toBase58()}`);

for (const [slug, pkStr] of MERCHANTS) {
  const owner = new PublicKey(pkStr);
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner);
  try {
    await getAccount(conn, ata);
    console.log(`✓ ${slug} ATA already exists: ${ata.toBase58()}`);
    continue;
  } catch {
    /* ATA missing — create */
  }

  const ix = createAssociatedTokenAccountInstruction(
    deployer.publicKey,
    ata,
    owner,
    USDC_MINT,
  );
  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = deployer.publicKey;
  tx.sign(deployer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  console.log(`✓ ${slug} ATA created: ${ata.toBase58()} via ${sig}`);
}
console.log("done.");
