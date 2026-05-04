// Settle x Ika sidetrack — CLI E2E roundtrip.
//
// Exercises the full sign flow end-to-end against Solana devnet + Sepolia:
//
//   1. Build an unsigned EIP-1559 Sepolia tx.
//   2. Compute keccak256 message digest.
//   3. Submit `request_crosschain_sign` Solana ix on devnet.
//   4. Poll MessageApproval PDA for the resulting signature.
//   5. Reconstruct the broadcast-ready signed tx.
//   6. Broadcast on Sepolia.
//   7. Submit `record_signed_outcome` on Solana with the resulting tx hash.
//   8. Print Solana receipt link + Sepolia tx hash + Etherscan URL.
//
// Usage:
//
//   pnpm tsx scripts/ika-roundtrip.ts --allow
//   pnpm tsx scripts/ika-roundtrip.ts --deny
//
// Required env:
//   SEPOLIA_RPC_URL              private Sepolia RPC (Alchemy/Infura/PublicNode)
//   IKA_TEST_DWALLET             pre-DKG'd dWallet account pubkey (base58)
//   IKA_TEST_DWALLET_PUBKEY_HEX  the dWallet's compressed secp pubkey (66 hex chars)
//   IKA_TEST_LABEL_HASH          32-byte hex of the card label hash used at init
//   IKA_TEST_RECIPIENT_0X        Sepolia recipient address
//
// Phase D status: SCAFFOLD. The script structure is real and the helpers it
// composes are real. To run end-to-end you need a pre-existing dWallet — DKG
// creation lives in Phase E (UI flow) and is also exposed by Ika's reference
// e2e tools. Until then this script can be run with `--dry-run` to print the
// derived PDAs + computed digest for any well-formed tx.

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildRequestCrosschainSignIxData,
  buildRecordSignedOutcomeIxData,
} from "../apps/web/lib/ika/build-ix";
import {
  computeSigningDigest,
  derivePdasForSign,
  reconstructBroadcastTx,
  awaitSignature,
  broadcastSepolia,
} from "../apps/web/lib/ika/sign-flow";
import {
  IKA_DWALLET_PROGRAM_ID,
  SETTLE_DWALLET_ROUTER_PROGRAM_ID,
} from "../apps/web/lib/ika/program-ids";
import { evmAddressBytes, hexToBytes } from "../apps/web/lib/ika/sepolia-tx";

const ROUTER = new PublicKey(SETTLE_DWALLET_ROUTER_PROGRAM_ID);
const IKA = new PublicKey(IKA_DWALLET_PROGRAM_ID);

interface CliFlags {
  mode: "allow" | "deny" | "dry-run";
}

function parseFlags(argv: string[]): CliFlags {
  if (argv.includes("--deny")) return { mode: "deny" };
  if (argv.includes("--dry-run")) return { mode: "dry-run" };
  return { mode: "allow" };
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`missing env: ${name}`);
  return v;
}

function loadDeployerKeypair(): Keypair {
  // Default to the same keypair the Solana CLI uses.
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  const path = process.env.SOLANA_KEYPAIR_PATH ?? join(home, ".config/solana/id.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function uuidV4Bytes(): Uint8Array {
  // Minimal UUID v4 producer for the request_id seed.
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 1
  return b;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const isDry = flags.mode === "dry-run";
  console.log(`[ika-roundtrip] mode = ${flags.mode}`);

  const sepoliaRpc = isDry ? "" : envOrThrow("SEPOLIA_RPC_URL");
  const dwallet = isDry
    ? PublicKey.default
    : new PublicKey(envOrThrow("IKA_TEST_DWALLET"));
  const dwalletPubkeyHex = isDry
    ? "00".repeat(33)
    : envOrThrow("IKA_TEST_DWALLET_PUBKEY_HEX");
  const labelHashHex = isDry ? "00".repeat(32) : envOrThrow("IKA_TEST_LABEL_HASH");
  const recipientHex = isDry
    ? "0x0000000000000000000000000000000000000000"
    : envOrThrow("IKA_TEST_RECIPIENT_0X");

  const dwalletPubkey = hexToBytes(dwalletPubkeyHex);
  const labelHash = hexToBytes(labelHashHex);
  const recipientBytes = evmAddressBytes(recipientHex);

  const deployer = isDry ? Keypair.generate() : loadDeployerKeypair();
  const authority = deployer.publicKey;
  const requestId = uuidV4Bytes();

  // Build an unsigned tx. For DENY runs, set amount > per_call_max so the
  // policy gate denies; for ALLOW runs, a small transfer.
  const amountWei = flags.mode === "deny" ? 200_000_000_000_000_000n : 5_000_000_000_000_000n; // 0.2 / 0.005 ETH
  const unsigned = {
    chainId: 11_155_111n,
    nonce: 0n, // caller will need real nonce at run time; 0 is a placeholder for dry-run
    maxPriorityFeePerGas: 1_500_000_000n, // 1.5 gwei
    maxFeePerGas: 30_000_000_000n, // 30 gwei
    gasLimit: 21_000n,
    to: recipientBytes,
    value: amountWei,
    data: new Uint8Array(),
    accessList: [] as const,
  };

  const { digest } = computeSigningDigest(unsigned);
  console.log(`[ika-roundtrip] message_digest (keccak256) = 0x${Buffer.from(digest).toString("hex")}`);

  const pdas = derivePdasForSign({
    authority,
    labelHash,
    requestId,
    curve: 0, // Secp256k1
    dwalletPubkey,
    signatureScheme: 0, // EcdsaKeccak256
    messageDigest: digest,
  });
  console.log(`[ika-roundtrip] derived PDAs:`);
  console.log(`  card             = ${pdas.card.pubkey.toBase58()}`);
  console.log(`  receipt          = ${pdas.receipt.pubkey.toBase58()}`);
  console.log(`  cpi_authority    = ${pdas.cpiAuthority.pubkey.toBase58()}`);
  console.log(`  message_approval = ${pdas.messageApproval.pubkey.toBase58()}`);

  if (isDry) {
    console.log("[ika-roundtrip] dry-run complete — PDAs derived, digest computed. Exiting.");
    return;
  }

  // Build the request_crosschain_sign ix. Hash chain fields are computed
  // by the SDK kernel in the real demo; here we pass zeros so the script
  // exercises the network path. Production callers MUST compute the real
  // hash chain via `kernelCommit` so receipts are verifiable.
  const ZERO32 = new Uint8Array(32);
  const ixData = buildRequestCrosschainSignIxData({
    requestId,
    messageDigest: digest,
    messageMetadataDigest: ZERO32,
    userPubkey: dwalletPubkey.length === 33 ? dwalletPubkey.subarray(1) : dwalletPubkey,
    signatureScheme: 0,
    messageApprovalBump: pdas.messageApproval.bump,
    amountMinor: amountWei,
    chainNamespace: padTo16("eip155"),
    chainReference: padTo32("11155111"),
    recipientKind: 1, // evm_address
    recipient: padBytesTo32(recipientBytes),
    assetKind: 0, // native
    asset: ZERO32,
    capabilityHash: ZERO32,
    receiptHash: ZERO32,
    reasonHash: ZERO32,
    policySnapshotHash: ZERO32,
    purposeHash: ZERO32,
  });

  const connection = new Connection(envOrThrow("SOLANA_RPC_URL"), "confirmed");
  const signIx = new TransactionInstruction({
    programId: ROUTER,
    keys: [
      { pubkey: pdas.card.pubkey, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: pdas.receipt.pubkey, isSigner: false, isWritable: true },
      // Ika CPI accounts
      { pubkey: PublicKey.findProgramAddressSync([Buffer.from("dwallet_coordinator")], IKA)[0], isSigner: false, isWritable: false },
      { pubkey: pdas.messageApproval.pubkey, isSigner: false, isWritable: true },
      { pubkey: dwallet, isSigner: false, isWritable: false },
      { pubkey: pdas.cpiAuthority.pubkey, isSigner: false, isWritable: false },
      { pubkey: IKA, isSigner: false, isWritable: false },
      { pubkey: ROUTER, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true }, // payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixData,
  });

  const tx = new Transaction().add(signIx);
  tx.feePayer = authority;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(deployer);

  console.log("[ika-roundtrip] sending request_crosschain_sign...");
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  console.log(`[ika-roundtrip] request_crosschain_sign tx: ${sig}`);
  await connection.confirmTransaction(sig, "confirmed");

  if (flags.mode === "deny") {
    console.log("[ika-roundtrip] DENY path — receipt sealed; no MessageApproval expected.");
    console.log(`[ika-roundtrip] receipt PDA: ${pdas.receipt.pubkey.toBase58()}`);
    return;
  }

  console.log("[ika-roundtrip] polling MessageApproval PDA for signature...");
  const approval = await awaitSignature(connection, pdas.messageApproval.pubkey, {
    timeoutMs: 30_000,
    intervalMs: 1_000,
  });
  if (approval.status !== "signed" || !approval.signature) {
    throw new Error(`signature did not arrive within timeout (status=${approval.status})`);
  }
  console.log(`[ika-roundtrip] signature obtained (${approval.signature.length} bytes)`);

  const { rawHex } = reconstructBroadcastTx({ unsigned, signature: approval.signature });
  console.log("[ika-roundtrip] broadcasting on Sepolia...");
  const { txHashHex } = await broadcastSepolia(sepoliaRpc, rawHex);
  console.log(`[ika-roundtrip] Sepolia tx hash: 0x${txHashHex}`);
  console.log(`[ika-roundtrip] Etherscan: https://sepolia.etherscan.io/tx/0x${txHashHex}`);

  // record_signed_outcome
  const recordIxData = buildRecordSignedOutcomeIxData(hexToBytes(txHashHex));
  const recordIx = new TransactionInstruction({
    programId: ROUTER,
    keys: [
      { pubkey: pdas.card.pubkey, isSigner: false, isWritable: false },
      { pubkey: pdas.receipt.pubkey, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: recordIxData,
  });
  const recordTx = new Transaction().add(recordIx);
  recordTx.feePayer = authority;
  recordTx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  recordTx.sign(deployer);
  const recordSig = await connection.sendRawTransaction(recordTx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(recordSig, "confirmed");
  console.log(`[ika-roundtrip] record_signed_outcome tx: ${recordSig}`);
  console.log("[ika-roundtrip] DONE.");
}

function padTo16(s: string): Uint8Array {
  const b = new Uint8Array(16);
  const src = new TextEncoder().encode(s);
  if (src.length > 16) throw new Error(`string too long for 16-byte slot: ${s}`);
  b.set(src, 0);
  return b;
}
function padTo32(s: string): Uint8Array {
  const b = new Uint8Array(32);
  const src = new TextEncoder().encode(s);
  if (src.length > 32) throw new Error(`string too long for 32-byte slot: ${s}`);
  b.set(src, 0);
  return b;
}
function padBytesTo32(src: Uint8Array): Uint8Array {
  if (src.length > 32) throw new Error("recipient too long");
  const b = new Uint8Array(32);
  // Left-pad: shorter recipients align to the end (typical EVM convention).
  b.set(src, 32 - src.length);
  return b;
}

main().catch((err) => {
  console.error("[ika-roundtrip] FAILED:", err);
  process.exit(1);
});
