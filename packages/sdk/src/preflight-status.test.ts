import { describe, expect, it } from "vitest";
import {
  relayerStatus,
  liveModeStatus,
  cronSecretStatus,
  webhookSigningStatus,
  summarizeChecks,
} from "./preflight-status.js";

describe("relayerStatus", () => {
  it("yellow when privkey unset", () => {
    const r = relayerStatus({
      privkeyB58: undefined,
      decodedPubkey: null,
      decodeError: null,
    });
    expect(r.status).toBe("yellow");
    expect(r.hint).toMatch(/SETTLE_RELAYER_PRIVKEY/);
  });

  it("red when privkey set but decode fails", () => {
    const r = relayerStatus({
      privkeyB58: "garbage",
      decodedPubkey: null,
      decodeError: "Non-base58 character",
    });
    expect(r.status).toBe("red");
    expect(r.hint).toMatch(/Decode failed/);
  });

  it("green when privkey decodes successfully", () => {
    const r = relayerStatus({
      privkeyB58: "anything",
      decodedPubkey: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp",
      decodeError: null,
    });
    expect(r.status).toBe("green");
    expect(r.hint).toContain("B4cArR1M");
  });

  it("hint includes the pubkey on green so operators see WHICH key", () => {
    const r = relayerStatus({
      privkeyB58: "x",
      decodedPubkey: "TEST_PUBKEY_123",
      decodeError: null,
    });
    expect(r.hint).toContain("TEST_PUBKEY_123");
  });
});

describe("liveModeStatus", () => {
  it("green only when env is exactly 'true'", () => {
    expect(liveModeStatus("true").status).toBe("green");
  });

  it("yellow when unset, false, or any non-true value", () => {
    expect(liveModeStatus(undefined).status).toBe("yellow");
    expect(liveModeStatus("false").status).toBe("yellow");
    expect(liveModeStatus("True").status).toBe("yellow"); // case-sensitive
    expect(liveModeStatus("1").status).toBe("yellow");
    expect(liveModeStatus("").status).toBe("yellow");
  });
});

describe("cronSecretStatus", () => {
  it("red when unset", () => {
    expect(cronSecretStatus(undefined).status).toBe("red");
  });

  it("yellow when too short (<16 chars)", () => {
    expect(cronSecretStatus("short").status).toBe("yellow");
    expect(cronSecretStatus("a".repeat(15)).status).toBe("yellow");
  });

  it("green at exactly 16 chars and longer", () => {
    expect(cronSecretStatus("a".repeat(16)).status).toBe("green");
    expect(cronSecretStatus("a".repeat(64)).status).toBe("green");
  });
});

describe("webhookSigningStatus", () => {
  it("yellow when unset (signed-but-not-required floor)", () => {
    expect(webhookSigningStatus(undefined).status).toBe("yellow");
  });

  it("green when set (any non-empty)", () => {
    expect(webhookSigningStatus("secret").status).toBe("green");
  });
});

describe("summarizeChecks", () => {
  it("counts each tone independently", () => {
    const s = summarizeChecks([
      { name: "a", status: "green", hint: "" },
      { name: "b", status: "green", hint: "" },
      { name: "c", status: "yellow", hint: "" },
      { name: "d", status: "red", hint: "" },
    ]);
    expect(s.green).toBe(2);
    expect(s.yellow).toBe(1);
    expect(s.red).toBe(1);
  });

  it("ok is true iff no red checks", () => {
    expect(summarizeChecks([]).ok).toBe(true);
    expect(
      summarizeChecks([{ name: "a", status: "green", hint: "" }]).ok,
    ).toBe(true);
    expect(
      summarizeChecks([{ name: "a", status: "yellow", hint: "" }]).ok,
    ).toBe(true);
    expect(
      summarizeChecks([{ name: "a", status: "red", hint: "" }]).ok,
    ).toBe(false);
  });

  it("yellow alone doesn't fail ok — it's a warning, not a blocker", () => {
    const s = summarizeChecks([
      { name: "a", status: "yellow", hint: "" },
      { name: "b", status: "yellow", hint: "" },
      { name: "c", status: "green", hint: "" },
    ]);
    expect(s.ok).toBe(true);
    expect(s.yellow).toBe(2);
  });
});
