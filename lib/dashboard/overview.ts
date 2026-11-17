// Overview math for the treasurer dashboard: dues progress, spending, and
// budget bars. Pure, tested in tests/dashboard-overview.test.ts.
import { currentPeriod } from "@/lib/dues/period";
import type { BudgetPeriod } from "@/lib/policy/rules";

/** Statuses that count as money spent from a category's budget (same as the policy engine). */
export const SPENT_STATUSES = ["auto_approved", "approved", "paid", "payment_failed"] as const;

export type DuesProgress = {
  collectedCents: number;
  expectedCents: number;
  paidCount: number;
  memberCount: number;
};

/**
 * Dues collected vs expected this period. `payments` are this period's
 * sent dues; each member counts once even if (somehow) listed twice.
 */
export function duesProgress(
  payments: { privy_user_id: string; amount_cents: number | null }[],
  activeMembers: number,
  duesAmountCents: number,
): DuesProgress {
  const payers = new Set(payments.map((p) => p.privy_user_id));
  return {
    collectedCents: payments.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0),
    expectedCents: activeMembers * duesAmountCents,
    paidCount: payers.size,
    memberCount: activeMembers,
  };
}

/** First day of this month (UTC), as YYYY-MM-DD. */
export function monthStart(now: Date = new Date()): string {
  return currentPeriod("month", now).startsOn;
}

/** Sum of total_cents for rows on or after `since` (YYYY-MM-DD) by the given date field. */
export function sumSince<T extends { total_cents: number | null }>(
  rows: T[],
  dateOf: (row: T) => string | null,
  since: string,
): number {
  return rows.reduce((sum, r) => {
    const day = dateOf(r)?.slice(0, 10);
    return day && day >= since ? sum + (r.total_cents ?? 0) : sum;
  }, 0);
}

export type BudgetCategory = { slug: string; name: string; budgetCents: number; period: BudgetPeriod };

export type BudgetBar = {
  slug: string;
  name: string;
  period: BudgetPeriod;
  periodLabel: string; // "November 2026" / "Fall 2026"
  budgetCents: number;
  spentCents: number;
  /** 0–100 for the bar width; null when the category has no budget. */
  percent: number | null;
  over: boolean;
};

/** The earliest period start among these categories (to fetch spending once). */
export function earliestStart(categories: BudgetCategory[], now: Date = new Date()): string {
  const starts = categories.map((c) => currentPeriod(c.period, now).startsOn);
  return starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : monthStart(now);
}

/**
 * Budget vs actual for each category in its own current period (month or
 * semester). `spent` rows have a SPENT_STATUSES status; they're counted by
 * decided_at, like lib/reimburse/server.ts loadPolicyContext.
 */
export function budgetBars(
  categories: BudgetCategory[],
  spent: { category: string | null; total_cents: number | null; decided_at: string | null }[],
  now: Date = new Date(),
): BudgetBar[] {
  return categories.map((c) => {
    const period = currentPeriod(c.period, now);
    const spentCents = sumSince(
      spent.filter((r) => r.category === c.slug),
      (r) => r.decided_at,
      period.startsOn,
    );
    const percent = c.budgetCents > 0 ? Math.min(100, Math.round((spentCents / c.budgetCents) * 100)) : null;
    return {
      slug: c.slug,
      name: c.name,
      period: c.period,
      periodLabel: period.label,
      budgetCents: c.budgetCents,
      spentCents,
      percent,
      over: spentCents > c.budgetCents,
    };
  });
}
