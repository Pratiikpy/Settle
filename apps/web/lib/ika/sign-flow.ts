// Settle x Ika sidetrack — sign-flow orchestrator.
//
// Composes the cross-chain sign demo end-to-end (Sepolia happy path):
//
//   1. Build an unsigned EIP-1559 tx with viem-free RLP encoding.
//   2. keccak256 → 32-byte `message_digest`.
//   3. Caller submits the `request_crosschain_sign` Solana ix (built via
//      `build-ix.ts`) which CPIs `approve_message` on the Ika dWallet
//      program.
//   4. Poll `MessageApproval` PDA on Solana for the signature.
//   5. Reconstruct the broadcast-ready signed tx with `buildSignedSepoliaTx`.
//   6. Caller broadcasts on Sepolia (HTTP POST to Alchemy/Infura).
//   7. Caller submits `record_signed_outcome` with the resulting tx hash.
//
// We intentionally split the orchestration into PURE step functions instead
// of one big async — both the API route and the CLI E2E script need to
// reuse pieces, and the steps that touch the network (Solana RPC, Ika gRPC,
// Sepolia RPC) need to be testable in isolation.

import { Connection, PublicKey } from "@solana/web3.js";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  buildSignedSepoliaTx,
  buildUnsignedSepoliaTxDigest,
  bytesToHex,
  evmAddressBytes,
  type UnsignedSepoliaTx,
} from "./sepolia-tx";
import {
  findCrosschainCardPda,
  findCrosschainReceiptPda,
  findCpiAuthorityPda,
  findMessageApprovalPda,
} from "./find-pda";
import {
  pollUntilSigned,
  type ApprovalReadResult,
} from "./poll-approval";

/** High-level inputs from the user / API caller. */
export interface SignFlowInputs {
  /** Solana wallet that owns the cross-chain card (the card's authority). */
  authority: PublicKey;
  /** Pre-DKG'd Ika dWallet account. Authority pre-transferred to our CPI authority PDA. */
  dwallet: PublicKey;
  /** Compressed/uncompressed dWallet public key bytes (33 secp / 32 ed25519). */
  dwalletPubkey: Uint8Array;
  /** Card label hash — same value passed to `init_crosschain_card`. */
  labelHash: Uint8Array;
  /** UUID (16 bytes) — uniquely identifies this sign request and its receipt PDA. */
  requestId: Uint8Array;
  /** Sepolia tx fields (built off-chain by the caller, e.g. via Alchemy nonce + fee suggestions). */
  unsignedTx: UnsignedSepoliaTx;
  /** Curve discriminator (0 = Secp256k1 for EVM). */
  curve: number;
  /** Signature scheme u16 (0 = EcdsaKeccak256 for EVM). */
  signatureScheme: number;
  /**
   * Caller-supplied `userPubkey` field for the Ika `approve_message` ix.
   * For EVM signing this is typically the dWallet pubkey itself.
   */
  userPubkey: Uint8Array;
}

/**
 * Step 1 — compute the keccak256 signing-message digest for the unsigned tx.
 * Pure; safe to call from any context.
 */
export function computeSigningDigest(unsigned: UnsignedSepoliaTx): {
  payload: Uint8Array;
  digest: Uint8Array;
} {
  return buildUnsignedSepoliaTxDigest(unsigned);
}

/**
 * Step 2 — derive every PDA the on-chain ix needs. Pure (modulo PDA seed
 * derivation which is deterministic).
 */
export interface DerivedPdas {
  card: { pubkey: PublicKey; bump: number };
  receipt: { pubkey: PublicKey; bump: number };
  cpiAuthority: { pubkey: PublicKey; bump: number };
  messageApproval: { pubkey: PublicKey; bump: number };
}

export function derivePdasForSign(
  inputs: Pick<SignFlowInputs, "authority" | "labelHash" | "requestId" | "curve" | "dwalletPubkey" | "signatureScheme"> & {
    messageDigest: Uint8Array;
  },
): DerivedPdas {
  const [card, cardBump] = findCrosschainCardPda(inputs.authority, inputs.labelHash);
  const [receipt, receiptBump] = findCrosschainReceiptPda(card, inputs.requestId);
  const [cpiAuthority, cpiAuthorityBump] = findCpiAuthorityPda();
  const [messageApproval, messageApprovalBump] = findMessageApprovalPda({
    curve: inputs.curve,
    dwalletPublicKey: inputs.dwalletPubkey,
    signatureScheme: inputs.signatureScheme,
    messageDigest: inputs.messageDigest,
    metadataDigest: null,
  });
  return {
    card: { pubkey: card, bump: cardBump },
    receipt: { pubkey: receipt, bump: receiptBump },
    cpiAuthority: { pubkey: cpiAuthority, bump: cpiAuthorityBump },
    messageApproval: { pubkey: messageApproval, bump: messageApprovalBump },
  };
}

/**
 * Step 3 — poll the `MessageApproval` PDA for the resulting signature.
 * Wraps `pollUntilSigned` for one-shot use after `request_crosschain_sign`
 * has landed.
 */
export async function awaitSignature(
  connection: Connection,
  messageApproval: PublicKey,
  opts?: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal },
): Promise<ApprovalReadResult> {
  return pollUntilSigned(connection, messageApproval, opts);
}

/**
 * Step 4 — once the signature is in hand, reconstruct the broadcast-ready tx.
 *
 * EVM signatures are 65 bytes: r(32) || s(32) || v(1). For dWallet sigs the
 * v byte is the recovery id (0 or 1) — pre-EIP-1559 wrapping. Some dWallet
 * builds may return 64 bytes (r||s only) and require the caller to recover v
 * via address comparison; we accept both and synthesize y_parity from the
 * 65-byte form, defaulting to 0 if absent.
 */
export function reconstructBroadcastTx(args: {
  unsigned: UnsignedSepoliaTx;
  signature: Uint8Array;
}): { rawTx: Uint8Array; rawHex: string } {
  const { unsigned, signature } = args;
  if (signature.length !== 64 && signature.length !== 65) {
    throw new Error(`unexpected signature length ${signature.length}; expected 64 or 65`);
  }
  const rs = signature.subarray(0, 64);
  const v = signature.length === 65 ? signature[64]! : 0;
  const yParity: 0 | 1 = (v % 2) as 0 | 1;
  const rawTx = buildSignedSepoliaTx({ tx: unsigned, signatureRS: rs, yParity });
  return { rawTx, rawHex: `0x${bytesToHex(rawTx)}` };
}

/**
 * Step 5 — broadcast to Sepolia via JSON-RPC. Returns the resulting tx hash
 * (32 bytes).
 *
 * The `rpcUrl` should be a private Alchemy / Infura endpoint or PublicNode.
 * The Sepolia public RPC may rate-limit during demo; supply a private one.
 */
export async function broadcastSepolia(
  rpcUrl: string,
  rawHex: string,
): Promise<{ txHash: Uint8Array; txHashHex: string }> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendRawTransaction",
      params: [rawHex],
    }),
  });
  if (!res.ok) {
    throw new Error(`sepolia RPC ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) {
    throw new Error(`sepolia RPC error: ${json.error.message}`);
  }
  if (!json.result || !/^0x[0-9a-f]{64}$/i.test(json.result)) {
    throw new Error(`sepolia RPC returned malformed tx hash: ${json.result}`);
  }
  const hex = json.result.slice(2).toLowerCase();
  const txHash = new Uint8Array(32);
  for (let i = 0; i < 32; i++) txHash[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return { txHash, txHashHex: hex };
}

/** Convenience: keccak256 wrapper to keep dependencies localised. */
export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

/** Convenience: 20-byte EVM address from `0x...` string. */
export const evmAddress = evmAddressBytes;
