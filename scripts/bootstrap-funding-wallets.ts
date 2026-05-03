/**
 * Bootstraps 3 devnet funding wallets so we can pool past Circle's
 * 20-USDC-per-wallet faucet limit:
 *
 *   .test-master.json   (already exists — wallet 1)
 *   .test-funder-2.json (new — wallet 2)
 *   .test-funder-3.json (new — wallet 3)
 *
 * Each gets up to 20 USDC-dev from Circle. The autonomous test runner
 * pools all three when funding ALICE / BOB / CAROL personas.
 *
 * Run: pnpm tsx scripts/bootstrap-funding-wallets.ts
 */
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, getAccount } from "@solana/spl-token";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const USDC_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

const wallets = [
  { name: "MASTER  ", path: ".test-master.json" },
  { name: "FUNDER-2", path: ".test-funder-2.json" },
  { name: "FUNDER-3", path: ".test-funder-3.json" },
];

async function loadOrCreate(path: string): Promise<Keypair> {
  const full = resolve(process.cwd(), path);
  if (existsSync(full)) {
    const raw = JSON.parse(readFileSync(full, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  writeFileSync(full, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

async function balances(conn: Connection, kp: Keypair) {
  const lamports = await conn.getBalance(kp.publicKey);
  let usdc = 0;
  try {
    const ata = await getOrCreateAssociatedTokenAccount(
      conn,
      kp,
      USDC_DEVNET,
      kp.publicKey,
    );
    const acc = await getAccount(conn, ata.address);
    usdc = Number(acc.amount) / 1_000_000;
  } catch {
    /* ATA doesn't exist yet */
  }
  return { sol: lamports / LAMPORTS_PER_SOL, usdc };
}

async function main() {
  const conn = new Connection(RPC_URL, "confirmed");

  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  FUNDING WALLETS — autonomous test runner pools across all 3");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("");

  let totalSol = 0;
  let totalUsdc = 0;

  for (const w of wallets) {
    const kp = await loadOrCreate(w.path);
    const { sol, usdc } = await balances(conn, kp);
    totalSol += sol;
    totalUsdc += usdc;
    console.log(`  ${w.name}  (${w.path})`);
    console.log(`            ${kp.publicKey.toBase58()}`);
    console.log(
      `            ${sol.toFixed(4).padStart(8)} SOL · ${usdc.toFixed(2).padStart(6)} USDC`,
    );
    console.log("");
  }

  console.log("  ─────────────────────────────────────────────────────────────");
  console.log(
    `  TOTAL     ${totalSol.toFixed(4).padStart(8)} SOL · ${totalUsdc.toFixed(2).padStart(6)} USDC`,
  );
  console.log("");
  console.log("  Targets for a full autonomous run:");
  console.log("    • SOL  ≥ 5  total  →  " + (totalSol >= 5 ? "✓" : "✗ short by " + (5 - totalSol).toFixed(4)));
  console.log("    • USDC ≥ 50 total  →  " + (totalUsdc >= 50 ? "✓" : "✗ short by " + (50 - totalUsdc).toFixed(2)));
  console.log("");

  if (totalUsdc < 50) {
    console.log("  ⚠ Get more USDC-dev (Circle limit = 20 per wallet per day):");
    console.log("    https://faucet.circle.com/  →  Solana Devnet  →  send 20 to each pubkey above");
    console.log("");
  }
  if (totalSol < 5) {
    console.log("  ⚠ Get more SOL:");
    console.log("    https://faucet.solana.com/  →  paste any pubkey above");
    console.log("");
  }

  console.log("════════════════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
