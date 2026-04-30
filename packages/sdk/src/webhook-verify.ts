/**
 * Webhook signature verification — drop-in for merchants who receive Settle webhooks.
 *
 * Settle signs every outbound webhook with HMAC-SHA256 over the canonical body bytes,
 * keyed by SETTLE_WEBHOOK_SIGNING_SECRET. The signature is sent in the `X-Settle-Signature`
 * header as a hex string.
 *
 * Usage in a merchant's backend:
 *   import { verifyWebhookSignature } from "@settle/sdk";
 *
 *   app.post("/settle-webhook", express.raw({ type: "application/json" }), (req, res) => {
 *     const ok = verifyWebhookSignature({
 *       bodyBytes: req.body,
 *       signatureHex: req.header("X-Settle-Signature") ?? "",
 *       secret: process.env.SETTLE_WEBHOOK_SECRET ?? "",
 *     });
 *     if (!ok) return res.status(401).end();
 *     // Process the webhook...
 *   });
 *
 * Why HMAC-SHA256 (not Ed25519): merchants don't need to know our pubkey, just the shared
 * secret. The shared secret is rotated per-merchant in V2.
 */

import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";

export interface VerifyWebhookInput {
  /** Raw request body bytes (BEFORE JSON parsing). */
  bodyBytes: Uint8Array | Buffer | string;
  /** Value of the X-Settle-Signature header (hex). */
  signatureHex: string;
  /** The shared secret (SETTLE_WEBHOOK_SIGNING_SECRET). */
  secret: string;
}

export function verifyWebhookSignature(input: VerifyWebhookInput): boolean {
  if (!input.secret || !input.signatureHex) return false;

  const bodyBytes =
    typeof input.bodyBytes === "string"
      ? new TextEncoder().encode(input.bodyBytes)
      : input.bodyBytes instanceof Uint8Array
        ? input.bodyBytes
        : new Uint8Array(input.bodyBytes);

  const secretBytes = new TextEncoder().encode(input.secret);
  const computed = hmac(sha256, secretBytes, bodyBytes);
  const computedHex = Array.from(computed, (b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time comparison — variable-time `===` would leak signature bytes via timing
  if (computedHex.length !== input.signatureHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedHex.length; i++) {
    mismatch |= computedHex.charCodeAt(i) ^ input.signatureHex.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Compute the signature (used by the indexer when sending webhooks). */
export function signWebhookPayload(bodyBytes: Uint8Array | Buffer | string, secret: string): string {
  const body =
    typeof bodyBytes === "string"
      ? new TextEncoder().encode(bodyBytes)
      : bodyBytes instanceof Uint8Array
        ? bodyBytes
        : new Uint8Array(bodyBytes);
  const sig = hmac(sha256, new TextEncoder().encode(secret), body);
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
