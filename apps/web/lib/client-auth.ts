"use client";

import bs58 from "bs58";

/**
 * Client-side helper to sign a Settle auth challenge with Phantom and
 * return the 4 query/header values protected endpoints expect:
 *   auth_pubkey, auth_sig, auth_nonce, auth_ts
 *
 * Caches the signed challenge per-pubkey for the auth window so a user
 * navigating between authenticated pages doesn't get prompted to sign
 * over and over. The server's challenge TTL (5 min by default) is the
 * upper bound — we use 4 minutes locally to leave a 60s safety margin.
 */

export interface AuthHeaders {
  auth_pubkey: string;
  auth_sig: string;
  auth_nonce: string;
  auth_ts: string;
}

const AUTH_TTL_MS = 4 * 60 * 1000;

interface CacheEntry {
  headers: AuthHeaders;
  expires: number;
  inflight?: Promise<AuthHeaders>;
}

const authCache = new Map<string, CacheEntry>();

export async function fetchAuthHeaders(
  pubkey: string,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<AuthHeaders> {
  const now = Date.now();
  const cached = authCache.get(pubkey);
  if (cached && cached.expires > now) {
    return cached.headers;
  }
  if (cached?.inflight) {
    return cached.inflight;
  }

  const work = (async () => {
    const res = await fetch(
      `/api/auth/challenge?pubkey=${encodeURIComponent(pubkey)}`,
    );
    if (!res.ok) throw new Error(`challenge fetch failed: ${res.status}`);
    const challenge = (await res.json()) as {
      nonce: string;
      ts: number;
      message: string;
    };
    const sig = await signMessage(new TextEncoder().encode(challenge.message));
    const headers: AuthHeaders = {
      auth_pubkey: pubkey,
      auth_sig: bs58.encode(sig),
      auth_nonce: challenge.nonce,
      auth_ts: String(challenge.ts),
    };
    authCache.set(pubkey, {
      headers,
      expires: now + AUTH_TTL_MS,
    });
    return headers;
  })();

  authCache.set(pubkey, {
    headers: cached?.headers ?? {
      auth_pubkey: pubkey,
      auth_sig: "",
      auth_nonce: "",
      auth_ts: "",
    },
    expires: cached?.expires ?? 0,
    inflight: work,
  });

  try {
    return await work;
  } catch (e) {
    // Drop the inflight on error so the next call retries.
    authCache.delete(pubkey);
    throw e;
  }
}

/** Drop cached signatures (e.g. on disconnect). */
export function clearAuthCache(pubkey?: string) {
  if (pubkey) authCache.delete(pubkey);
  else authCache.clear();
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
