// The JSON the Insights page gets from GET /api/orgs/:orgId/treasurer/insights.
// Money comes as whole cents (for charts) and as "$1,234.56" strings (for text).
import type { PaceStatus } from "./pace";
import type { RangeKind } from "./ranges";

export type Money = { cents: number; text: string };

export type InsightsResponse = {
  range: {
    kind: RangeKind;
    label: string; // "Fall 2026"
    elapsedPercent: number; // how far through the period we are
    months: { key: string; label: string; partial: boolean }[];
  };
  tiles: {
    balance: Money | null; // null if the club's account couldn't be read
    runwayMonths: number | null; // "Lasts ~N months"; null with no spending
    spent: Money;
    budget: Money;
    spentPercent: number | null; // of budget; null when there's no budget
    dues: { collected: Money; expected: Money; paidCount: number; memberCount: number; periodLabel: string };
    autoApproved: { share: number | null; count: number; total: number }; // share of decided requests paid without the treasurer
  };
  spendingByMonth: { key: string; label: string; partial: boolean; total: Money }[];
  budgetPerMonth: Money; // the dashed line
  categories: { slug: string; name: string; total: Money; status: PaceStatus | null }[];
  pace: {
    slug: string;
    name: string;
    spent: Money;
    budget: Money;
    percentUsed: number;
    elapsedPercent: number;
    status: PaceStatus;
  }[];
  cashflow: {
    months: { key: string; label: string; partial: boolean; in: Money; out: Money; net: Money }[];
    totals: { in: Money; out: Money; net: Money };
  };
  members: {
    userId: string;
    name: string;
    total: Money;
    requestCount: number;
    share: number;
    duesPaid: boolean;
  }[];
  vendors: { name: string; total: Money; count: number }[];
  alert: { text: string; status: PaceStatus } | null; // the single most important one
  generatedAt: string;
};

export const EXPORT_TYPES = ["activity", "requests", "members"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];
