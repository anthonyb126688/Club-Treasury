import { describe, expect, it } from "vitest";
import { centsToUnits } from "@/lib/money";
import { MEMO_MAX_BYTES, explorerTxUrl, validateMemo } from "@/lib/solana/memo";

describe("centsToUnits", () => {
  it("converts cents to on-chain units (6 decimals)", () => {
    expect(centsToUnits(100)).toBe(BigInt(1_000_000)); // $1.00
    expect(centsToUnits(1)).toBe(BigInt(10_000)); // $0.01
    expect(centsToUnits(40_000)).toBe(BigInt(400_000_000)); // $400.00
  });

  it("refuses zero, negative, fractional, and unsafe amounts", () => {
    expect(() => centsToUnits(0)).toThrow();
    expect(() => centsToUnits(-100)).toThrow();
    expect(() => centsToUnits(1.5)).toThrow();
    expect(() => centsToUnits(Number.NaN)).toThrow();
    expect(() => centsToUnits(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});

describe("validateMemo", () => {
  it("accepts a normal reference", () => {
    expect(validateMemo("club-treasury:dues:abc123")).toBe("club-treasury:dues:abc123");
  });

  it("rejects empty, too-long, and control-character memos", () => {
    expect(() => validateMemo("")).toThrow();
    expect(() => validateMemo("x".repeat(MEMO_MAX_BYTES + 1))).toThrow();
    expect(() => validateMemo("line1\nline2")).toThrow();
  });

  it("counts bytes, not characters", () => {
    expect(() => validateMemo("é".repeat(MEMO_MAX_BYTES))).toThrow();
  });
});

describe("explorerTxUrl", () => {
  it("links to the devnet explorer", () => {
    expect(explorerTxUrl("5abc")).toBe("https://explorer.solana.com/tx/5abc?cluster=devnet");
  });
});
