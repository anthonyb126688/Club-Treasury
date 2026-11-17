import { describe, expect, it } from "vitest";
import { normalizeVendor, topVendors } from "@/lib/insights/vendors";

describe("topVendors", () => {
  it("groups by name ignoring case and spacing, shows the most common spelling", () => {
    const result = topVendors([
      { vendor: "Tony's Pizza", total_cents: 1800 },
      { vendor: "tony's  pizza ", total_cents: 1800 },
      { vendor: "Tony's Pizza", total_cents: 1800 },
      { vendor: "Corner Market", total_cents: 1000 },
      { vendor: null, total_cents: 9999 },
      { vendor: "   ", total_cents: 9999 },
    ]);
    expect(result).toEqual([
      { name: "Tony's Pizza", totalCents: 5400, count: 3 },
      { name: "Corner Market", totalCents: 1000, count: 1 },
    ]);
  });

  it("keeps only the top 5", () => {
    const rows = ["a", "b", "c", "d", "e", "f", "g"].map((v, i) => ({ vendor: v, total_cents: (i + 1) * 100 }));
    expect(topVendors(rows).map((v) => v.name)).toEqual(["g", "f", "e", "d", "c"]);
  });

  it("normalizes", () => {
    expect(normalizeVendor("  Bean   There COFFEE ")).toBe("bean there coffee");
  });
});
