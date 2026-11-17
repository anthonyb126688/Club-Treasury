import { describe, expect, it } from "vitest";
import { budgetMath, earliestPeriodStart, periodPhrase, summarizeBudgets, type SpentRow } from "@/lib/member/budget";

const NOW = new Date("2026-11-16T15:00:00Z"); // November, Fall semester

const categories = [
  { slug: "food", name: "Food", budgetCents: 20000, period: "month" as const },
  { slug: "events", name: "Events", budgetCents: 50000, period: "semester" as const },
  { slug: "other", name: "Other", budgetCents: 0, period: "month" as const },
];

const row = (category: string, cents: number, decided: string | null, status = "paid"): SpentRow => ({
  category,
  total_cents: cents,
  status,
  decided_at: decided,
});

describe("budget math", () => {
  it("computes remaining and percent", () => {
    expect(budgetMath(20000, 5000)).toEqual({ remainingCents: 15000, overByCents: 0, percentUsed: 25 });
  });

  it("never shows negative remaining; reports how far over", () => {
    expect(budgetMath(20000, 25000)).toEqual({ remainingCents: 0, overByCents: 5000, percentUsed: 100 });
  });

  it("handles a zero budget", () => {
    expect(budgetMath(0, 0).percentUsed).toBe(0);
    expect(budgetMath(0, 100)).toEqual({ remainingCents: 0, overByCents: 100, percentUsed: 100 });
  });

  it("labels periods", () => {
    expect(periodPhrase("month")).toBe("this month");
    expect(periodPhrase("semester")).toBe("this semester");
  });
});

describe("summarizeBudgets", () => {
  it("counts only spent statuses inside each category's current period", () => {
    const rows = [
      row("food", 1800, "2026-11-02T10:00:00+00:00"), // this month
      row("food", 2200, "2026-11-15T23:59:00Z", "auto_approved"),
      row("food", 999, "2026-10-31T23:59:00Z"), // last month: not counted
      row("food", 500, "2026-11-10T00:00:00Z", "payment_failed"), // counts (same as policy)
      row("food", 700, "2026-11-10T00:00:00Z", "queued"), // not decided: not counted
      row("food", 800, "2026-11-10T00:00:00Z", "rejected"),
      row("food", 900, null, "approved"), // no decision time: not counted
      row("events", 40000, "2026-09-01T00:00:00Z", "approved"), // this semester (Fall starts Aug 1)
      row("events", 15000, "2026-07-31T00:00:00Z"), // last semester
      row("other", 1234, "2026-11-03T00:00:00Z"),
    ];
    const [food, events, other] = summarizeBudgets(categories, rows, NOW);
    expect(food).toMatchObject({
      spentCents: 4500,
      remainingCents: 15500,
      percentUsed: 23,
      periodPhrase: "this month",
      periodLabel: "November 2026",
    });
    expect(events).toMatchObject({
      spentCents: 40000,
      remainingCents: 10000,
      percentUsed: 80,
      periodPhrase: "this semester",
      periodLabel: "Fall 2026",
    });
    expect(other).toMatchObject({ spentCents: 1234, overByCents: 1234 });
  });

  it("queries from the earliest period start", () => {
    expect(earliestPeriodStart(categories, NOW)).toBe("2026-08-01");
    expect(earliestPeriodStart([categories[0]], NOW)).toBe("2026-11-01");
    expect(earliestPeriodStart([], NOW)).toBe("2026-11-01");
  });
});
