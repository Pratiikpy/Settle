/**
 * Wallet-signature auth — Phantom-signed challenges for protected endpoints.
 *
 * Flow:
 *   1. Client GETs /api/auth/challenge → returns { nonce, expires_at }
 *      (or constructs locally with a known format)
 *   2. Client signs the canonical message: "Settle Auth\nnonce={n}\nts={ts}\npubkey={pk}"
 *   3. Client passes nonce + ts + signature to protected endpoint as query/header
 *   4. Endpoint calls verifyWalletSignature() → returns the verified pubkey or null
 *
 * Replay protection: nonce stored in Upstash with 5min TTL. Once consumed, can't reuse.
 *
 * V1: only used by /decrypt + /cards/list. V2: middleware on every authenticated route.
 */

import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

const CHALLENGE_TTL_SECONDS = 300; // 5 min
const TS_SKEW_SECONDS = 300;

interface UpstashResp {
  result: number | string | null;
}

async function upstash(command: string[]): Promise<UpstashResp | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url}/${command.join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as UpstashResp;
}

export function buildAuthMessage(params: {
  nonce: string;
  tsUnix: number;
  pubkey: string;
}): string {
  return `Settle Auth\nnonce=${params.nonce}\nts=${params.tsUnix}\npubkey=${params.pubkey}`;
}

export interface VerifyWalletSigInput {
  pubkey: string;
  signatureB58: string;
  nonce: string;
  tsUnix: number;
}

export type VerifyResult =
  | { ok: true; pubkey: string }
  | { ok: false; reason: string };

/**
 * Verify a wallet-signed challenge.
 * Checks: pubkey format, ts skew, nonce uniqueness (if Upstash configured), Ed25519 signature.
 */
export async function verifyWalletSignature(input: VerifyWalletSigInput): Promise<VerifyResult> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.pubkey)) {
    return { ok: false, reason: "invalid_pubkey" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(input.tsUnix - now) > TS_SKEW_SECONDS) {
    return { ok: false, reason: "ts_skew" };
  }

  // Replay check via Upstash (best-effort — if not configured, skip)
  const nonceKey = `auth:${input.pubkey}:${input.nonce}`;
  const setRes = await upstash(["set", nonceKey, "1", "EX", String(CHALLENGE_TTL_SECONDS), "NX"]);
  if (setRes && setRes.result !== "OK") {
    return { ok: false, reason: "nonce_replay" };
  }

  let sig: Uint8Array;
  let pubBytes: Uint8Array;
  try {
    sig = bs58.decode(input.signatureB58);
    pubBytes = bs58.decode(input.pubkey);
  } catch {
    return { ok: false, reason: "decode_failed" };
  }

  const msg = buildAuthMessage({
    nonce: input.nonce,
    tsUnix: input.tsUnix,
    pubkey: input.pubkey,
  });
  const msgBytes = new TextEncoder().encode(msg);

  let valid = false;
  try {
    valid = ed25519.verify(sig, msgBytes, pubBytes);
  } catch {
    return { ok: false, reason: "verify_threw" };
  }
  if (!valid) return { ok: false, reason: "signature_invalid" };

  return { ok: true, pubkey: input.pubkey };
}

/**
 * Convenience: read the four standard auth headers/query params and call verifyWalletSignature.
 * Returns the verified pubkey or null. Routes can do `if (!auth) return 401`.
 */
export async function authFromRequest(req: Request): Promise<VerifyResult | null> {
  const url = new URL(req.url);
  const pubkey = url.searchParams.get("auth_pubkey") ?? req.headers.get("x-settle-auth-pubkey");
  const sig = url.searchParams.get("auth_sig") ?? req.headers.get("x-settle-auth-sig");
  const nonce = url.searchParams.get("auth_nonce") ?? req.headers.get("x-settle-auth-nonce");
  const ts = url.searchParams.get("auth_ts") ?? req.headers.get("x-settle-auth-ts");

  if (!pubkey || !sig || !nonce || !ts) return null;
  const tsUnix = Number(ts);
  if (!Number.isFinite(tsUnix)) return { ok: false, reason: "invalid_ts" };

  return verifyWalletSignature({ pubkey, signatureB58: sig, nonce, tsUnix });
}
