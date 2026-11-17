// Budget pace per category: are we spending faster than the calendar?
// Pure, tested in tests/insights-pace.test.ts.
import type { InsightRange } from "./ranges";
import { budgetForRange, spentInRange, type CategoryInfo, type SpendRow } from "./spending";

export type PaceStatus = "on_track" | "ahead_of_pace" | "over_budget";

export type PaceRow = {
  slug: string;
  name: string;
  spentCents: number;
  budgetCents: number;
  percentUsed: number; // can go over 100
  elapsedPercent: number; // "where you should be today", 0–100
  status: PaceStatus;
};

/** More than this many percentage points ahead of the calendar = ahead of pace. */
export const AHEAD_MARGIN = 10;

export function paceStatus(spentCents: number, budgetCents: number, elapsedPercent: number): PaceStatus {
  if (budgetCents <= 0) return spentCents > 0 ? "over_budget" : "on_track";
  if (spentCents > budgetCents) return "over_budget";
  const used = (spentCents / budgetCents) * 100;
  return used - elapsedPercent > AHEAD_MARGIN ? "ahead_of_pace" : "on_track";
}

/** One row per active category. */
export function paceRows(rows: SpendRow[], range: InsightRange, categories: CategoryInfo[], now: Date = new Date()): PaceRow[] {
  const spent = spentInRange(rows, range);
  const elapsedPercent = Math.round(range.elapsedShare * 100);
  return categories
    .filter((c) => !c.archived)
    .map((c) => {
      const spentCents = spent.filter((r) => (r.category ?? "other") === c.slug).reduce((s, r) => s + (r.total_cents ?? 0), 0);
      const budgetCents = budgetForRange(c, range, now);
      const percentUsed = budgetCents > 0 ? Math.round((spentCents / budgetCents) * 100) : spentCents > 0 ? 100 : 0;
      return {
        slug: c.slug,
        name: c.name,
        spentCents,
        budgetCents,
        percentUsed,
        elapsedPercent,
        status: paceStatus(spentCents, budgetCents, elapsedPercent),
      };
    });
}

/** The single most important alert, for the Home card ("Food is ahead of pace"). */
export function topAlert(rows: PaceRow[]): { slug: string; text: string; status: PaceStatus } | null {
  const over = rows.filter((r) => r.status === "over_budget").sort((a, b) => b.percentUsed - a.percentUsed)[0];
  if (over) return { slug: over.slug, text: `${over.name} is over budget`, status: over.status };
  const ahead = rows
    .filter((r) => r.status === "ahead_of_pace")
    .sort((a, b) => b.percentUsed - b.elapsedPercent - (a.percentUsed - a.elapsedPercent))[0];
  if (ahead) return { slug: ahead.slug, text: `${ahead.name} is ahead of pace`, status: ahead.status };
  return null;
}
