"use client";

import bs58 from "bs58";

/**
 * Client-side helper to sign a Settle auth challenge with Phantom and return the
 * 4 query/header values protected endpoints expect:
 *   auth_pubkey, auth_sig, auth_nonce, auth_ts
 */

export interface AuthHeaders {
  auth_pubkey: string;
  auth_sig: string;
  auth_nonce: string;
  auth_ts: string;
}

export async function fetchAuthHeaders(
  pubkey: string,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<AuthHeaders> {
  const res = await fetch(`/api/auth/challenge?pubkey=${encodeURIComponent(pubkey)}`);
  if (!res.ok) {
    throw new Error(`challenge fetch failed: ${res.status}`);
  }
  const challenge = (await res.json()) as {
    nonce: string;
    ts: number;
    message: string;
  };

  const sig = await signMessage(new TextEncoder().encode(challenge.message));
  return {
    auth_pubkey: pubkey,
    auth_sig: bs58.encode(sig),
    auth_nonce: challenge.nonce,
    auth_ts: String(challenge.ts),
  };
}

/** Append auth headers as query params to a URL. */
export function withAuthQuery(url: string, headers: AuthHeaders): string {
  const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  for (const [k, v] of Object.entries(headers)) u.searchParams.set(k, v);
  return u.toString();
}

/** Build fetch headers object including the auth headers. */
export function asAuthHeaders(headers: AuthHeaders): Record<string, string> {
  return {
    "X-Settle-Auth-Pubkey": headers.auth_pubkey,
    "X-Settle-Auth-Sig": headers.auth_sig,
    "X-Settle-Auth-Nonce": headers.auth_nonce,
    "X-Settle-Auth-Ts": headers.auth_ts,
  };
}
