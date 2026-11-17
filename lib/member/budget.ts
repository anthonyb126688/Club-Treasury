// Club budget view for members: per category, how much is budgeted, spent
// and left this period. Pure, tested in tests/member-budget.test.ts.
//
// "Spent" uses the same rule as the policy engine (loadPolicyContext in
// lib/reimburse/server.ts): approved, paid or payout-failed requests in that
// category, decided on or after the start of the category's current period.
import { currentPeriod } from "@/lib/dues/period";
import type { BudgetPeriod } from "@/lib/policy/rules";

/** Request statuses that count as money spent from a budget. */
export const SPENT_STATUSES = ["auto_approved", "approved", "paid", "payment_failed"] as const;

export type BudgetCategoryInput = {
  slug: string;
  name: string;
  budgetCents: number;
  period: BudgetPeriod;
};

export type SpentRow = {
  category: string | null;
  total_cents: number | null;
  status: string;
  decided_at: string | null; // ISO timestamp
};

export type BudgetLine = {
  slug: string;
  name: string;
  period: BudgetPeriod;
  periodPhrase: string; // "this month" / "this semester"
  periodLabel: string; // "November 2026" / "Fall 2026"
  budgetCents: number;
  spentCents: number;
  remainingCents: number; // never below 0
  overByCents: number; // how far over budget (0 if not over)
  percentUsed: number; // 0–100, for the bar
};

export function periodPhrase(period: BudgetPeriod): string {
  return period === "month" ? "this month" : "this semester";
}

/** Budget math for one category. */
export function budgetMath(budgetCents: number, spentCents: number) {
  const budget = Math.max(0, budgetCents);
  const spent = Math.max(0, spentCents);
  const percentUsed = budget === 0 ? (spent > 0 ? 100 : 0) : Math.min(100, Math.round((spent / budget) * 100));
  return {
    remainingCents: Math.max(0, budget - spent),
    overByCents: Math.max(0, spent - budget),
    percentUsed,
  };
}

/** The earliest period start among these categories (for one DB query). */
export function earliestPeriodStart(categories: BudgetCategoryInput[], now: Date = new Date()): string {
  const starts = categories.map((c) => currentPeriod(c.period, now).startsOn);
  if (starts.length === 0) return currentPeriod("month", now).startsOn;
  return starts.sort()[0];
}

export function summarizeBudgets(
  categories: BudgetCategoryInput[],
  rows: SpentRow[],
  now: Date = new Date(),
): BudgetLine[] {
  return categories.map((c) => {
    const period = currentPeriod(c.period, now);
    const startMs = Date.parse(`${period.startsOn}T00:00:00Z`);
    let spentCents = 0;
    for (const r of rows) {
      if (r.category !== c.slug || !r.total_cents || !r.decided_at) continue;
      if (!(SPENT_STATUSES as readonly string[]).includes(r.status)) continue;
      const decided = Date.parse(r.decided_at);
      if (Number.isNaN(decided) || decided < startMs) continue;
      spentCents += r.total_cents;
    }
    return {
      slug: c.slug,
      name: c.name,
      period: c.period,
      periodPhrase: periodPhrase(c.period),
      periodLabel: period.label,
      budgetCents: c.budgetCents,
      spentCents,
      ...budgetMath(c.budgetCents, spentCents),
    };
  });
}
