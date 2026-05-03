/**
 * Bootstraps the autonomous test-runner's master wallet.
 *
 * Generates ONE devnet keypair if `.test-master.json` doesn't exist,
 * persists it (gitignored), and prints the pubkey + funding instructions.
 *
 * The autonomous test runner uses this master wallet as the funding
 * source for the 3 test personas (ALICE / BOB / CAROL). Whenever a
 * persona runs low, the runner pulls SOL + USDC-dev from master and
 * fans out via SPL transfer.
 *
 * Run: pnpm tsx scripts/bootstrap-master-wallet.ts
 */
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, getAccount } from "@solana/spl-token";
import bs58 from "bs58";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const MASTER_PATH = resolve(process.cwd(), ".test-master.json");
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
// Devnet USDC mint (Circle-issued).
const USDC_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

async function main() {
  let kp: Keypair;
  if (existsSync(MASTER_PATH)) {
    const raw = JSON.parse(readFileSync(MASTER_PATH, "utf8")) as number[];
    kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    console.log("✓ Master wallet already exists.");
  } else {
    kp = Keypair.generate();
    writeFileSync(MASTER_PATH, JSON.stringify(Array.from(kp.secretKey)), {
      mode: 0o600,
    });
    console.log("✓ Master wallet generated and saved to .test-master.json (gitignored).");
  }

  const conn = new Connection(RPC_URL, "confirmed");
  const balLamports = await conn.getBalance(kp.publicKey);
  const balSol = balLamports / LAMPORTS_PER_SOL;

  let usdcBal = 0;
  try {
    const ata = await getOrCreateAssociatedTokenAccount(
      conn,
      kp,
      USDC_DEVNET,
      kp.publicKey,
    );
    const acc = await getAccount(conn, ata.address);
    usdcBal = Number(acc.amount) / 1_000_000;
  } catch {
    /* ATA doesn't exist yet — needs funding */
  }

  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  MASTER WALLET — fund this for autonomous test runs");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("");
  console.log("  Pubkey:");
  console.log("    " + kp.publicKey.toBase58());
  console.log("");
  console.log("  Devnet SOL balance:  " + balSol.toFixed(4) + " SOL");
  console.log("  Devnet USDC balance: " + usdcBal.toFixed(2) + " USDC");
  console.log("");
  if (balSol < 5) {
    console.log("  ⚠ Needs ≥ 5 SOL. Send via:");
    console.log("    https://faucet.solana.com/  →  paste pubkey above");
    console.log("    OR `solana airdrop 5 " + kp.publicKey.toBase58() + " --url devnet`");
  }
  if (usdcBal < 50) {
    console.log("  ⚠ Needs ≥ 50 USDC-dev. Get via:");
    console.log("    https://faucet.circle.com/  →  paste pubkey above, pick Solana Devnet");
  }
  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
