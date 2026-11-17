// Pure: the "spent this period" ring on the member home, from the member
// budget API (which sends formatted dollar strings). Tested in
// tests/member-ring.test.ts.

/** "$1,234.56" → 123456 cents. Returns null for anything that isn't a dollar amount. */
export function dollarsToCents(text: string): number | null {
  const m = /^\s*\$?\s*([0-9][0-9,]*)(?:\.([0-9]{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  const whole = Number(m[1].replace(/,/g, ""));
  const frac = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  if (!Number.isSafeInteger(whole)) return null;
  return whole * 100 + frac;
}

export type RingCategory = { spent: string; budget: string; hasBudget: boolean };

export type BudgetRing = {
  spentCents: number; // spent in categories that have a budget
  budgetCents: number; // total budget across those categories
  percent: number; // 0–100 for the ring (capped)
  over: boolean; // spent more than the total budget
};

/** Totals across the club's budgeted categories. Null when nothing is budgeted. */
export function budgetRing(categories: RingCategory[]): BudgetRing | null {
  let spent = 0;
  let budget = 0;
  for (const c of categories) {
    if (!c.hasBudget) continue;
    const s = dollarsToCents(c.spent);
    const b = dollarsToCents(c.budget);
    if (s === null || b === null) continue;
    spent += s;
    budget += b;
  }
  if (budget <= 0) return null;
  return {
    spentCents: spent,
    budgetCents: budget,
    percent: Math.min(100, Math.round((spent / budget) * 100)),
    over: spent > budget,
  };
}
