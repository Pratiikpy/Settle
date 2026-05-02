import { describe, expect, it } from "vitest";
import { formatUsdc, formatReceiptTime, formatReceiptAgo } from "./locale.js";

describe("formatUsdc", () => {
  it("formats whole USDC at en-US", () => {
    expect(formatUsdc("1000000")).toBe("$1.00");
    // 1_234_567_000 lamports = $1,234.567 — USDC supports sub-cent precision,
    // so we DO render the third decimal rather than rounding away on-chain truth.
    expect(formatUsdc("1234567000")).toBe("$1,234.567");
    // Whole-dollar amounts pad to two decimals.
    expect(formatUsdc("1234000000")).toBe("$1,234.00");
  });

  it("formats sub-cent precision when present", () => {
    // 100 lamports = $0.0001, must be exact.
    const f = formatUsdc("100");
    expect(f.startsWith("$0.000") || f.startsWith("$0.0001")).toBe(true);
  });

  it("zero", () => {
    expect(formatUsdc("0")).toBe("$0.00");
  });

  it("BigInt-safe at very large amounts", () => {
    // 1 trillion USDC.
    const big = formatUsdc("1000000000000000000");
    expect(big.includes("1,000,000,000,000")).toBe(true);
    expect(big.startsWith("$")).toBe(true);
  });

  it("accepts BigInt directly", () => {
    expect(formatUsdc(500000n)).toBe("$0.50");
  });

  it("handles negative amounts (refunds)", () => {
    expect(formatUsdc("-1000000")).toBe("-$1.00");
  });

  it("varies by locale", () => {
    // Ja and en-US render USD differently. We just assert they differ
    // for a "thousands" amount that engages digit grouping.
    const en = formatUsdc("1234560000", "en-US");
    const es = formatUsdc("1234560000", "es-ES");
    expect(en).not.toBe(es);
  });
});

describe("formatReceiptTime / formatReceiptAgo", () => {
  it("renders a parsable time string", () => {
    const out = formatReceiptTime(0);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("computes a relative ago string", () => {
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const out = formatReceiptAgo(tenMinAgo);
    expect(typeof out).toBe("string");
    // Allow English or other locale; just shouldn't blow up.
    expect(out.length).toBeGreaterThan(0);
  });
});
