/**
 * Sealed-box encryption (X25519 + XChaCha20-Poly1305).
 *
 * Anyone can encrypt to the recipient's pubkey; only the recipient (with privkey) can
 * decrypt. Equivalent to libsodium `crypto_box_seal` but implemented with @noble/ciphers
 * for auditable TypeScript without WASM/native deps.
 *
 * On-wire format:  [ephemeral_pubkey 32][ciphertext + 16-byte poly1305 mac]
 *
 * Used by Settle to encrypt off-chain receipt metadata (purpose text, deliverable summaries)
 * before persisting to Supabase. The DB stores ciphertext only.
 *
 * Security notes:
 *   - X25519 shared secret is symmetric: getSharedSecret(ephPriv, recipientPub) ===
 *     getSharedSecret(recipientPriv, ephPub). Both sides compute the same key.
 *   - Nonce is deterministic from sha256(ephPub || recipientPub)[..24] — collision-safe
 *     because the ephemeral keypair is fresh per message.
 */

import { x25519 } from "@noble/curves/ed25519";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { sha256 } from "@noble/hashes/sha2";

/** Generate a fresh X25519 keypair. */
export function sealedBoxKeygen(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const privateKey = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(privateKey);
  } else {
    throw new Error("sealed-box: crypto.getRandomValues unavailable");
  }
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/**
 * Derive the symmetric key + nonce.
 *   myPriv: the side's own private key
 *   theirPub: the other side's public key (used for X25519 shared secret)
 *   ephPub, recipientPub: the canonical pair, used for nonce derivation
 */
function deriveKeyAndNonce(
  myPriv: Uint8Array,
  theirPub: Uint8Array,
  ephPub: Uint8Array,
  recipientPub: Uint8Array,
): { key: Uint8Array; nonce: Uint8Array } {
  const sharedSecret = x25519.getSharedSecret(myPriv, theirPub);
  const key = sha256(sharedSecret);
  const nonceMaterial = new Uint8Array(64);
  nonceMaterial.set(ephPub, 0);
  nonceMaterial.set(recipientPub, 32);
  const nonce = sha256(nonceMaterial).slice(0, 24);
  return { key, nonce };
}

/**
 * Encrypt plaintext to a recipient's public key.
 * Returns [ephemeral_pubkey 32][ciphertext_with_mac].
 *
 * Optional `ephemeralPriv` allows deterministic encryption (used in tests).
 */
export function sealedBoxEncryptToPubkey(
  plaintext: string | Uint8Array,
  recipientPub: Uint8Array,
  ephemeralPriv?: Uint8Array,
): Uint8Array {
  if (recipientPub.length !== 32) {
    throw new Error(`recipient public key must be 32 bytes, got ${recipientPub.length}`);
  }

  const ephPriv = ephemeralPriv ?? sealedBoxKeygen().privateKey;
  const ephPub = x25519.getPublicKey(ephPriv);

  // Encrypt side: my=ephemeral, their=recipient
  const { key, nonce } = deriveKeyAndNonce(ephPriv, recipientPub, ephPub, recipientPub);
  const cipher = xchacha20poly1305(key, nonce);
  const pt = typeof plaintext === "string" ? new TextEncoder().encode(plaintext) : plaintext;
  const ciphertext = cipher.encrypt(pt);

  const out = new Uint8Array(32 + ciphertext.length);
  out.set(ephPub, 0);
  out.set(ciphertext, 32);
  return out;
}

/**
 * Decrypt an on-wire sealed-box buffer using the recipient's private key.
 * Throws on MAC failure or malformed input.
 */
export function sealedBoxDecryptWithPrivkey(
  sealed: Uint8Array,
  recipientPriv: Uint8Array,
): Uint8Array {
  if (recipientPriv.length !== 32) {
    throw new Error(`recipient private key must be 32 bytes, got ${recipientPriv.length}`);
  }
  if (sealed.length < 32 + 16) {
    throw new Error(`sealed box too short: ${sealed.length} bytes`);
  }

  const ephemeralPub = sealed.subarray(0, 32);
  const ciphertext = sealed.subarray(32);
  const recipientPub = x25519.getPublicKey(recipientPriv);

  // Decrypt side: my=recipient, their=ephemeral. Same nonce inputs (ephPub, recipientPub).
  const { key, nonce } = deriveKeyAndNonce(
    recipientPriv,
    ephemeralPub,
    ephemeralPub,
    recipientPub,
  );
  const cipher = xchacha20poly1305(key, nonce);
  return cipher.decrypt(ciphertext);
}

/** UTF-8 string convenience. */
export function sealedBoxDecryptString(sealed: Uint8Array, recipientPriv: Uint8Array): string {
  return new TextDecoder().decode(sealedBoxDecryptWithPrivkey(sealed, recipientPriv));
}
