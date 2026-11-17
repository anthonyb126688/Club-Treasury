// Budget builder rules: what a category name/amount may be, which slug a new
// category gets, and how much of each budget is spent. Pure, tested in
// tests/budget.test.ts. (The DB side is lib/budget/server.ts.)
import { z } from "zod";
import { currentPeriod } from "@/lib/dues/period";
import { OTHER_CATEGORY, slugify, type BudgetPeriod } from "@/lib/policy/rules";

/** Biggest budget a category can have: $100,000 per period. */
export const MAX_BUDGET_CENTS = 10_000_000;

export const SLUG_PATTERN = /^[a-z0-9-]{1,40}$/;

const Name = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1).max(40));
const BudgetCents = z.number().int().min(0).max(MAX_BUDGET_CENTS);
const Period = z.enum(["month", "semester"]);

export const NewCategoryBody = z.object({ name: Name, budgetCents: BudgetCents, period: Period });
export const CategoryPatchBody = z
  .object({ name: Name.optional(), budgetCents: BudgetCents.optional(), period: Period.optional() })
  .refine((b) => b.name !== undefined || b.budgetCents !== undefined || b.period !== undefined);

export type ExistingCategory = { id: string; slug: string; name: string; archived: boolean };

export type NewCategoryPlan =
  | { kind: "create"; slug: string }
  | { kind: "restore"; id: string; slug: string } // bring back an archived one (keeps its history)
  | { kind: "error"; error: "bad_name" | "reserved" | "name_taken" };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Where a new category called `name` should go:
 *  - "other" is reserved (every club already has it);
 *  - an active category with the same name → "name_taken";
 *  - an archived category with the same slug → restore it, so its past
 *    requests show up under it again;
 *  - an active category with the same slug but a different name (it was
 *    renamed) → a fresh slug like "food-2".
 */
export function planNewCategory(name: string, existing: ExistingCategory[]): NewCategoryPlan {
  const slug = slugify(name);
  if (!SLUG_PATTERN.test(slug)) return { kind: "error", error: "bad_name" };
  if (slug === OTHER_CATEGORY) return { kind: "error", error: "reserved" };
  if (existing.some((c) => !c.archived && sameName(c.name, name))) return { kind: "error", error: "name_taken" };

  const bySlug = new Map(existing.map((c) => [c.slug, c]));
  const clash = bySlug.get(slug);
  if (!clash) return { kind: "create", slug };
  if (clash.archived) return { kind: "restore", id: clash.id, slug };

  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const candidate = `${slug.slice(0, 40 - suffix.length).replace(/-+$/, "")}${suffix}`;
    const other = bySlug.get(candidate);
    if (!other) return { kind: "create", slug: candidate };
    if (other.archived) return { kind: "restore", id: other.id, slug: candidate };
  }
  return { kind: "error", error: "name_taken" };
}

/** Can `id` be renamed to `name`? (No two active categories share a name.) */
export function renameAllowed(id: string, name: string, existing: ExistingCategory[]): boolean {
  return !existing.some((c) => c.id !== id && !c.archived && sameName(c.name, name));
}

// ---- Spent / remaining ----------------------------------------------------------

/** Request statuses that count as money spent from a budget (same as lib/reimburse). */
export const SPENT_STATUSES = ["auto_approved", "approved", "paid", "payment_failed"] as const;

export type SpentRow = { category: string | null; total_cents: number | null; decided_at: string | null };

/** The earliest date any budget period could start (to fetch rows once). */
export function earliestPeriodStart(now: Date = new Date()): string {
  const month = currentPeriod("month", now).startsOn;
  const semester = currentPeriod("semester", now).startsOn;
  return month < semester ? month : semester;
}

/** Spent this period for one category, from the club's decided requests. */
export function spentThisPeriod(slug: string, period: BudgetPeriod, rows: SpentRow[], now: Date = new Date()): number {
  const start = currentPeriod(period, now).startsOn;
  let total = 0;
  for (const r of rows) {
    if (r.category !== slug || !r.decided_at || r.total_cents === null) continue;
    // ISO timestamps compare correctly as strings against "YYYY-MM-DD".
    if (r.decided_at.slice(0, 10) >= start) total += r.total_cents;
  }
  return total;
}

export type BudgetUse = {
  spentCents: number;
  remainingCents: number; // never below 0
  overCents: number; // how far over budget (0 if not)
  percentUsed: number; // 0–100, for the bar
};

export function budgetUse(budgetCents: number, spentCents: number): BudgetUse {
  const remainingCents = Math.max(0, budgetCents - spentCents);
  const overCents = Math.max(0, spentCents - budgetCents);
  const percentUsed =
    budgetCents <= 0 ? (spentCents > 0 ? 100 : 0) : Math.min(100, Math.round((spentCents / budgetCents) * 100));
  return { spentCents, remainingCents, overCents, percentUsed };
}
