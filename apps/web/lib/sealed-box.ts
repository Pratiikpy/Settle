/**
 * Sealed-box encryption — server-side wrapper around @settle/sdk sealedBox helpers.
 *
 * Reads SETTLE_SEALED_BOX_PUBKEY / SETTLE_SEALED_BOX_PRIVKEY from env (base64-encoded
 * X25519 keypair generated via `pnpm tsx scripts/seal-keygen.ts`).
 *
 * Returns null from `sealedBoxEncrypt` if no recipient pubkey is configured (callers
 * decide whether to skip encryption or fail). Throws from `sealedBoxDecrypt` if no
 * privkey is configured (cryptographic failure should be loud).
 */

import {
  sealedBoxEncryptToPubkey,
  sealedBoxDecryptString,
} from "@settle/sdk";

function getRecipientPubkey(): Uint8Array | null {
  const b64 = process.env.SETTLE_SEALED_BOX_PUBKEY;
  if (!b64) return null;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function getRecipientPrivkey(): Uint8Array | null {
  const b64 = process.env.SETTLE_SEALED_BOX_PRIVKEY;
  if (!b64) return null;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export function sealedBoxEncrypt(plaintext: string): Buffer | null {
  const recipientPub = getRecipientPubkey();
  if (!recipientPub) return null;
  if (recipientPub.length !== 32) {
    throw new Error(`SETTLE_SEALED_BOX_PUBKEY must be 32 bytes, got ${recipientPub.length}`);
  }
  const sealed = sealedBoxEncryptToPubkey(plaintext, recipientPub);
  return Buffer.from(sealed);
}

export function sealedBoxDecrypt(sealed: Buffer): string {
  const recipientPriv = getRecipientPrivkey();
  if (!recipientPriv) {
    throw new Error("SETTLE_SEALED_BOX_PRIVKEY not configured");
  }
  if (recipientPriv.length !== 32) {
    throw new Error(`SETTLE_SEALED_BOX_PRIVKEY must be 32 bytes, got ${recipientPriv.length}`);
  }
  return sealedBoxDecryptString(new Uint8Array(sealed), recipientPriv);
}
