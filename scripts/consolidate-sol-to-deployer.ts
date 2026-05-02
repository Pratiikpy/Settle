#!/usr/bin/env tsx
/**
 * One-shot helper: consolidate SOL from operator wallets into the deployer
 * so we can pay for the program buffer rent on a v0.4 upgrade.
 *
 * Buffer rent for the 451672-byte binary ≈ 3.14 SOL upfront (refunded on
 * close). Deployer alone has ~1.87 SOL on devnet at the time of writing,
 * so we top it up from FACILITATOR + BADGE_AUTHORITY + ZK_RECEIPT_AUTHORITY,
 * leaving each with a small float for tx fees.
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

const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
const rpc = process.env.HELIUS_API_KEY
  ? `https://${cluster}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : `https://api.${cluster}.solana.com`;
const conn = new Connection(rpc, "confirmed");

// Each donor keeps `KEEP_SOL` lamports for own future tx fees.
const KEEP_SOL = 0.05;
const DEPLOYER_PUBKEY = process.env.SETTLE_DEPLOYER_PUBKEY;
if (!DEPLOYER_PUBKEY) throw new Error("SETTLE_DEPLOYER_PUBKEY env not set");
const target = new PublicKey(DEPLOYER_PUBKEY);

const donors = [
  { name: "FACILITATOR", privkey: process.env.SETTLE_FACILITATOR_PRIVKEY },
  { name: "BADGE_AUTHORITY", privkey: process.env.SETTLE_BADGE_AUTHORITY_PRIVKEY },
  { name: "ZK_RECEIPT_AUTHORITY", privkey: process.env.SETTLE_ZK_RECEIPT_AUTHORITY_PRIVKEY },
];

async function main() {
  console.log(`Target: ${target.toBase58()} (deployer)`);
  const before = await conn.getBalance(target, "confirmed");
  console.log(`  before: ${(before / LAMPORTS_PER_SOL).toFixed(3)} SOL\n`);

  for (const d of donors) {
    if (!d.privkey) {
      console.log(`${d.name.padEnd(22)} <env not set, skip>`);
      continue;
    }
    const kp = Keypair.fromSecretKey(bs58.decode(d.privkey));
    const balance = await conn.getBalance(kp.publicKey, "confirmed");
    const keep = Math.floor(KEEP_SOL * LAMPORTS_PER_SOL);
    const fee = 5000;
    const sendLamports = balance - keep - fee;
    if (sendLamports <= 0) {
      console.log(
        `${d.name.padEnd(22)} ${kp.publicKey.toBase58().slice(0, 6)}…  ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL — too low, skip`,
      );
      continue;
    }
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: target, lamports: sendLamports }),
    );
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = kp.publicKey;
    tx.sign(kp);
    try {
      const sig = await conn.sendRawTransaction(tx.serialize());
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      console.log(
        `${d.name.padEnd(22)} ${kp.publicKey.toBase58().slice(0, 6)}…  -${(sendLamports / LAMPORTS_PER_SOL).toFixed(3)} SOL  ${sig.slice(0, 8)}…`,
      );
    } catch (e) {
      console.log(`${d.name.padEnd(22)} FAILED: ${(e as Error).message}`);
    }
  }

  const after = await conn.getBalance(target, "confirmed");
  console.log(`\nafter: ${(after / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  console.log(`net:   +${((after - before) / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
