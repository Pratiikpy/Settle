import { describe, expect, it } from "vitest";
import {
  sealedBoxDecryptString,
  sealedBoxDecryptWithPrivkey,
  sealedBoxEncryptToPubkey,
  sealedBoxKeygen,
} from "./sealed-box.js";

describe("sealed-box round-trip", () => {
  it("encrypts and decrypts a short string", () => {
    const { publicKey, privateKey } = sealedBoxKeygen();
    const sealed = sealedBoxEncryptToPubkey("hello world", publicKey);
    expect(sealedBoxDecryptString(sealed, privateKey)).toBe("hello world");
  });

  it("encrypts and decrypts JSON", () => {
    const { publicKey, privateKey } = sealedBoxKeygen();
    const data = { request_id: "abc-123", purpose: "Translate JA paper", amount: "0.30" };
    const sealed = sealedBoxEncryptToPubkey(JSON.stringify(data), publicKey);
    const decrypted = JSON.parse(sealedBoxDecryptString(sealed, privateKey));
    expect(decrypted).toEqual(data);
  });

  it("encrypts and decrypts large payloads (10KB)", () => {
    const { publicKey, privateKey } = sealedBoxKeygen();
    const large = "x".repeat(10_000);
    const sealed = sealedBoxEncryptToPubkey(large, publicKey);
    expect(sealedBoxDecryptString(sealed, privateKey)).toBe(large);
  });

  it("encrypts and decrypts unicode (NFC + emoji)", () => {
    const { publicKey, privateKey } = sealedBoxKeygen();
    const unicode = "café 🚀 日本語 ‍👨‍👩‍👧";
    const sealed = sealedBoxEncryptToPubkey(unicode, publicKey);
    expect(sealedBoxDecryptString(sealed, privateKey)).toBe(unicode);
  });

  it("returns ciphertext that's longer than plaintext (MAC + ephemeral pubkey)", () => {
    const { publicKey } = sealedBoxKeygen();
    const sealed = sealedBoxEncryptToPubkey("hello", publicKey);
    // 32 (ephemeral pub) + 5 (plaintext) + 16 (poly1305 MAC) = 53 bytes
    expect(sealed.length).toBe(53);
  });

  it("encrypts deterministically when ephemeral priv is provided", () => {
    const { publicKey } = sealedBoxKeygen();
    const ephPriv = new Uint8Array(32).fill(7);
    const sealed1 = sealedBoxEncryptToPubkey("test", publicKey, ephPriv);
    const sealed2 = sealedBoxEncryptToPubkey("test", publicKey, ephPriv);
    expect(sealed1).toEqual(sealed2);
  });

  it("encrypts non-deterministically by default (random ephemeral)", () => {
    const { publicKey } = sealedBoxKeygen();
    const sealed1 = sealedBoxEncryptToPubkey("test", publicKey);
    const sealed2 = sealedBoxEncryptToPubkey("test", publicKey);
    // Should differ because ephemeral keypair is fresh each time
    expect(sealed1).not.toEqual(sealed2);
  });

  it("rejects decryption with wrong private key", () => {
    const alice = sealedBoxKeygen();
    const bob = sealedBoxKeygen();
    const sealed = sealedBoxEncryptToPubkey("secret", alice.publicKey);
    expect(() => sealedBoxDecryptWithPrivkey(sealed, bob.privateKey)).toThrow();
  });

  it("rejects tampered ciphertext (MAC fails)", () => {
    const { publicKey, privateKey } = sealedBoxKeygen();
    const sealed = sealedBoxEncryptToPubkey("test", publicKey);
    const before = sealed[40] ?? 0;
    sealed.set([before ^ 0xff], 40); // flip a byte in the ciphertext region
    expect(() => sealedBoxDecryptWithPrivkey(sealed, privateKey)).toThrow();
  });

  it("rejects tampered ephemeral pubkey", () => {
    const { publicKey, privateKey } = sealedBoxKeygen();
    const sealed = sealedBoxEncryptToPubkey("test", publicKey);
    const before = sealed[5] ?? 0;
    sealed.set([before ^ 0xff], 5); // flip a byte in the ephemeral pubkey region
    expect(() => sealedBoxDecryptWithPrivkey(sealed, privateKey)).toThrow();
  });

  it("rejects truncated ciphertext", () => {
    const { publicKey, privateKey } = sealedBoxKeygen();
    const sealed = sealedBoxEncryptToPubkey("test", publicKey);
    const truncated = sealed.subarray(0, 40);
    expect(() => sealedBoxDecryptWithPrivkey(truncated, privateKey)).toThrow();
  });

  it("rejects pubkey of wrong length", () => {
    const { privateKey } = sealedBoxKeygen();
    const badPub = new Uint8Array(31);
    expect(() => sealedBoxEncryptToPubkey("test", badPub)).toThrow();
    expect(() => sealedBoxDecryptWithPrivkey(new Uint8Array(48), new Uint8Array(31))).toThrow();
  });

  it("two senders to same recipient produce different ciphertexts", () => {
    const { publicKey, privateKey } = sealedBoxKeygen();
    const sealed1 = sealedBoxEncryptToPubkey("same plaintext", publicKey);
    const sealed2 = sealedBoxEncryptToPubkey("same plaintext", publicKey);
    expect(sealed1).not.toEqual(sealed2);
    // Both decrypt to same plaintext
    expect(sealedBoxDecryptString(sealed1, privateKey)).toBe("same plaintext");
    expect(sealedBoxDecryptString(sealed2, privateKey)).toBe("same plaintext");
  });
});
