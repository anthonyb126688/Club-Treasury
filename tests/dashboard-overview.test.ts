import { describe, expect, it } from "vitest";
import { budgetBars, duesProgress, earliestStart, monthStart, sumSince } from "@/lib/dashboard/overview";

const now = new Date("2026-11-16T12:00:00Z");

describe("duesProgress", () => {
  it("compares dues collected with what every active member owes", () => {
    const p = duesProgress(
      [
        { privy_user_id: "a", amount_cents: 2500 },
        { privy_user_id: "b", amount_cents: 2500 },
      ],
      5,
      2500,
    );
    expect(p).toEqual({ collectedCents: 5000, expectedCents: 12_500, paidCount: 2, memberCount: 5 });
  });

  it("counts each member once", () => {
    const p = duesProgress(
      [
        { privy_user_id: "a", amount_cents: 2500 },
        { privy_user_id: "a", amount_cents: 2500 },
      ],
      1,
      2500,
    );
    expect(p.paidCount).toBe(1);
  });

  it("handles a club with no members yet", () => {
    expect(duesProgress([], 0, 2500)).toEqual({ collectedCents: 0, expectedCents: 0, paidCount: 0, memberCount: 0 });
  });
});

describe("spending this month", () => {
  it("starts on the first of the month", () => {
    expect(monthStart(now)).toBe("2026-11-01");
  });

  it("only counts rows on or after the start", () => {
    const rows = [
      { total_cents: 1800, paid_at: "2026-11-01T00:00:01Z" },
      { total_cents: 40_000, paid_at: "2026-11-15T20:00:00Z" },
      { total_cents: 999, paid_at: "2026-10-31T23:59:59Z" },
      { total_cents: 500, paid_at: null },
    ];
    expect(sumSince(rows, (r) => r.paid_at, "2026-11-01")).toBe(41_800);
  });
});

describe("budgetBars", () => {
  const categories = [
    { slug: "food", name: "Food", budgetCents: 20_000, period: "month" as const },
    { slug: "events", name: "Events", budgetCents: 50_000, period: "semester" as const },
    { slug: "other", name: "Other", budgetCents: 0, period: "month" as const },
  ];
  const spent = [
    { category: "food", total_cents: 1800, decided_at: "2026-11-10T10:00:00Z" },
    { category: "food", total_cents: 5000, decided_at: "2026-10-20T10:00:00Z" }, // last month
    { category: "events", total_cents: 40_000, decided_at: "2026-09-02T10:00:00Z" }, // this semester
    { category: "events", total_cents: 20_000, decided_at: "2026-11-02T10:00:00Z" },
    { category: "other", total_cents: 700, decided_at: "2026-11-03T10:00:00Z" },
  ];

  it("counts spending in each category's own period", () => {
    const [food, events, other] = budgetBars(categories, spent, now);
    expect(food).toMatchObject({ spentCents: 1800, percent: 9, over: false, periodLabel: "November 2026" });
    expect(events).toMatchObject({ spentCents: 60_000, percent: 100, over: true, periodLabel: "Fall 2026" });
    expect(other).toMatchObject({ spentCents: 700, percent: null, over: true });
  });

  it("fetches from the earliest period start", () => {
    expect(earliestStart(categories, now)).toBe("2026-08-01");
    expect(earliestStart([], now)).toBe("2026-11-01");
  });
});
