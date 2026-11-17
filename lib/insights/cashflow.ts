// Money in vs money out per month, from the club's ledger, and how many
// months the balance would last. Pure, tested in tests/insights-cashflow.test.ts.
import { monthKey, type InsightRange } from "./ranges";

export type LedgerFlowRow = {
  direction: "in" | "out";
  kind: "dues" | "deposit" | "reimbursement";
  amount_cents: number;
  created_at: string;
};

export type MonthFlow = { key: string; label: string; partial: boolean; inCents: number; outCents: number; netCents: number };

export type Cashflow = {
  months: MonthFlow[];
  totals: { inCents: number; outCents: number; netCents: number };
  runwayMonths: number | null; // null when nothing went out in the range (or no balance)
};

export function cashflow(rows: LedgerFlowRow[], range: InsightRange, balanceCents: number | null): Cashflow {
  const months = range.months.map((m) => {
    let inCents = 0;
    let outCents = 0;
    for (const r of rows) {
      if (monthKey(r.created_at) !== m.key) continue;
      if (r.direction === "in") inCents += r.amount_cents;
      else outCents += r.amount_cents;
    }
    return { key: m.key, label: m.label, partial: m.partial, inCents, outCents, netCents: inCents - outCents };
  });
  const inCents = months.reduce((s, m) => s + m.inCents, 0);
  const outCents = months.reduce((s, m) => s + m.outCents, 0);
  return {
    months,
    totals: { inCents, outCents, netCents: inCents - outCents },
    runwayMonths: runway(balanceCents, outCents, months.length),
  };
}

/** Balance ÷ average monthly money out, to one decimal. Null when nothing went out. */
export function runway(balanceCents: number | null, outCents: number, monthCount: number): number | null {
  if (balanceCents === null || outCents <= 0 || monthCount <= 0) return null;
  const avgOut = outCents / monthCount;
  return Math.round((balanceCents / avgOut) * 10) / 10;
}
