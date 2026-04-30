/**
 * @handle resolver utilities. Two-tier resolution:
 *   1. Local Settle DB (Supabase `handles` table → maps "@pratiik" → pubkey)
 *   2. Bonfida SNS (`pratiik.sol` → pubkey) when handle ends in `.sol`
 *
 * The actual fetch logic lives in the consuming app (Next.js server route /api/resolve).
 * This module exposes the **canonicalization** rules so client + server agree.
 */

const HANDLE_RE = /^@?([a-z0-9_-]{2,32})$/i;
const SOL_DOMAIN_RE = /^([a-z0-9_-]{1,32})\.sol$/i;

export interface ParsedHandle {
  kind: "settle" | "sns" | "pubkey";
  /** Normalized lowercase handle without @ prefix; or full .sol domain; or pubkey. */
  value: string;
}

/**
 * Canonicalize user input to one of three forms.
 * Throws on invalid input.
 */
export function parseHandleInput(raw: string): ParsedHandle {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("empty handle");

  // Pubkey passthrough — base58 32-44 chars
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    return { kind: "pubkey", value: trimmed };
  }

  // .sol domain
  const solMatch = trimmed.match(SOL_DOMAIN_RE);
  if (solMatch) {
    return { kind: "sns", value: trimmed.toLowerCase() };
  }

  // @handle / handle
  const handleMatch = trimmed.match(HANDLE_RE);
  if (handleMatch && handleMatch[1]) {
    return { kind: "settle", value: handleMatch[1].toLowerCase() };
  }

  throw new Error(`invalid handle format: ${trimmed}`);
}

/** Display formatter — always shows `@handle` for Settle handles. */
export function displayHandle(parsed: ParsedHandle): string {
  switch (parsed.kind) {
    case "settle":
      return `@${parsed.value}`;
    case "sns":
      return parsed.value;
    case "pubkey":
      return `${parsed.value.slice(0, 4)}…${parsed.value.slice(-4)}`;
  }
}
