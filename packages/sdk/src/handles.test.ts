import { describe, expect, it } from "vitest";
import { displayHandle, parseHandleInput } from "./handles.js";

describe("parseHandleInput", () => {
  it("parses bare handle", () => {
    expect(parseHandleInput("pratiik")).toEqual({ kind: "settle", value: "pratiik" });
  });
  it("parses @handle (strips @)", () => {
    expect(parseHandleInput("@pratiik")).toEqual({ kind: "settle", value: "pratiik" });
  });
  it("lowercases settle handles", () => {
    expect(parseHandleInput("@Pratiik")).toEqual({ kind: "settle", value: "pratiik" });
  });
  it("parses .sol domain", () => {
    expect(parseHandleInput("pratiik.sol")).toEqual({ kind: "sns", value: "pratiik.sol" });
  });
  it("parses base58 pubkey", () => {
    const pk = "Card1111111111111111111111111111111111111a";
    expect(parseHandleInput(pk)).toEqual({ kind: "pubkey", value: pk });
  });
  it("rejects empty input", () => {
    expect(() => parseHandleInput("   ")).toThrow();
  });
  it("rejects invalid characters", () => {
    expect(() => parseHandleInput("@bad handle")).toThrow();
  });
  it("rejects too-short handles", () => {
    expect(() => parseHandleInput("@a")).toThrow();
  });
  it("rejects too-long handles", () => {
    expect(() => parseHandleInput("@" + "x".repeat(33))).toThrow();
  });
});

describe("displayHandle", () => {
  it("formats settle as @handle", () => {
    expect(displayHandle({ kind: "settle", value: "pratiik" })).toBe("@pratiik");
  });
  it("formats sns as full domain", () => {
    expect(displayHandle({ kind: "sns", value: "pratiik.sol" })).toBe("pratiik.sol");
  });
  it("truncates pubkey", () => {
    const pk = "Card1111111111111111111111111111111111111a";
    expect(displayHandle({ kind: "pubkey", value: pk })).toBe("Card…111a");
  });
});
