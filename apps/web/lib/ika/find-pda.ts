// Settle x Ika sidetrack — PDA derivation helpers.
//
// All PDAs the cross-chain flow needs to derive client-side. The on-chain
// program seeds are the source of truth — these helpers MUST match
// `programs-ika/settle-dwallet-router/src/state.rs` and
// `programs-ika/settle-dwallet-router/src/lib.rs` exactly.

import { PublicKey } from "@solana/web3.js";
import {
  IKA_DWALLET_PROGRAM_ID,
  SETTLE_DWALLET_ROUTER_PROGRAM_ID,
} from "./program-ids";

const ROUTER = new PublicKey(SETTLE_DWALLET_ROUTER_PROGRAM_ID);
const IKA = new PublicKey(IKA_DWALLET_PROGRAM_ID);

const CC_CARD_SEED = Buffer.from("crosschain-card");
const CC_RECEIPT_SEED = Buffer.from("crosschain-receipt");
const IKA_CPI_AUTHORITY_SEED = Buffer.from("__ika_cpi_authority");

/**
 * `CrosschainCard` PDA. Seeds: [b"crosschain-card", authority, label_hash].
 * Source: `programs-ika/settle-dwallet-router/src/state.rs::CrosschainCard::SEED_PREFIX`.
 */
export function findCrosschainCardPda(
  authority: PublicKey,
  labelHash: Uint8Array,
): [PublicKey, number] {
  if (labelHash.length !== 32)
    throw new Error(`labelHash must be 32 bytes, got ${labelHash.length}`);
  return PublicKey.findProgramAddressSync(
    [CC_CARD_SEED, authority.toBuffer(), Buffer.from(labelHash)],
    ROUTER,
  );
}

/**
 * `CrosschainReceipt` PDA. Seeds: [b"crosschain-receipt", card, request_id].
 * Source: `programs-ika/settle-dwallet-router/src/state.rs::CrosschainReceipt::SEED_PREFIX`.
 */
export function findCrosschainReceiptPda(
  card: PublicKey,
  requestId: Uint8Array,
): [PublicKey, number] {
  if (requestId.length !== 16)
    throw new Error(`requestId must be 16 bytes (UUID), got ${requestId.length}`);
  return PublicKey.findProgramAddressSync(
    [CC_RECEIPT_SEED, card.toBuffer(), Buffer.from(requestId)],
    ROUTER,
  );
}

/**
 * Per-program CPI authority PDA — what the Ika dWallet program checks against
 * when our router CPIs `approve_message`. Seeds: [b"__ika_cpi_authority"].
 * Source: `ika-dwallet-anchor::CPI_AUTHORITY_SEED`.
 */
export function findCpiAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([IKA_CPI_AUTHORITY_SEED], ROUTER);
}

/**
 * Ika `MessageApproval` PDA. Mirrors the layout the Ika program uses
 * internally so we can pre-compute the bump and pass it in the ix data.
 *
 * Seeds (Ika): ["dwallet", chunks(curve_le(2) || pubkey), "message_approval",
 *               scheme_le(2), message_digest, [meta_digest]].
 * Reference: ika-pre-alpha multisig react `findMessageApprovalPda`.
 *
 * `metadataDigest` is optional; pass `null` to omit. (Our flow records the
 * keccak hash chain via the `CrosschainReceipt` PDA; the Ika metadata field
 * stays zero by default.)
 */
export function findMessageApprovalPda(args: {
  curve: number;
  dwalletPublicKey: Uint8Array;
  signatureScheme: number;
  messageDigest: Uint8Array;
  metadataDigest?: Uint8Array | null;
}): [PublicKey, number] {
  const { curve, dwalletPublicKey, signatureScheme, messageDigest, metadataDigest } = args;
  if (messageDigest.length !== 32)
    throw new Error("messageDigest must be 32 bytes (keccak256)");

  // Header = curve(u16 LE) || dwallet pubkey bytes (33 secp / 32 ed25519).
  const header = Buffer.alloc(2 + dwalletPublicKey.length);
  header.writeUInt16LE(curve, 0);
  Buffer.from(dwalletPublicKey).copy(header, 2);

  // Split header into 32-byte chunks (PDA seed length cap).
  const seeds: Buffer[] = [Buffer.from("dwallet")];
  for (let i = 0; i < header.length; i += 32) {
    seeds.push(header.subarray(i, Math.min(i + 32, header.length)));
  }
  seeds.push(Buffer.from("message_approval"));
  const schemeBuf = Buffer.alloc(2);
  schemeBuf.writeUInt16LE(signatureScheme, 0);
  seeds.push(schemeBuf);
  seeds.push(Buffer.from(messageDigest));
  if (metadataDigest) {
    if (metadataDigest.length !== 32)
      throw new Error("metadataDigest must be 32 bytes when provided");
    seeds.push(Buffer.from(metadataDigest));
  }

  return PublicKey.findProgramAddressSync(seeds, IKA);
}
