// Settle x Ika sidetrack — Phase C API validation tests.
//
// Covers the input validation surface for the `/api/crosschain/sign` and
// `/api/crosschain/cards` route handlers, exercised through the shared
// helpers in `crosschain-validation.ts` so server and tests share one schema.

import { describe, expect, it } from "vitest";
import { validateCardsQuery, validateSignRequest } from "./crosschain-validation.js";

const PUB_A = "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp";
const PUB_B = "FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK";
const HEX = "a".repeat(64);
const UUID = "11111111-2222-3333-4444-555555555555";

describe("crosschain validation — POST /api/crosschain/sign", () => {
  const valid = {
    card_pubkey: PUB_A,
    request_id: UUID,
    message_digest_hex: HEX,
    user_pubkey_hex: HEX,
    signature_scheme: 0,
    approval_pda: PUB_B,
  };

  it("accepts a fully valid payload", () => {
    const r = validateSignRequest(valid);
    expect(r.ok).toBe(true);
  });

  it("rejects missing required fields", () => {
    const r = validateSignRequest({ card_pubkey: PUB_A });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // At minimum should flag request_id, message_digest_hex, user_pubkey_hex,
      // signature_scheme, approval_pda.
      expect(r.errors.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("rejects garbage card_pubkey", () => {
    const r = validateSignRequest({ ...valid, card_pubkey: "not-a-pubkey" });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.some((e) => e.includes("card_pubkey"))).toBe(true);
  });

  it("rejects non-UUID request_id", () => {
    const r = validateSignRequest({ ...valid, request_id: "abc" });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.some((e) => e.includes("request_id"))).toBe(true);
  });

  it("rejects too-short message_digest_hex", () => {
    const r = validateSignRequest({
      ...valid,
      message_digest_hex: "abcd",
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(
        r.errors.some((e) => e.includes("message_digest_hex")),
      ).toBe(true);
  });

  it("rejects out-of-range signature_scheme", () => {
    const r1 = validateSignRequest({ ...valid, signature_scheme: -1 });
    const r2 = validateSignRequest({ ...valid, signature_scheme: 7 });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it("rejects timeout_ms outside 1000..60000", () => {
    const r1 = validateSignRequest({ ...valid, timeout_ms: 999 });
    const r2 = validateSignRequest({ ...valid, timeout_ms: 60_001 });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it("accepts valid timeout_ms in range", () => {
    const r = validateSignRequest({ ...valid, timeout_ms: 15_000 });
    expect(r.ok).toBe(true);
  });
});

describe("crosschain validation — GET /api/crosschain/cards", () => {
  it("accepts a valid Solana pubkey", () => {
    const r = validateCardsQuery({ pubkey: PUB_A });
    expect(r.ok).toBe(true);
  });

  it("rejects missing pubkey", () => {
    const r = validateCardsQuery({});
    expect(r.ok).toBe(false);
  });

  it("rejects malformed pubkey", () => {
    expect(validateCardsQuery({ pubkey: "abc" }).ok).toBe(false);
    expect(validateCardsQuery({ pubkey: "0x1234" }).ok).toBe(false);
  });
});
