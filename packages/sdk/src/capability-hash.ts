/**
 * Capability hash derivation.
 *
 * A "capability hash" is a 32-byte BLAKE3 over a canonical JSON of the merchant's
 * service spec. Pinning a hash on a card's allowlist entry means: this card may only
 * pay this merchant for THIS specific operation/contract/version. Changing the spec
 * invalidates all previous attestations.
 *
 * Canonical spec format (sorted keys, no whitespace, NFC):
 *   {
 *     "domain": <string>,             // e.g. "translate.demo"
 *     "method": <string>,             // e.g. "POST"
 *     "path":   <string>,             // e.g. "/translate"
 *     "amount_lamports": <string>,    // decimal, no units
 *     "version": <integer>,           // start at 1; bump on breaking spec change
 *   }
 *
 * Stable across implementations because canonical-JSON encoding is deterministic.
 * Returns 64-char lowercase hex.
 */

import { blake3 } from "@noble/hashes/blake3";

export interface CapabilitySpec {
  domain: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  amount_lamports: string;
  version: number;
}

function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJsonStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function computeCapabilityHashHex(spec: CapabilitySpec): string {
  if (!/^\d+$/.test(spec.amount_lamports)) {
    throw new Error("amount_lamports must be a non-negative decimal string");
  }
  if (!Number.isInteger(spec.version) || spec.version < 1) {
    throw new Error("version must be a positive integer");
  }
  const normalized: CapabilitySpec = {
    domain: spec.domain.normalize("NFC"),
    method: spec.method,
    path: spec.path,
    amount_lamports: spec.amount_lamports,
    version: spec.version,
  };
  const json = canonicalJsonStringify(normalized);
  const bytes = new TextEncoder().encode(json);
  const hash = blake3(bytes);
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}
