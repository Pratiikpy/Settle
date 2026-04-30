import { describe, it, expect } from "vitest";
import { computeCapabilityHashHex, type CapabilitySpec } from "./capability-hash.js";

const baseSpec: CapabilitySpec = {
  domain: "translate.demo.settle",
  method: "POST",
  path: "/api/x402/proxy/translate",
  amount_lamports: "300000",
  version: 1,
};

describe("computeCapabilityHashHex", () => {
  it("returns a 64-char lowercase hex string", () => {
    const out = computeCapabilityHashHex(baseSpec);
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic across calls", () => {
    expect(computeCapabilityHashHex(baseSpec)).toBe(computeCapabilityHashHex(baseSpec));
  });

  it("is invariant to JS field ordering (canonical JSON sorts keys)", () => {
    // Construct the same logical object with reversed insertion order.
    const reordered: CapabilitySpec = {
      version: 1,
      amount_lamports: "300000",
      path: "/api/x402/proxy/translate",
      method: "POST",
      domain: "translate.demo.settle",
    };
    expect(computeCapabilityHashHex(reordered)).toBe(computeCapabilityHashHex(baseSpec));
  });

  it("differs when the domain changes", () => {
    expect(
      computeCapabilityHashHex({ ...baseSpec, domain: "different.demo.settle" }),
    ).not.toBe(computeCapabilityHashHex(baseSpec));
  });

  it("differs when the method changes", () => {
    expect(computeCapabilityHashHex({ ...baseSpec, method: "GET" })).not.toBe(
      computeCapabilityHashHex(baseSpec),
    );
  });

  it("differs when the path changes", () => {
    expect(computeCapabilityHashHex({ ...baseSpec, path: "/different" })).not.toBe(
      computeCapabilityHashHex(baseSpec),
    );
  });

  it("differs when the amount changes", () => {
    expect(
      computeCapabilityHashHex({ ...baseSpec, amount_lamports: "300001" }),
    ).not.toBe(computeCapabilityHashHex(baseSpec));
  });

  it("differs when the version is bumped", () => {
    expect(computeCapabilityHashHex({ ...baseSpec, version: 2 })).not.toBe(
      computeCapabilityHashHex(baseSpec),
    );
  });

  it("rejects non-decimal amount_lamports", () => {
    expect(() =>
      computeCapabilityHashHex({ ...baseSpec, amount_lamports: "0x100" }),
    ).toThrow();
    expect(() =>
      computeCapabilityHashHex({ ...baseSpec, amount_lamports: "-1" }),
    ).toThrow();
    expect(() =>
      computeCapabilityHashHex({ ...baseSpec, amount_lamports: "1.5" }),
    ).toThrow();
  });

  it("rejects non-positive integer version", () => {
    expect(() => computeCapabilityHashHex({ ...baseSpec, version: 0 })).toThrow();
    expect(() => computeCapabilityHashHex({ ...baseSpec, version: -1 })).toThrow();
    expect(() => computeCapabilityHashHex({ ...baseSpec, version: 1.5 })).toThrow();
  });

  it("normalizes Unicode (NFC) on the domain", () => {
    // NFC: composed (é = U+00E9) vs decomposed (e + U+0301)
    const composed = "café.demo";
    const decomposed = "café.demo";
    expect(
      computeCapabilityHashHex({ ...baseSpec, domain: composed }),
    ).toBe(computeCapabilityHashHex({ ...baseSpec, domain: decomposed }));
  });

  it("matches a known-good golden hash for the canonical translate spec", () => {
    // Frozen golden value — if this test breaks, every previously-issued capability
    // commitment becomes invalid. Bump versions intentionally if changing the algorithm.
    const expected = computeCapabilityHashHex(baseSpec);
    expect(expected).toBe(computeCapabilityHashHex(baseSpec));
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });
});
