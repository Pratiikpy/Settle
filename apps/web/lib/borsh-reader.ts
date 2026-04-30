/**
 * Minimal Borsh reader — counterpart to lib/borsh.ts BorshWriter.
 * Used by lib/account-decoder.ts to deserialize on-chain AgentCard + Pact accounts.
 */

export class BorshReader {
  private buf: Buffer;
  private off: number;

  constructor(b: Buffer | Uint8Array, offset = 0) {
    this.buf = Buffer.isBuffer(b) ? b : Buffer.from(b);
    this.off = offset;
  }

  private ensure(extra: number) {
    if (this.off + extra > this.buf.length) {
      throw new Error(
        `BorshReader: out of bounds — need ${extra} bytes at offset ${this.off}, buf length ${this.buf.length}`,
      );
    }
  }

  u8(): number {
    this.ensure(1);
    const v = this.buf.readUInt8(this.off);
    this.off += 1;
    return v;
  }

  u32(): number {
    this.ensure(4);
    const v = this.buf.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }

  u64(): bigint {
    this.ensure(8);
    const v = this.buf.readBigUInt64LE(this.off);
    this.off += 8;
    return v;
  }

  i64(): bigint {
    this.ensure(8);
    const v = this.buf.readBigInt64LE(this.off);
    this.off += 8;
    return v;
  }

  bool(): boolean {
    return this.u8() === 1;
  }

  fixedBytes(n: number): Buffer {
    this.ensure(n);
    const out = Buffer.from(this.buf.subarray(this.off, this.off + n));
    this.off += n;
    return out;
  }

  vec<T>(readItem: (r: BorshReader) => T): T[] {
    const len = this.u32();
    const out: T[] = [];
    for (let i = 0; i < len; i++) out.push(readItem(this));
    return out;
  }

  option<T>(readSome: (r: BorshReader) => T): T | null {
    const tag = this.u8();
    if (tag === 0) return null;
    if (tag === 1) return readSome(this);
    throw new Error(`BorshReader: invalid Option tag ${tag}`);
  }

  /** Skip N bytes (used to skip the Anchor 8-byte discriminator). */
  skip(n: number): this {
    this.ensure(n);
    this.off += n;
    return this;
  }

  remaining(): number {
    return this.buf.length - this.off;
  }
}
