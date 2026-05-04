// Settle x Ika sidetrack — pure EIP-1559 / RLP helpers.
//
// Hand-rolled to avoid pulling viem/ethers into the bundle for one tx type.
// Lives in the SDK so vitest can unit-test the deterministic encoding pieces
// without spinning up @solana/web3.js or fetch.
//
// References:
//   EIP-1559: https://eips.ethereum.org/EIPS/eip-1559
//   EIP-2718 (typed envelope): https://eips.ethereum.org/EIPS/eip-2718
//   RLP encoding: https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/

import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "./canonical.js";

// `bytesToHex` is re-exported from canonical (single source of truth).
export { bytesToHex };

/**
 * Permissive hex-to-bytes: accepts `0x...`, `0X...`, or bare hex. Distinct
 * from canonical's strict `hexToBytes` (no prefix). Named with the `0x`
 * suffix so callers know to use this for EVM-shaped strings.
 */
export function hexToBytes0x(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length === 0) return new Uint8Array();
  if (clean.length % 2 !== 0) throw new Error(`hex length must be even: ${hex}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`invalid hex character in: ${hex}`);
    out[i] = byte;
  }
  return out;
}

// ── RLP primitives ──

function rlpLengthEncoding(len: number, offset: number): Uint8Array {
  if (len < 56) return Uint8Array.of(offset + len);
  const lenBytes: number[] = [];
  let n = len;
  while (n > 0) {
    lenBytes.unshift(n & 0xff);
    n >>>= 8;
  }
  return Uint8Array.of(offset + 55 + lenBytes.length, ...lenBytes);
}

/** RLP-encode a byte string. */
export function rlpBytes(b: Uint8Array): Uint8Array {
  if (b.length === 1 && b[0]! < 0x80) return new Uint8Array(b);
  const header = rlpLengthEncoding(b.length, 0x80);
  const out = new Uint8Array(header.length + b.length);
  out.set(header, 0);
  out.set(b, header.length);
  return out;
}

/** RLP-encode a list of already-encoded items. */
export function rlpList(items: Uint8Array[]): Uint8Array {
  const totalLen = items.reduce((n, x) => n + x.length, 0);
  const header = rlpLengthEncoding(totalLen, 0xc0);
  const out = new Uint8Array(header.length + totalLen);
  out.set(header, 0);
  let off = header.length;
  for (const item of items) {
    out.set(item, off);
    off += item.length;
  }
  return out;
}

/** Encode an unsigned bigint as a minimal big-endian byte array (RLP rule). */
export function bigIntToMinimalBytes(v: bigint): Uint8Array {
  if (v < 0n) throw new Error("RLP: negative bigint not allowed");
  if (v === 0n) return new Uint8Array(); // empty bytes = zero in RLP
  const bytes: number[] = [];
  let n = v;
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return new Uint8Array(bytes);
}

// `bytesToHex` and `hexToBytes` are imported from `./canonical.js` (single
// source of truth) and re-exported above so callers of `@settle/sdk` see one
// consistent API.

/** Parse + validate a 20-byte EVM address. Returns 20 bytes. */
export function evmAddressBytes(addr0x: string): Uint8Array {
  const clean = addr0x.startsWith("0x") || addr0x.startsWith("0X") ? addr0x.slice(2) : addr0x;
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) throw new Error("invalid EVM address");
  return hexToBytes0x(clean);
}

// ── EIP-1559 (Type 2) tx ──

export interface UnsignedSepoliaTx {
  chainId: bigint;
  nonce: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
  to: Uint8Array;
  value: bigint;
  data: Uint8Array;
  accessList: readonly never[];
}

/**
 * Encode the unsigned tx for signing per EIP-1559:
 *   keccak256( 0x02 || rlp([chainId, nonce, mpfg, mfg, gas, to, value, data, accessList]) )
 *
 * Returns the 32-byte signing-message digest.
 */
export function buildUnsignedSepoliaTxDigest(tx: UnsignedSepoliaTx): {
  payload: Uint8Array;
  digest: Uint8Array;
} {
  if (tx.to.length !== 20) throw new Error("EIP-1559: `to` must be 20 bytes");
  const rlpItems: Uint8Array[] = [
    rlpBytes(bigIntToMinimalBytes(tx.chainId)),
    rlpBytes(bigIntToMinimalBytes(tx.nonce)),
    rlpBytes(bigIntToMinimalBytes(tx.maxPriorityFeePerGas)),
    rlpBytes(bigIntToMinimalBytes(tx.maxFeePerGas)),
    rlpBytes(bigIntToMinimalBytes(tx.gasLimit)),
    rlpBytes(tx.to),
    rlpBytes(bigIntToMinimalBytes(tx.value)),
    rlpBytes(tx.data),
    rlpList([]),
  ];
  const inner = rlpList(rlpItems);
  const payload = new Uint8Array(1 + inner.length);
  payload[0] = 0x02;
  payload.set(inner, 1);
  const digest = keccak_256(payload);
  return { payload, digest };
}

/** Reconstruct broadcast-ready signed tx (0x02 || rlp([fields, y_parity, r, s])). */
export function buildSignedSepoliaTx(args: {
  tx: UnsignedSepoliaTx;
  signatureRS: Uint8Array;
  yParity: 0 | 1;
}): Uint8Array {
  const { tx, signatureRS, yParity } = args;
  if (signatureRS.length !== 64) throw new Error("signatureRS must be 64 bytes");
  const r = signatureRS.subarray(0, 32);
  const s = signatureRS.subarray(32, 64);
  const rlpItems: Uint8Array[] = [
    rlpBytes(bigIntToMinimalBytes(tx.chainId)),
    rlpBytes(bigIntToMinimalBytes(tx.nonce)),
    rlpBytes(bigIntToMinimalBytes(tx.maxPriorityFeePerGas)),
    rlpBytes(bigIntToMinimalBytes(tx.maxFeePerGas)),
    rlpBytes(bigIntToMinimalBytes(tx.gasLimit)),
    rlpBytes(tx.to),
    rlpBytes(bigIntToMinimalBytes(tx.value)),
    rlpBytes(tx.data),
    rlpList([]),
    rlpBytes(bigIntToMinimalBytes(BigInt(yParity))),
    rlpBytes(stripLeadingZeros(r)),
    rlpBytes(stripLeadingZeros(s)),
  ];
  const inner = rlpList(rlpItems);
  const out = new Uint8Array(1 + inner.length);
  out[0] = 0x02;
  out.set(inner, 1);
  return out;
}

function stripLeadingZeros(b: Uint8Array): Uint8Array {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  return b.subarray(i);
}
