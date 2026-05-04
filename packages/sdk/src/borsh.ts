/**
 * Minimal Borsh encoder for Anchor ix args.
 *
 * Anchor ix data layout:
 *   [8-byte discriminator] [borsh-encoded args]
 *
 * Discriminator = sha256("global:" + snake_case_ix_name)[0..8]
 *
 * Borsh primitives used by our program:
 *   u8     1 byte
 *   u32    4 bytes LE
 *   u64    8 bytes LE
 *   bool   1 byte (0 or 1)
 *   [u8;N] N bytes raw
 *   Pubkey 32 bytes raw
 *   Vec<T> 4-byte LE length + items
 *   Option<T> 1-byte tag (0=None, 1=Some) + value if Some
 *   String 4-byte LE length + UTF-8 bytes
 *
 * No external Borsh dep — we keep this small + auditable.
 */

import { sha256 } from "@noble/hashes/sha2";

export function anchorDiscriminator(kind: "global" | "account" | "event", name: string): Buffer {
  const seed = `${kind}:${name}`;
  const hash = sha256(new TextEncoder().encode(seed));
  return Buffer.from(hash.slice(0, 8));
}

/** Borsh writer with growing buffer. */
export class BorshWriter {
  private buf: Buffer;
  private len: number;

  constructor(initialCap = 256) {
    this.buf = Buffer.alloc(initialCap);
    this.len = 0;
  }

  private ensure(extra: number) {
    if (this.len + extra > this.buf.length) {
      const grown = Buffer.alloc(Math.max(this.buf.length * 2, this.len + extra));
      this.buf.copy(grown, 0, 0, this.len);
      this.buf = grown;
    }
  }

  u8(v: number): this {
    this.ensure(1);
    this.buf.writeUInt8(v & 0xff, this.len);
    this.len += 1;
    return this;
  }

  u32(v: number): this {
    this.ensure(4);
    this.buf.writeUInt32LE(v >>> 0, this.len);
    this.len += 4;
    return this;
  }

  u64(v: bigint | number | string): this {
    this.ensure(8);
    const big = typeof v === "bigint" ? v : BigInt(v);
    this.buf.writeBigUInt64LE(big, this.len);
    this.len += 8;
    return this;
  }

  i64(v: bigint | number | string): this {
    this.ensure(8);
    const big = typeof v === "bigint" ? v : BigInt(v);
    this.buf.writeBigInt64LE(big, this.len);
    this.len += 8;
    return this;
  }

  bool(v: boolean): this {
    return this.u8(v ? 1 : 0);
  }

  /**
   * u128 little-endian (16 bytes). Anchor encodes u128 as 16 bytes little-endian.
   * Accepts bigint or string (decimal) — no JS `number` because mantissa is too small.
   */
  u128(v: bigint | string): this {
    const big = typeof v === "bigint" ? v : BigInt(v);
    if (big < 0n) throw new Error("u128 must be non-negative");
    if (big >= 1n << 128n) throw new Error("u128 overflow");
    this.ensure(16);
    // Two u64 halves, low first.
    const lo = big & ((1n << 64n) - 1n);
    const hi = big >> 64n;
    this.buf.writeBigUInt64LE(lo, this.len);
    this.buf.writeBigUInt64LE(hi, this.len + 8);
    this.len += 16;
    return this;
  }

  bytes(b: Uint8Array): this {
    this.ensure(b.length);
    Buffer.from(b).copy(this.buf, this.len);
    this.len += b.length;
    return this;
  }

  /** [u8; N] — raw bytes, no length prefix. Caller asserts length. */
  fixedBytes(b: Uint8Array, n: number): this {
    if (b.length !== n) throw new Error(`expected ${n} bytes, got ${b.length}`);
    return this.bytes(b);
  }

  /** Borsh String: 4-byte LE length + UTF-8 bytes. */
  string(s: string): this {
    const utf8 = new TextEncoder().encode(s);
    return this.u32(utf8.length).bytes(utf8);
  }

  /** Borsh Vec<T>: 4-byte LE count + items via writer fn. */
  vec<T>(items: readonly T[], writeItem: (w: BorshWriter, item: T) => void): this {
    this.u32(items.length);
    for (const item of items) writeItem(this, item);
    return this;
  }

  /** Borsh Option<T>: 1-byte tag + value if Some. */
  option<T>(value: T | null | undefined, writeSome: (w: BorshWriter, v: T) => void): this {
    if (value === null || value === undefined) {
      this.u8(0);
    } else {
      this.u8(1);
      writeSome(this, value);
    }
    return this;
  }

  toBuffer(): Buffer {
    return this.buf.subarray(0, this.len);
  }
}

/** Convenience: build the full ix data = discriminator + body. */
export function buildIxData(
  ixName: string,
  writeBody: (w: BorshWriter) => void,
): Buffer {
  const disc = anchorDiscriminator("global", ixName);
  const w = new BorshWriter();
  writeBody(w);
  const body = w.toBuffer();
  return Buffer.concat([disc, body]);
}
