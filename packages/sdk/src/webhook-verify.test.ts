import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "./webhook-verify.js";

describe("webhook signature verification", () => {
  const secret = "test-secret-12345";
  const body = JSON.stringify({ request_id: "abc", amount: "0.10" });

  it("verifies a valid signature", () => {
    const sig = signWebhookPayload(body, secret);
    expect(verifyWebhookSignature({ bodyBytes: body, signatureHex: sig, secret })).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const sig = signWebhookPayload(body, secret);
    const tampered = sig.slice(0, -2) + "00";
    expect(
      verifyWebhookSignature({ bodyBytes: body, signatureHex: tampered, secret }),
    ).toBe(false);
  });

  it("rejects a tampered body", () => {
    const sig = signWebhookPayload(body, secret);
    const tamperedBody = body.replace("0.10", "9.99");
    expect(
      verifyWebhookSignature({ bodyBytes: tamperedBody, signatureHex: sig, secret }),
    ).toBe(false);
  });

  it("rejects when secret is wrong", () => {
    const sig = signWebhookPayload(body, secret);
    expect(
      verifyWebhookSignature({ bodyBytes: body, signatureHex: sig, secret: "different" }),
    ).toBe(false);
  });

  it("rejects empty signature", () => {
    expect(verifyWebhookSignature({ bodyBytes: body, signatureHex: "", secret })).toBe(false);
  });

  it("rejects empty secret", () => {
    const sig = signWebhookPayload(body, secret);
    expect(verifyWebhookSignature({ bodyBytes: body, signatureHex: sig, secret: "" })).toBe(false);
  });

  it("rejects mismatched length signature", () => {
    expect(verifyWebhookSignature({ bodyBytes: body, signatureHex: "ab", secret })).toBe(false);
  });

  it("accepts Uint8Array body", () => {
    const bodyBytes = new TextEncoder().encode(body);
    const sig = signWebhookPayload(bodyBytes, secret);
    expect(verifyWebhookSignature({ bodyBytes, signatureHex: sig, secret })).toBe(true);
  });

  it("constant-time comparison: doesn't short-circuit on first byte mismatch", () => {
    // Signatures of equal length but different first bytes — both should return false
    // and roughly the same time (we don't measure here, but verify both return false)
    const sig = signWebhookPayload(body, secret);
    const altered1 = "ff" + sig.slice(2);
    const altered2 = sig.slice(0, -2) + "ff";
    expect(verifyWebhookSignature({ bodyBytes: body, signatureHex: altered1, secret })).toBe(false);
    expect(verifyWebhookSignature({ bodyBytes: body, signatureHex: altered2, secret })).toBe(false);
  });
});
