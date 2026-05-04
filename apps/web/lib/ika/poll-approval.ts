// Settle x Ika sidetrack — `MessageApproval` PDA polling.
//
// Once `request_crosschain_sign` ALLOW lands, the Ika dWallet program
// allocates a `MessageApproval` PDA with status=Pending. The Ika network
// (NOA in pre-alpha) writes the signature into the same PDA when ready,
// flipping status=Signed. This module polls for that flip.
//
// Layout reference: ika-pre-alpha docs §3 "Message Approval" + the field
// sizes from `getting-started/concepts.md`:
//
//   dwallet(32) | message_digest(32) | message_metadata_digest(32) |
//   approver(32) | user_pubkey(32) | signature_scheme(2 LE) |
//   epoch(8) | status(1) | signature_len(2 LE) | signature(128) |
//   bump(1) | _reserved(8)
//
// Total = 280 bytes (after Anchor 8-byte discriminator → ~288 with header,
// but the Ika program isn't Anchor-shaped; offsets here are from the raw
// account body).

import { Connection, PublicKey } from "@solana/web3.js";

export type ApprovalStatus = "pending" | "signed" | "missing";

export interface ApprovalReadResult {
  status: ApprovalStatus;
  /** Signature bytes (variable length up to 128) when status === "signed". */
  signature: Uint8Array | null;
  signatureScheme: number | null;
  epoch: bigint | null;
}

/** Decode the `MessageApproval` account body. Returns `missing` if absent. */
export async function readMessageApproval(
  connection: Connection,
  pda: PublicKey,
): Promise<ApprovalReadResult> {
  const acct = await connection.getAccountInfo(pda, "confirmed");
  if (!acct) {
    return { status: "missing", signature: null, signatureScheme: null, epoch: null };
  }
  const data = Buffer.from(acct.data);
  // Field offsets (per concepts.md). The Ika program may include a small
  // header before these fields; we assume body offsets start at 0 here and
  // adjust if Phase F finds otherwise.
  const SIG_SCHEME_OFFSET = 32 * 5; // 5 × 32-byte fields before scheme
  const EPOCH_OFFSET = SIG_SCHEME_OFFSET + 2;
  const STATUS_OFFSET = EPOCH_OFFSET + 8;
  const SIG_LEN_OFFSET = STATUS_OFFSET + 1;
  const SIG_OFFSET = SIG_LEN_OFFSET + 2;
  if (data.length < SIG_OFFSET + 128) {
    // Account exists but layout shorter than expected — treat as pending so
    // the poller doesn't surface a misleading "signed".
    return { status: "pending", signature: null, signatureScheme: null, epoch: null };
  }
  const signatureScheme = data.readUInt16LE(SIG_SCHEME_OFFSET);
  const epoch = data.readBigUInt64LE(EPOCH_OFFSET);
  const status = data.readUInt8(STATUS_OFFSET);
  const sigLen = data.readUInt16LE(SIG_LEN_OFFSET);
  if (status === 0) {
    return { status: "pending", signature: null, signatureScheme, epoch };
  }
  if (status === 1) {
    if (sigLen === 0 || sigLen > 128) {
      return { status: "pending", signature: null, signatureScheme, epoch };
    }
    const sig = new Uint8Array(data.subarray(SIG_OFFSET, SIG_OFFSET + sigLen));
    return { status: "signed", signature: sig, signatureScheme, epoch };
  }
  return { status: "pending", signature: null, signatureScheme, epoch };
}

/**
 * Poll `MessageApproval` until status flips to `signed`, or the timeout
 * expires. Returns the final read.
 *
 * `timeoutMs` defaults to 15000 (matches the API route's max). `intervalMs`
 * defaults to 800 (low enough to feel responsive without thrashing the RPC).
 */
export async function pollUntilSigned(
  connection: Connection,
  pda: PublicKey,
  opts: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {},
): Promise<ApprovalReadResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const intervalMs = opts.intervalMs ?? 800;
  const start = Date.now();
  let last: ApprovalReadResult = {
    status: "missing",
    signature: null,
    signatureScheme: null,
    epoch: null,
  };
  while (Date.now() - start < timeoutMs) {
    if (opts.signal?.aborted) break;
    last = await readMessageApproval(connection, pda);
    if (last.status === "signed") return last;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return last;
}
