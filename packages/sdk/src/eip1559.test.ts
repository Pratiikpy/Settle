// Phase D — pure RLP / EIP-1559 helper tests.
//
// Tests the deterministic encoding pieces that the cross-chain sign flow
// depends on. These are the highest-leverage tests because if RLP / digest
// computation is wrong, no signature we produce will be valid on the
// target chain.

import { describe, expect, it } from "vitest";
import {
  bigIntToMinimalBytes,
  buildSignedSepoliaTx,
  buildUnsignedSepoliaTxDigest,
  bytesToHex,
  evmAddressBytes,
  hexToBytes0x,
  rlpBytes,
  rlpList,
  type UnsignedSepoliaTx,
} from "./eip1559.js";

// ── RLP primitives ──

describe("RLP — single byte string", () => {
  it("encodes [0x00] as itself when < 0x80", () => {
    expect(Array.from(rlpBytes(new Uint8Array([0x42])))).toEqual([0x42]);
  });

  it("encodes a byte ≥ 0x80 with 0x81 prefix", () => {
    expect(Array.from(rlpBytes(new Uint8Array([0x80])))).toEqual([0x81, 0x80]);
  });

  it("encodes empty bytes as [0x80]", () => {
    expect(Array.from(rlpBytes(new Uint8Array()))).toEqual([0x80]);
  });

  it("encodes a 55-byte string with 0xb7 length prefix", () => {
    const b = new Uint8Array(55).fill(0xab);
    const out = rlpBytes(b);
    expect(out[0]).toBe(0x80 + 55);
    expect(out.length).toBe(56);
  });

  it("encodes a 56-byte string with long-form 0xb8 length prefix", () => {
    const b = new Uint8Array(56).fill(0xab);
    const out = rlpBytes(b);
    expect(out[0]).toBe(0xb8);
    expect(out[1]).toBe(56);
    expect(out.length).toBe(2 + 56);
  });
});

describe("RLP — list", () => {
  it("encodes empty list as [0xc0]", () => {
    expect(Array.from(rlpList([]))).toEqual([0xc0]);
  });

  it("encodes a 3-string list", () => {
    const out = rlpList([rlpBytes(Uint8Array.of(1)), rlpBytes(Uint8Array.of(2)), rlpBytes(Uint8Array.of(3))]);
    expect(out[0]).toBe(0xc3);
    expect(Array.from(out.subarray(1))).toEqual([1, 2, 3]);
  });
});

// ── bigint <-> minimal bytes ──

describe("bigIntToMinimalBytes", () => {
  it("encodes 0 as empty", () => {
    expect(Array.from(bigIntToMinimalBytes(0n))).toEqual([]);
  });

  it("encodes 256 as [0x01, 0x00]", () => {
    expect(Array.from(bigIntToMinimalBytes(256n))).toEqual([0x01, 0x00]);
  });

  it("encodes 11_155_111 (Sepolia chainId) as 3 bytes (no leading zero)", () => {
    const out = bigIntToMinimalBytes(11_155_111n);
    expect(out.length).toBe(3);
    expect(bytesToHex(out)).toBe("aa36a7");
  });

  it("rejects negative bigints", () => {
    expect(() => bigIntToMinimalBytes(-1n)).toThrow();
  });
});

// ── Hex helpers ──

describe("hex helpers", () => {
  it("hexToBytes0x round-trip is identity (with and without 0x prefix)", () => {
    const b = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(bytesToHex(b)).toBe("deadbeef");
    expect(Array.from(hexToBytes0x("deadbeef"))).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(Array.from(hexToBytes0x("0xDEADBEEF"))).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it("hexToBytes0x rejects odd length", () => {
    expect(() => hexToBytes0x("a")).toThrow();
  });

  it("evmAddressBytes accepts 20-byte 0x address", () => {
    const out = evmAddressBytes("0xabcdef0123456789abcdef0123456789abcdef01");
    expect(out.length).toBe(20);
  });

  it("evmAddressBytes rejects malformed addresses", () => {
    expect(() => evmAddressBytes("0xabc")).toThrow();
    expect(() => evmAddressBytes("not-an-address")).toThrow();
    expect(() => evmAddressBytes("0xZZZZ0123456789abcdef0123456789abcdef0123")).toThrow();
  });
});

// ── EIP-1559 digest ──

describe("EIP-1559 unsigned tx digest", () => {
  const baseTx = (overrides: Partial<UnsignedSepoliaTx> = {}): UnsignedSepoliaTx => ({
    chainId: 11_155_111n,
    nonce: 0n,
    maxPriorityFeePerGas: 1_500_000_000n, // 1.5 gwei
    maxFeePerGas: 30_000_000_000n, // 30 gwei
    gasLimit: 21_000n,
    to: evmAddressBytes("0x1111111111111111111111111111111111111111"),
    value: 5_000_000_000_000_000n, // 0.005 ETH
    data: new Uint8Array(),
    accessList: [],
    ...overrides,
  });

  it("produces a 32-byte keccak digest with 0x02 envelope prefix", () => {
    const tx = baseTx();
    const { payload, digest } = buildUnsignedSepoliaTxDigest(tx);
    expect(payload[0]).toBe(0x02);
    expect(digest.length).toBe(32);
  });

  it("digest is deterministic across runs", () => {
    const tx = baseTx();
    const a = buildUnsignedSepoliaTxDigest(tx);
    const b = buildUnsignedSepoliaTxDigest(tx);
    expect(bytesToHex(a.digest)).toBe(bytesToHex(b.digest));
  });

  it("digest changes when any field changes", () => {
    const baseDigest = bytesToHex(buildUnsignedSepoliaTxDigest(baseTx()).digest);
    const nonceDigest = bytesToHex(buildUnsignedSepoliaTxDigest(baseTx({ nonce: 1n })).digest);
    const valueDigest = bytesToHex(buildUnsignedSepoliaTxDigest(baseTx({ value: 5_000_000_000_000_001n })).digest);
    const recipientDigest = bytesToHex(
      buildUnsignedSepoliaTxDigest(
        baseTx({ to: evmAddressBytes("0x2222222222222222222222222222222222222222") }),
      ).digest,
    );
    expect(baseDigest).not.toBe(nonceDigest);
    expect(baseDigest).not.toBe(valueDigest);
    expect(baseDigest).not.toBe(recipientDigest);
  });

  it("rejects `to` that isn't 20 bytes", () => {
    expect(() => buildUnsignedSepoliaTxDigest(baseTx({ to: new Uint8Array(19) }))).toThrow();
  });
});

// ── Signed tx reconstruction ──

describe("EIP-1559 signed tx reconstruction", () => {
  it("rejects signatureRS that isn't 64 bytes", () => {
    expect(() =>
      buildSignedSepoliaTx({
        tx: {
          chainId: 11_155_111n,
          nonce: 0n,
          maxPriorityFeePerGas: 1n,
          maxFeePerGas: 1n,
          gasLimit: 21_000n,
          to: new Uint8Array(20),
          value: 0n,
          data: new Uint8Array(),
          accessList: [],
        },
        signatureRS: new Uint8Array(63),
        yParity: 0,
      }),
    ).toThrow();
  });

  it("produces a 0x02-prefixed envelope for a valid 64-byte signature", () => {
    const out = buildSignedSepoliaTx({
      tx: {
        chainId: 11_155_111n,
        nonce: 0n,
        maxPriorityFeePerGas: 1n,
        maxFeePerGas: 1n,
        gasLimit: 21_000n,
        to: new Uint8Array(20),
        value: 0n,
        data: new Uint8Array(),
        accessList: [],
      },
      signatureRS: new Uint8Array(64).fill(0xab),
      yParity: 0,
    });
    expect(out[0]).toBe(0x02);
  });
});
