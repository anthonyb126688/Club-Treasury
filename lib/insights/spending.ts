// Spending for the Insights page: per month (stacked by category), category
// totals, and the monthly budget line. Pure, tested in
// tests/insights-spending.test.ts.
//
// "Spent" means exactly what the treasurer overview means: requests with a
// SPENT_STATUSES status, counted by decided_at (lib/dashboard/overview.ts).
import { SPENT_STATUSES } from "@/lib/dashboard/overview";
import type { BudgetPeriod } from "@/lib/policy/rules";
import { inRange, monthKey, semesterOf, chicagoYearMonth, type InsightRange } from "./ranges";

export type SpendRow = {
  category: string | null;
  total_cents: number | null;
  status: string;
  decided_at: string | null;
  decided_by?: string | null;
  vendor?: string | null;
  privy_user_id?: string;
};

export type CategoryInfo = { slug: string; name: string; budgetCents: number; period: BudgetPeriod; archived?: boolean };

const SPENT = new Set<string>(SPENT_STATUSES);

/** Rows that count as spent and were decided inside the range. */
export function spentInRange<T extends SpendRow>(rows: T[], range: InsightRange): T[] {
  return rows.filter((r) => SPENT.has(r.status) && inRange(range, r.decided_at));
}

export type MonthSpending = {
  key: string;
  label: string;
  partial: boolean;
  totalCents: number;
  byCategory: Record<string, number>;
};

export function spendingByMonth(rows: SpendRow[], range: InsightRange): MonthSpending[] {
  const spent = spentInRange(rows, range);
  return range.months.map((m) => {
    const byCategory: Record<string, number> = {};
    let totalCents = 0;
    for (const r of spent) {
      if (monthKey(r.decided_at) !== m.key) continue;
      const cents = r.total_cents ?? 0;
      const cat = r.category ?? "other";
      byCategory[cat] = (byCategory[cat] ?? 0) + cents;
      totalCents += cents;
    }
    return { key: m.key, label: m.label, partial: m.partial, totalCents, byCategory };
  });
}

export type CategoryTotal = { slug: string; name: string; totalCents: number };

/** Total spent per category in the range, biggest first. Categories with nothing spent are left out. */
export function categoryTotals(rows: SpendRow[], range: InsightRange, categories: CategoryInfo[]): CategoryTotal[] {
  const names = new Map(categories.map((c) => [c.slug, c.name]));
  const totals = new Map<string, number>();
  for (const r of spentInRange(rows, range)) {
    const cat = r.category ?? "other";
    totals.set(cat, (totals.get(cat) ?? 0) + (r.total_cents ?? 0));
  }
  return [...totals.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([slug, totalCents]) => ({ slug, name: names.get(slug) ?? slug, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name));
}

/** One category's budget per month: semester budgets are spread over the semester's months. */
export function perMonthBudgetCents(c: Pick<CategoryInfo, "budgetCents" | "period">, now: Date = new Date()): number {
  if (c.period === "month") return c.budgetCents;
  const { month } = chicagoYearMonth(now);
  return Math.round(c.budgetCents / semesterOf(month).length);
}

/** The dashed budget line: the sum of every active category's budget, per month. */
export function monthlyBudgetCents(categories: CategoryInfo[], now: Date = new Date()): number {
  return categories.filter((c) => !c.archived).reduce((sum, c) => sum + perMonthBudgetCents(c, now), 0);
}

/** One category's budget for the whole range (e.g. a month budget × 5 for a semester). */
export function budgetForRange(c: Pick<CategoryInfo, "budgetCents" | "period">, range: InsightRange, now: Date = new Date()): number {
  const { month } = chicagoYearMonth(now);
  if (range.kind === "semester" && c.period === "semester") return c.budgetCents;
  if (range.kind === "month" && c.period === "month") return c.budgetCents;
  if (c.period === "semester" && range.kind === "year") {
    return Math.round((c.budgetCents / semesterOf(month).length) * 12);
  }
  return perMonthBudgetCents(c, now) * range.periodMonths;
}
