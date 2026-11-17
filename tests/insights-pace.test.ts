import { describe, expect, it } from "vitest";
import { paceRows, paceStatus, topAlert } from "@/lib/insights/pace";
import { rangeFor } from "@/lib/insights/ranges";
import type { CategoryInfo, SpendRow } from "@/lib/insights/spending";

const NOW = new Date("2026-11-17T18:00:00Z"); // about 54% through November

describe("paceStatus", () => {
  it("is on track within 10 points of the calendar", () => {
    expect(paceStatus(6000, 10000, 54)).toBe("on_track"); // 60% vs 54%
  });
  it("is ahead of pace more than 10 points over", () => {
    expect(paceStatus(7000, 10000, 54)).toBe("ahead_of_pace"); // 70% vs 54%
  });
  it("is over budget past 100%", () => {
    expect(paceStatus(10001, 10000, 54)).toBe("over_budget");
  });
  it("a $0 budget with spending is over budget", () => {
    expect(paceStatus(100, 0, 54)).toBe("over_budget");
    expect(paceStatus(0, 0, 54)).toBe("on_track");
  });
});

describe("paceRows", () => {
  const cats: CategoryInfo[] = [
    { slug: "food", name: "Food", budgetCents: 20_000, period: "month" },
    { slug: "events", name: "Events", budgetCents: 50_000, period: "month" },
    { slug: "travel", name: "Travel", budgetCents: 10_000, period: "month" },
    { slug: "gone", name: "Gone", budgetCents: 1, period: "month", archived: true },
  ];
  const rows: SpendRow[] = [
    { category: "food", total_cents: 18_000, status: "paid", decided_at: "2026-11-10T20:00:00Z" },
    { category: "events", total_cents: 10_000, status: "paid", decided_at: "2026-11-10T20:00:00Z" },
    { category: "travel", total_cents: 12_000, status: "approved", decided_at: "2026-11-10T20:00:00Z" },
  ];
  const result = paceRows(rows, rangeFor("month", NOW), cats, NOW);

  it("covers active categories only", () => {
    expect(result.map((r) => r.slug)).toEqual(["food", "events", "travel"]);
  });
  it("works out each status", () => {
    expect(result.map((r) => r.status)).toEqual(["ahead_of_pace", "on_track", "over_budget"]);
    expect(result[0].percentUsed).toBe(90);
    expect(result[2].percentUsed).toBe(120);
    expect(result[0].elapsedPercent).toBeGreaterThan(50);
  });
  it("the top alert is over budget before ahead of pace", () => {
    expect(topAlert(result)?.text).toBe("Travel is over budget");
    expect(topAlert(result.slice(0, 2))?.text).toBe("Food is ahead of pace");
    expect(topAlert(result.slice(1, 2))).toBeNull();
  });
});
