import { describe, expect, it } from "vitest";
import { rangeFor } from "@/lib/insights/ranges";
import {
  budgetForRange,
  categoryTotals,
  monthlyBudgetCents,
  perMonthBudgetCents,
  spendingByMonth,
  spentInRange,
  type CategoryInfo,
  type SpendRow,
} from "@/lib/insights/spending";

const NOW = new Date("2026-11-17T18:00:00Z");
const CATS: CategoryInfo[] = [
  { slug: "food", name: "Food", budgetCents: 20_000, period: "month" },
  { slug: "events", name: "Events", budgetCents: 50_000, period: "semester" },
  { slug: "old", name: "Old stuff", budgetCents: 9_900, period: "month", archived: true },
];

const rows: SpendRow[] = [
  { category: "food", total_cents: 1800, status: "paid", decided_at: "2026-11-16T20:00:00Z" },
  { category: "food", total_cents: 1000, status: "auto_approved", decided_at: "2026-11-10T20:00:00Z" },
  { category: "events", total_cents: 40000, status: "paid", decided_at: "2026-10-05T20:00:00Z" },
  { category: "food", total_cents: 999, status: "queued", decided_at: null }, // not spent
  { category: "food", total_cents: 500, status: "rejected", decided_at: "2026-11-12T20:00:00Z" }, // not spent
  { category: "travel", total_cents: 700, status: "payment_failed", decided_at: "2026-11-12T20:00:00Z" },
];

describe("spentInRange", () => {
  it("uses the same spent statuses as the overview", () => {
    expect(spentInRange(rows, rangeFor("month", NOW)).map((r) => r.total_cents)).toEqual([1800, 1000, 700]);
  });
});

describe("spendingByMonth", () => {
  it("buckets by month and category", () => {
    const months = spendingByMonth(rows, rangeFor("semester", NOW));
    expect(months.map((m) => m.totalCents)).toEqual([0, 0, 40000, 3500]);
    expect(months[3].byCategory).toEqual({ food: 2800, travel: 700 });
    expect(months[3].partial).toBe(true);
  });
});

describe("categoryTotals", () => {
  it("sums per category, biggest first, unknown slugs keep their slug", () => {
    expect(categoryTotals(rows, rangeFor("semester", NOW), CATS)).toEqual([
      { slug: "events", name: "Events", totalCents: 40000 },
      { slug: "food", name: "Food", totalCents: 2800 },
      { slug: "travel", name: "travel", totalCents: 700 },
    ]);
  });
});

describe("budgets", () => {
  it("spreads a semester budget over its months (Fall = 5)", () => {
    expect(perMonthBudgetCents(CATS[1], NOW)).toBe(10_000);
    expect(perMonthBudgetCents(CATS[0], NOW)).toBe(20_000);
  });
  it("the monthly budget line skips archived categories", () => {
    expect(monthlyBudgetCents(CATS, NOW)).toBe(30_000);
  });
  it("budget for a range", () => {
    expect(budgetForRange(CATS[0], rangeFor("month", NOW), NOW)).toBe(20_000);
    expect(budgetForRange(CATS[0], rangeFor("semester", NOW), NOW)).toBe(100_000);
    expect(budgetForRange(CATS[1], rangeFor("semester", NOW), NOW)).toBe(50_000);
    expect(budgetForRange(CATS[1], rangeFor("month", NOW), NOW)).toBe(10_000);
    expect(budgetForRange(CATS[0], rangeFor("year", NOW), NOW)).toBe(240_000);
    expect(budgetForRange(CATS[1], rangeFor("year", NOW), NOW)).toBe(120_000);
  });
});
