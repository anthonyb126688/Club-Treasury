import { describe, expect, it } from "vitest";
import { formatUsd } from "@/lib/money";

describe("formatUsd", () => {
  it("shows zero as $0.00", () => {
    expect(formatUsd(BigInt(0))).toBe("$0.00");
  });

  it("shows whole dollars", () => {
    expect(formatUsd(BigInt(18_000_000))).toBe("$18.00");
  });

  it("shows cents", () => {
    expect(formatUsd(BigInt(25_500_000))).toBe("$25.50");
    expect(formatUsd(BigInt(10_000))).toBe("$0.01");
  });

  it("rounds fractions of a cent down, never up", () => {
    expect(formatUsd(BigInt(9_999))).toBe("$0.00");
    expect(formatUsd(BigInt(1_999_999))).toBe("$1.99");
  });

  it("adds thousands separators", () => {
    expect(formatUsd(BigInt(5_000_000_000))).toBe("$5,000.00");
    expect(formatUsd(BigInt(1_234_567_890_000))).toBe("$1,234,567.89");
  });

  it("handles negative amounts", () => {
    expect(formatUsd(BigInt(-400_000_000))).toBe("-$400.00");
  });
});
