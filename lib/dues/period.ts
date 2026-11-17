// Dues and budget periods. Pure, tested in tests/periods.test.ts.
// A club charges dues once per semester or once per month; category budgets
// also reset per month or per semester. Dates are UTC.
import type { BudgetPeriod } from "@/lib/policy/rules";

export type Period = {
  id: string; // stored in dues_payments.period, e.g. "2026-fall" or "2026-11"
  label: string; // shown to people, e.g. "Fall 2026" or "November 2026"
  startsOn: string; // YYYY-MM-DD, first day of the period
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Semesters: Spring = Jan–May, Summer = Jun–Jul, Fall = Aug–Dec. */
function semesterOf(month: number): { key: "spring" | "summer" | "fall"; startMonth: number } {
  if (month <= 4) return { key: "spring", startMonth: 0 };
  if (month <= 6) return { key: "summer", startMonth: 5 };
  return { key: "fall", startMonth: 7 };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function currentPeriod(kind: BudgetPeriod, now: Date = new Date()): Period {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (kind === "month") {
    return { id: `${year}-${pad(month + 1)}`, label: `${MONTHS[month]} ${year}`, startsOn: `${year}-${pad(month + 1)}-01` };
  }
  const { key, startMonth } = semesterOf(month);
  return {
    id: `${year}-${key}`,
    label: `${key[0].toUpperCase()}${key.slice(1)} ${year}`,
    startsOn: `${year}-${pad(startMonth + 1)}-01`,
  };
}

/** "per semester" / "per month", for sentences like "$25 per semester". */
export function perPeriod(kind: BudgetPeriod): string {
  return kind === "month" ? "per month" : "per semester";
}
