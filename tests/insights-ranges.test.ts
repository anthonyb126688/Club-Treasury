import { describe, expect, it } from "vitest";
import { inRange, monthKey, parseRange, rangeFor } from "@/lib/insights/ranges";

// Nov 17, 2026, noon in Chicago (18:00 UTC).
const NOW = new Date("2026-11-17T18:00:00Z");

describe("parseRange", () => {
  it("accepts the three ranges and defaults to month", () => {
    expect(parseRange("semester")).toBe("semester");
    expect(parseRange("year")).toBe("year");
    expect(parseRange("week")).toBe("month");
    expect(parseRange(null)).toBe("month");
  });
});

describe("monthKey (Chicago time)", () => {
  it("puts a late-night Oct 31 Chicago payment in October, though it's November in UTC", () => {
    expect(monthKey("2026-11-01T03:30:00Z")).toBe("2026-10");
    expect(monthKey("2026-11-01T06:30:00Z")).toBe("2026-11");
  });
  it("is null for missing dates", () => {
    expect(monthKey(null)).toBeNull();
    expect(monthKey("not a date")).toBeNull();
  });
});

describe("rangeFor", () => {
  it("month = this calendar month", () => {
    const r = rangeFor("month", NOW);
    expect(r.label).toBe("November 2026");
    expect(r.months).toEqual([{ key: "2026-11", label: "Nov", partial: true }]);
    expect(r.periodMonths).toBe(1);
    expect(r.elapsedShare).toBeGreaterThan(0.5);
    expect(r.elapsedShare).toBeLessThan(0.6);
    expect(r.queryFrom).toBe("2026-10-31");
  });

  it("semester = Fall (Aug–Dec), months so far", () => {
    const r = rangeFor("semester", NOW);
    expect(r.label).toBe("Fall 2026");
    expect(r.months.map((m) => m.key)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(r.periodMonths).toBe(5);
    expect(r.months.at(-1)?.partial).toBe(true);
    expect(r.months[0].partial).toBe(false);
    expect(r.elapsedShare).toBeGreaterThan(0.7);
    expect(r.elapsedShare).toBeLessThan(0.75);
  });

  it("spring semester is Jan–May", () => {
    const r = rangeFor("semester", new Date("2027-03-10T18:00:00Z"));
    expect(r.label).toBe("Spring 2027");
    expect(r.months.map((m) => m.key)).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(r.periodMonths).toBe(5);
  });

  it("year = the last 12 months, across the year boundary", () => {
    const r = rangeFor("year", NOW);
    expect(r.months).toHaveLength(12);
    expect(r.months[0].key).toBe("2025-12");
    expect(r.months[11].key).toBe("2026-11");
    expect(r.queryFrom).toBe("2025-11-30");
  });

  it("inRange checks Chicago months", () => {
    const r = rangeFor("month", NOW);
    expect(inRange(r, "2026-11-05T12:00:00Z")).toBe(true);
    expect(inRange(r, "2026-11-01T03:00:00Z")).toBe(false); // still Oct 31 in Chicago
    expect(inRange(r, null)).toBe(false);
  });
});
