import { describe, expect, it } from "vitest";
import { budgetRing, dollarsToCents } from "@/lib/member/ring";

describe("dollarsToCents", () => {
  it("reads formatted dollar strings", () => {
    expect(dollarsToCents("$0.00")).toBe(0);
    expect(dollarsToCents("$18.00")).toBe(1800);
    expect(dollarsToCents("$1,234.56")).toBe(123456);
    expect(dollarsToCents("$5.5")).toBe(550);
    expect(dollarsToCents("12")).toBe(1200);
  });
  it("rejects junk", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("-$5.00")).toBeNull();
  });
});

describe("budgetRing", () => {
  it("adds up only budgeted categories", () => {
    const ring = budgetRing([
      { spent: "$30.50", budget: "$200.00", hasBudget: true },
      { spent: "$400.00", budget: "$500.00", hasBudget: true },
      { spent: "$99.00", budget: "$0.00", hasBudget: false },
    ]);
    expect(ring).toEqual({ spentCents: 43050, budgetCents: 70000, percent: 62, over: false });
  });
  it("caps the ring at 100% and flags over budget", () => {
    const ring = budgetRing([{ spent: "$300.00", budget: "$200.00", hasBudget: true }]);
    expect(ring?.percent).toBe(100);
    expect(ring?.over).toBe(true);
  });
  it("is null when nothing has a budget", () => {
    expect(budgetRing([])).toBeNull();
    expect(budgetRing([{ spent: "$5.00", budget: "$0.00", hasBudget: false }])).toBeNull();
  });
});
