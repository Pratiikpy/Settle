import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  wrapWithSettle,
  SettlePaymentRequiredError,
  type McpToolRequest,
  type SettleCredentialEnvelope,
} from "./index.js";

const PUBKEY_A = "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp";
const PUBKEY_B = "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY";
const HEX64 = "a".repeat(64);
const SIG_HEX = "b".repeat(128);
const NONCE = "11111111-2222-3333-4444-555555555555";

function freshCredential(overrides: Partial<SettleCredentialEnvelope> = {}): SettleCredentialEnvelope {
  return {
    card_pubkey: PUBKEY_A,
    agent_pubkey: PUBKEY_B,
    signature_hex: SIG_HEX,
    nonce: NONCE,
    expires_at: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  };
}

function reqWithCred(name: string, cred: SettleCredentialEnvelope | null): McpToolRequest {
  const params: McpToolRequest["params"] = {
    name,
    arguments: { foo: "bar" },
  };
  if (cred) params._meta = { settle_credential: cred };
  return { params };
}

describe("wrapWithSettle", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("free tools (not in pricing) pass through unchanged", async () => {
    const inner = vi.fn(async () => ({ content: [{ type: "text", text: "hi" }] }));
    const wrapped = wrapWithSettle({
      handler: inner,
      pricing: {},
      settleEndpoint: "https://example.com",
      merchantPubkey: PUBKEY_B,
      log: () => {},
    });
    const out = await wrapped(reqWithCred("ping", null));
    expect(inner).toHaveBeenCalledOnce();
    expect(out.content[0]?.text).toBe("hi");
  });

  it("paid tool with no credential throws SettlePaymentRequiredError", async () => {
    const inner = vi.fn();
    const wrapped = wrapWithSettle({
      handler: async () => ({ content: [] }),
      pricing: { translate: { amount_lamports: "1000", capability_hash: HEX64 } },
      settleEndpoint: "https://example.com",
      merchantPubkey: PUBKEY_B,
      log: () => {},
    });
    await expect(wrapped(reqWithCred("translate", null))).rejects.toThrow(
      SettlePaymentRequiredError,
    );
    expect(inner).not.toHaveBeenCalled();
  });

  it("paid tool with expired credential throws", async () => {
    const wrapped = wrapWithSettle({
      handler: async () => ({ content: [] }),
      pricing: { translate: { amount_lamports: "1000", capability_hash: HEX64 } },
      settleEndpoint: "https://example.com",
      merchantPubkey: PUBKEY_B,
      log: () => {},
    });
    const cred = freshCredential({
      expires_at: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(wrapped(reqWithCred("translate", cred))).rejects.toThrow(
      SettlePaymentRequiredError,
    );
  });

  it("paid tool — facilitator ALLOW invokes inner handler", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ ok: true, decision: "ALLOW", request_id: NONCE }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as typeof fetch;

    const inner = vi.fn(async () => ({
      content: [{ type: "text", text: "translated" }],
    }));
    const wrapped = wrapWithSettle({
      handler: inner,
      pricing: { translate: { amount_lamports: "20000", capability_hash: HEX64 } },
      settleEndpoint: "https://example.com",
      merchantPubkey: PUBKEY_B,
      log: () => {},
    });
    const out = await wrapped(reqWithCred("translate", freshCredential()));
    expect(inner).toHaveBeenCalledOnce();
    expect(out.content[0]?.text).toBe("translated");
  });

  it("paid tool — facilitator DENY throws and does NOT call inner handler", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ ok: true, decision: "DENY", message: "OffAllowlist" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as typeof fetch;

    const inner = vi.fn();
    const wrapped = wrapWithSettle({
      handler: async () => ({ content: [] }),
      pricing: { translate: { amount_lamports: "1000", capability_hash: HEX64 } },
      settleEndpoint: "https://example.com",
      merchantPubkey: PUBKEY_B,
      log: () => {},
    });
    await expect(wrapped(reqWithCred("translate", freshCredential()))).rejects.toThrow(
      SettlePaymentRequiredError,
    );
    expect(inner).not.toHaveBeenCalled();
  });

  it("paid tool — facilitator unreachable counts as DENY", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const inner = vi.fn();
    const wrapped = wrapWithSettle({
      handler: async () => ({ content: [] }),
      pricing: { translate: { amount_lamports: "1000", capability_hash: HEX64 } },
      settleEndpoint: "https://example.com",
      merchantPubkey: PUBKEY_B,
      log: () => {},
    });
    await expect(wrapped(reqWithCred("translate", freshCredential()))).rejects.toThrow(
      SettlePaymentRequiredError,
    );
    expect(inner).not.toHaveBeenCalled();
  });

  it("logs every outcome with correct outcome label", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ ok: true, decision: "ALLOW", request_id: NONCE }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as typeof fetch;

    const events: string[] = [];
    const wrapped = wrapWithSettle({
      handler: async () => ({ content: [] }),
      pricing: { translate: { amount_lamports: "1000", capability_hash: HEX64 } },
      settleEndpoint: "https://example.com",
      merchantPubkey: PUBKEY_B,
      log: (ev) => events.push(ev.outcome),
    });
    await wrapped(reqWithCred("translate", freshCredential()));
    expect(events).toContain("allowed");
  });
});
