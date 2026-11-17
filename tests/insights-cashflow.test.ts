import { describe, expect, it } from "vitest";
import { cashflow, runway, type LedgerFlowRow } from "@/lib/insights/cashflow";
import { rangeFor } from "@/lib/insights/ranges";

const NOW = new Date("2026-11-17T18:00:00Z");

const rows: LedgerFlowRow[] = [
  { direction: "in", kind: "deposit", amount_cents: 100_000, created_at: "2026-10-02T18:00:00Z" },
  { direction: "in", kind: "dues", amount_cents: 2_500, created_at: "2026-11-17T15:00:00Z" },
  { direction: "out", kind: "reimbursement", amount_cents: 40_000, created_at: "2026-11-17T15:10:00Z" },
  { direction: "out", kind: "reimbursement", amount_cents: 1_800, created_at: "2026-11-17T15:20:00Z" },
];

describe("cashflow", () => {
  it("adds money in and out per month", () => {
    const flow = cashflow(rows, rangeFor("semester", NOW), 60_700);
    expect(flow.months.map((m) => [m.key, m.inCents, m.outCents])).toEqual([
      ["2026-08", 0, 0],
      ["2026-09", 0, 0],
      ["2026-10", 100_000, 0],
      ["2026-11", 2_500, 41_800],
    ]);
    expect(flow.totals).toEqual({ inCents: 102_500, outCents: 41_800, netCents: 60_700 });
  });

  it("runway = balance ÷ average monthly money out", () => {
    // 41,800 out over 4 months = 10,450 a month; 60,700 / 10,450 ≈ 5.8
    expect(cashflow(rows, rangeFor("semester", NOW), 60_700).runwayMonths).toBe(5.8);
  });

  it("runway is null with no spending or no balance", () => {
    expect(runway(50_000, 0, 3)).toBeNull();
    expect(runway(null, 1000, 3)).toBeNull();
    expect(cashflow(rows.slice(0, 2), rangeFor("month", NOW), 1000).runwayMonths).toBeNull();
  });
});
