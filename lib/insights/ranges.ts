// Date ranges for the Insights page: this month, this semester, or the last
// 12 months, plus the month buckets for charts. Pure, tested in
// tests/insights-ranges.test.ts.
//
// Months are bucketed in America/Chicago (decided for this app: the team and
// the hackathon run on Central time). Semesters use the same rule as
// lib/dues/period.ts: Spring = Jan–May, Summer = Jun–Jul, Fall = Aug–Dec.

export const RANGE_KINDS = ["month", "semester", "year"] as const;
export type RangeKind = (typeof RANGE_KINDS)[number];

export const TIME_ZONE = "America/Chicago";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type MonthBucket = {
  key: string; // "2026-11"
  label: string; // "Nov"
  partial: boolean; // the current, unfinished month
};

export type InsightRange = {
  kind: RangeKind;
  label: string; // "November 2026" / "Fall 2026" / "Last 12 months"
  months: MonthBucket[]; // from the start of the range up to this month
  periodMonths: number; // length of the whole period (a semester may not be over yet)
  elapsedShare: number; // 0–1: how much of the whole period has passed
  queryFrom: string; // YYYY-MM-DD: safe lower bound for database queries (a day early)
};

/** Anything that isn't a known range becomes "month". */
export function parseRange(value: string | null | undefined): RangeKind {
  return (RANGE_KINDS as readonly string[]).includes(value ?? "") ? (value as RangeKind) : "month";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Year and month (0–11) of a moment, in Chicago. */
export function chicagoYearMonth(at: Date | string): { year: number; month: number } {
  const d = typeof at === "string" ? new Date(at) : at;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric" }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value) - 1;
  return { year, month };
}

/** "2026-11" for a moment, in Chicago. Null for missing or bad dates. */
export function monthKey(at: Date | string | null | undefined): string | null {
  if (!at) return null;
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return null;
  const { year, month } = chicagoYearMonth(d);
  return `${year}-${pad(month + 1)}`;
}

/** Semester containing a month (0–11): its first month and length. */
export function semesterOf(month: number): { name: string; startMonth: number; length: number } {
  if (month <= 4) return { name: "Spring", startMonth: 0, length: 5 };
  if (month <= 6) return { name: "Summer", startMonth: 5, length: 2 };
  return { name: "Fall", startMonth: 7, length: 5 };
}

function bucketsFrom(year: number, startMonth: number, count: number, current: string): MonthBucket[] {
  const out: MonthBucket[] = [];
  for (let i = 0; i < count; i++) {
    const m = startMonth + i;
    const y = year + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    const key = `${y}-${pad(mm + 1)}`;
    out.push({ key, label: MONTH_NAMES[mm], partial: key === current });
  }
  return out;
}

/** How far through the current month we are (0–1). Close enough for pace. */
function monthFraction(now: Date, year: number, month: number): number {
  const start = Date.UTC(year, month, 1);
  const end = Date.UTC(year, month + 1, 1);
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export function rangeFor(kind: RangeKind, now: Date = new Date()): InsightRange {
  const { year, month } = chicagoYearMonth(now);
  const current = `${year}-${pad(month + 1)}`;
  const into = monthFraction(now, year, month);

  let startYear = year;
  let startMonth = month;
  let count = 1;
  let periodMonths = 1;
  let label = `${MONTH_LONG[month]} ${year}`;

  if (kind === "semester") {
    const sem = semesterOf(month);
    startMonth = sem.startMonth;
    count = month - sem.startMonth + 1;
    periodMonths = sem.length;
    label = `${sem.name} ${year}`;
  } else if (kind === "year") {
    startMonth = month - 11;
    count = 12;
    periodMonths = 12;
    label = "Last 12 months";
    if (startMonth < 0) {
      startYear = year - 1;
      startMonth += 12;
    }
  }

  const months = bucketsFrom(startYear, startMonth, count, current);
  const elapsedShare = Math.min(1, (count - 1 + into) / periodMonths);
  const first = new Date(Date.UTC(startYear, startMonth, 1) - 24 * 60 * 60 * 1000);
  const queryFrom = first.toISOString().slice(0, 10);
  return { kind, label, months, periodMonths, elapsedShare, queryFrom };
}

/** True when a moment falls in one of the range's months (Chicago time). */
export function inRange(range: InsightRange, at: Date | string | null | undefined): boolean {
  const key = monthKey(at);
  return key !== null && range.months.some((m) => m.key === key);
}
