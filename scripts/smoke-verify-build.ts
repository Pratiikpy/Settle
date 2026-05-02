#!/usr/bin/env tsx
/**
 * Re-runs the verify-build logic locally so we can confirm the on-chain
 * hash matches the committed build-info.json without booting the dev
 * server.
 */
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
const rpc = process.env.HELIUS_API_KEY
  ? `https://${cluster}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
const conn = new Connection(rpc, "confirmed");

const PROGRAM_ID = new PublicKey(
  process.env.SETTLE_PROGRAM_ID ??
    "HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD",
);

interface BuildInfo {
  sha256: string;
  size_bytes: number;
  commit: string;
  built_at: string;
}

async function main() {
  const buildInfo = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "programs/settle-agent-card/target/deploy/build-info.json",
      ),
      "utf8",
    ),
  ) as BuildInfo;

  console.log(`Program:     ${PROGRAM_ID.toBase58()}`);
  console.log(`Cluster:     ${cluster}`);
  console.log(`Local hash:  ${buildInfo.sha256}`);
  console.log(`Local size:  ${buildInfo.size_bytes} bytes`);
  console.log(`Commit:      ${buildInfo.commit}`);
  console.log();

  const programInfo = await conn.getAccountInfo(PROGRAM_ID, "confirmed");
  if (!programInfo) throw new Error("program account not found on-chain");

  const programBuf = programInfo.data;
  const programTag = programBuf.readUInt32LE(0);
  if (programTag !== 2) {
    throw new Error(`expected Program tag 2, got ${programTag}`);
  }
  const programDataAddress = new PublicKey(programBuf.subarray(4, 4 + 32));
  console.log(`ProgramData: ${programDataAddress.toBase58()}`);

  const pdInfo = await conn.getAccountInfo(programDataAddress, "confirmed");
  if (!pdInfo) throw new Error("program data account not found");
  const pd = pdInfo.data;

  const optionTag = pd.readUInt8(12);
  const headerLen = optionTag === 1 ? 13 + 32 : 13;
  const code = pd.subarray(headerLen);
  console.log(`Raw bytes:   ${code.length}`);

  const trimmed = code.subarray(0, buildInfo.size_bytes);
  const hash = createHash("sha256").update(trimmed).digest("hex");
  console.log(`On-chain hash: ${hash}`);

  console.log();
  if (hash === buildInfo.sha256) {
    console.log("✓ VERIFIED — on-chain bytecode matches committed build-info.json");
  } else {
    console.log("✗ MISMATCH");
    console.log(`  expected: ${buildInfo.sha256}`);
    console.log(`  actual:   ${hash}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
