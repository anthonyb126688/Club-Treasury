import { describe, expect, it } from "vitest";
import {
  budgetUse,
  CategoryPatchBody,
  earliestPeriodStart,
  NewCategoryBody,
  planNewCategory,
  renameAllowed,
  spentThisPeriod,
  type ExistingCategory,
  type SpentRow,
} from "@/lib/budget/categories";

const cat = (over: Partial<ExistingCategory> & { slug: string }): ExistingCategory => ({
  id: `id-${over.slug}`,
  name: over.slug.charAt(0).toUpperCase() + over.slug.slice(1),
  archived: false,
  ...over,
});

const EXISTING = [cat({ slug: "food" }), cat({ slug: "travel" }), cat({ slug: "other" })];

describe("planNewCategory", () => {
  it("makes a slug from the name", () => {
    expect(planNewCategory("Club T-shirts", EXISTING)).toEqual({ kind: "create", slug: "club-t-shirts" });
  });

  it("rejects the reserved Other slug", () => {
    expect(planNewCategory("Other", EXISTING)).toEqual({ kind: "error", error: "reserved" });
    expect(planNewCategory("  OTHER! ", [])).toEqual({ kind: "error", error: "reserved" });
  });

  it("rejects names with no letters or numbers", () => {
    expect(planNewCategory("!!!", EXISTING)).toEqual({ kind: "error", error: "bad_name" });
  });

  it("rejects a name an active category already has (any case)", () => {
    expect(planNewCategory("FOOD", EXISTING)).toEqual({ kind: "error", error: "name_taken" });
  });

  it("restores an archived category with the same slug, keeping its history", () => {
    const existing = [...EXISTING, cat({ slug: "events", archived: true })];
    expect(planNewCategory("Events", existing)).toEqual({ kind: "restore", id: "id-events", slug: "events" });
  });

  it("gives a fresh slug when an active, renamed category holds it", () => {
    const existing = [cat({ slug: "food", name: "Snacks" })];
    expect(planNewCategory("Food", existing)).toEqual({ kind: "create", slug: "food-2" });
    expect(planNewCategory("Food", [...existing, cat({ slug: "food-2", name: "Meals" })])).toEqual({
      kind: "create",
      slug: "food-3",
    });
  });

  it("keeps suffixed slugs within 40 characters and valid", () => {
    const long = "a".repeat(40);
    const plan = planNewCategory("A".repeat(45), [cat({ slug: long, name: "Something else" })]);
    expect(plan.kind).toBe("create");
    if (plan.kind === "create") expect(plan.slug).toMatch(/^[a-z0-9-]{1,40}$/);
  });
});

describe("renameAllowed", () => {
  it("allows renaming to a new name or a different case of its own", () => {
    expect(renameAllowed("id-food", "Snacks", EXISTING)).toBe(true);
    expect(renameAllowed("id-food", "FOOD", EXISTING)).toBe(true);
  });
  it("blocks taking another active category's name", () => {
    expect(renameAllowed("id-food", "travel", EXISTING)).toBe(false);
  });
  it("ignores archived categories", () => {
    expect(renameAllowed("id-food", "Events", [...EXISTING, cat({ slug: "events", archived: true })])).toBe(true);
  });
});

describe("category bodies", () => {
  it("trims names and accepts whole cents", () => {
    expect(NewCategoryBody.parse({ name: "  Club   shirts ", budgetCents: 15_000, period: "semester" })).toEqual({
      name: "Club shirts",
      budgetCents: 15_000,
      period: "semester",
    });
  });
  it("rejects fractions, negatives, huge amounts, long or empty names, bad periods", () => {
    const bad = [
      { name: "Food", budgetCents: 10.5, period: "month" },
      { name: "Food", budgetCents: -1, period: "month" },
      { name: "Food", budgetCents: 10_000_001, period: "month" },
      { name: "x".repeat(41), budgetCents: 0, period: "month" },
      { name: "   ", budgetCents: 0, period: "month" },
      { name: "Food", budgetCents: 0, period: "year" },
    ];
    for (const b of bad) expect(NewCategoryBody.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });
  it("a patch needs at least one field", () => {
    expect(CategoryPatchBody.safeParse({}).success).toBe(false);
    expect(CategoryPatchBody.safeParse({ budgetCents: 0 }).success).toBe(true);
  });
});

describe("spent and remaining", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const rows: SpentRow[] = [
    { category: "food", total_cents: 1_800, decided_at: "2026-11-03T18:00:00+00:00" },
    { category: "food", total_cents: 2_000, decided_at: "2026-10-20T18:00:00+00:00" }, // last month
    { category: "food", total_cents: null, decided_at: "2026-11-04T18:00:00+00:00" },
    { category: "travel", total_cents: 5_000, decided_at: "2026-11-01T00:00:00+00:00" },
    { category: "food", total_cents: 999, decided_at: null },
  ];

  it("fetches from the earliest period start (the semester)", () => {
    expect(earliestPeriodStart(now)).toBe("2026-08-01");
  });

  it("counts only this period, this category", () => {
    expect(spentThisPeriod("food", "month", rows, now)).toBe(1_800);
    expect(spentThisPeriod("food", "semester", rows, now)).toBe(3_800);
    expect(spentThisPeriod("travel", "month", rows, now)).toBe(5_000); // the 1st counts
    expect(spentThisPeriod("supplies", "month", rows, now)).toBe(0);
  });

  it("remaining never goes below zero; over shows how far over", () => {
    expect(budgetUse(20_000, 1_800)).toEqual({ spentCents: 1_800, remainingCents: 18_200, overCents: 0, percentUsed: 9 });
    expect(budgetUse(10_000, 12_500)).toEqual({ spentCents: 12_500, remainingCents: 0, overCents: 2_500, percentUsed: 100 });
  });

  it("a $0 budget is empty, or full once anything is spent", () => {
    expect(budgetUse(0, 0).percentUsed).toBe(0);
    expect(budgetUse(0, 100)).toMatchObject({ remainingCents: 0, overCents: 100, percentUsed: 100 });
  });
});
