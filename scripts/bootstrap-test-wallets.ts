/**
 * Generates the 3 persona burner wallets used by every cross-wallet test:
 *
 *   .test-wallet.json      → ALICE   (consumer)
 *   .test-merchant.json    → BOB     (merchant)
 *   .test-carol.json       → CAROL   (third member of group quorum)
 *
 * Each persona is funded to the per-persona target by pulling from the
 * 3 funding wallets (.test-master.json + .test-funder-2.json + .test-funder-3.json),
 * which collectively hold ≥ 5 SOL and ≥ 50 USDC after Circle / Solana faucets.
 *
 * Per-persona target:
 *   0.5 SOL  (rent + tx fees + ATA creation)
 *   10 USDC  (enough for ~30 send-flow tests at ≤0.30 USDC each)
 *
 * Idempotent: re-running this script tops up any persona that's below target.
 *
 * Run: pnpm tsx scripts/bootstrap-test-wallets.ts
 */
import "dotenv/config";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAccount,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const USDC_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

const TARGET_SOL = 0.5;
const TARGET_USDC = 10; // 10_000_000 micro-USDC

const personas = [
  { name: "ALICE", path: ".test-wallet.json" },
  { name: "BOB", path: ".test-merchant.json" },
  { name: "CAROL", path: ".test-carol.json" },
];

const funders = [
  { name: "MASTER", path: ".test-master.json" },
  { name: "FUNDER-2", path: ".test-funder-2.json" },
  { name: "FUNDER-3", path: ".test-funder-3.json" },
];

function loadOrGenerate(path: string): { kp: Keypair; created: boolean } {
  const full = resolve(process.cwd(), path);
  if (existsSync(full)) {
    const raw = JSON.parse(readFileSync(full, "utf8")) as number[];
    return { kp: Keypair.fromSecretKey(Uint8Array.from(raw)), created: false };
  }
  const kp = Keypair.generate();
  writeFileSync(full, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return { kp, created: true };
}

function load(path: string): Keypair {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), path), "utf8"),
  ) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function getSolBalance(conn: Connection, pk: PublicKey): Promise<number> {
  return (await conn.getBalance(pk)) / LAMPORTS_PER_SOL;
}

async function getUsdcBalance(
  conn: Connection,
  owner: PublicKey,
  payer: Keypair,
): Promise<{ amount: number; ata: PublicKey }> {
  try {
    const ata = await getOrCreateAssociatedTokenAccount(
      conn,
      payer,
      USDC_DEVNET,
      owner,
    );
    const acc = await getAccount(conn, ata.address);
    return { amount: Number(acc.amount) / 1_000_000, ata: ata.address };
  } catch {
    return { amount: 0, ata: PublicKey.default };
  }
}

async function pickFunderWithSol(
  conn: Connection,
  required: number,
): Promise<Keypair> {
  for (const f of funders) {
    const kp = load(f.path);
    const bal = await getSolBalance(conn, kp.publicKey);
    if (bal >= required + 0.01) return kp;
  }
  throw new Error(
    `No funder has ≥ ${required + 0.01} SOL. Top up via faucet.solana.com`,
  );
}

async function pickFunderWithUsdc(
  conn: Connection,
  required: number,
): Promise<{ kp: Keypair; ata: PublicKey }> {
  for (const f of funders) {
    const kp = load(f.path);
    const { amount, ata } = await getUsdcBalance(conn, kp.publicKey, kp);
    if (amount >= required) return { kp, ata };
  }
  throw new Error(
    `No funder has ≥ ${required} USDC. Top up via faucet.circle.com (20 USDC per wallet)`,
  );
}

async function main() {
  const conn = new Connection(RPC_URL, "confirmed");

  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  PERSONA WALLETS — bootstrap + top-up");
  console.log("════════════════════════════════════════════════════════════════");
  console.log("");

  for (const p of personas) {
    const { kp, created } = loadOrGenerate(p.path);
    console.log(
      `  ${p.name.padEnd(6)}  ${kp.publicKey.toBase58()}  ${created ? "[NEW]" : ""}`,
    );

    const sol = await getSolBalance(conn, kp.publicKey);
    if (sol < TARGET_SOL) {
      const need = TARGET_SOL - sol;
      const funder = await pickFunderWithSol(conn, need);
      const lamports = Math.round(need * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: funder.publicKey,
          toPubkey: kp.publicKey,
          lamports,
        }),
      );
      const sig = await conn.sendTransaction(tx, [funder], {
        preflightCommitment: "confirmed",
      });
      await conn.confirmTransaction(sig, "confirmed");
      console.log(
        `            +${need.toFixed(4)} SOL from ${funder.publicKey.toBase58().slice(0, 8)}…  (${sig.slice(0, 8)}…)`,
      );
    }

    const { amount: usdc } = await getUsdcBalance(conn, kp.publicKey, kp);
    if (usdc < TARGET_USDC) {
      const need = TARGET_USDC - usdc;
      const { kp: funderKp, ata: funderAta } = await pickFunderWithUsdc(
        conn,
        need,
      );
      const recipientAta = await getOrCreateAssociatedTokenAccount(
        conn,
        funderKp,
        USDC_DEVNET,
        kp.publicKey,
      );
      const tx = new Transaction().add(
        createTransferCheckedInstruction(
          funderAta,
          USDC_DEVNET,
          recipientAta.address,
          funderKp.publicKey,
          BigInt(Math.round(need * 1_000_000)),
          6,
        ),
      );
      const sig = await conn.sendTransaction(tx, [funderKp], {
        preflightCommitment: "confirmed",
      });
      await conn.confirmTransaction(sig, "confirmed");
      console.log(
        `            +${need.toFixed(2)} USDC from ${funderKp.publicKey.toBase58().slice(0, 8)}…  (${sig.slice(0, 8)}…)`,
      );
    }
  }

  console.log("");
  console.log("Final state:");
  for (const p of personas) {
    const kp = load(p.path);
    const sol = await getSolBalance(conn, kp.publicKey);
    const { amount } = await getUsdcBalance(conn, kp.publicKey, kp);
    const ok = sol >= TARGET_SOL && amount >= TARGET_USDC;
    console.log(
      `  ${p.name.padEnd(6)}  ${kp.publicKey.toBase58()}  ${sol.toFixed(4).padStart(8)} SOL · ${amount.toFixed(2).padStart(6)} USDC  ${ok ? "✓" : "✗"}`,
    );
  }
  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
