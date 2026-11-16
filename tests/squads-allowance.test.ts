import { describe, expect, it } from "vitest";
import {
  allowanceRemaining,
  isSpendingLimitExceeded,
  ONE_DAY_SECONDS,
  type AllowanceState,
} from "@/lib/solana/allowance";

const $ = (dollars: number) => BigInt(dollars * 1_000_000);

const state: AllowanceState = {
  amount: $(150),
  remaining: $(40),
  lastReset: BigInt(1_000_000),
  periodSeconds: ONE_DAY_SECONDS,
};

describe("allowanceRemaining", () => {
  it("is what's left during the day", () => {
    expect(allowanceRemaining(state, state.lastReset + BigInt(3600))).toBe($(40));
  });

  it("still hasn't refilled at exactly 24 hours (Squads needs MORE than a period)", () => {
    expect(allowanceRemaining(state, state.lastReset + ONE_DAY_SECONDS)).toBe($(40));
  });

  it("refills to the full $150 after a day", () => {
    expect(allowanceRemaining(state, state.lastReset + ONE_DAY_SECONDS + BigInt(1))).toBe($(150));
  });

  it("a one-time limit never refills", () => {
    const once = { ...state, periodSeconds: null };
    expect(allowanceRemaining(once, state.lastReset + BigInt(10) * ONE_DAY_SECONDS)).toBe($(40));
  });
});

describe("isSpendingLimitExceeded", () => {
  it.each([
    "Simulation failed: custom program error: 0x178a",
    'Transaction failed {"InstructionError":[1,{"Custom":6026}]}',
    "Error: SpendingLimitExceeded",
  ])("recognizes %j", (msg) => {
    expect(isSpendingLimitExceeded(new Error(msg))).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isSpendingLimitExceeded(new Error("custom program error: 0x1"))).toBe(false);
    expect(isSpendingLimitExceeded(new Error("blockhash not found"))).toBe(false);
  });
});
