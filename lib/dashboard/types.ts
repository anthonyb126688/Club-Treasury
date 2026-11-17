// Shapes the treasurer dashboard API returns (shared by routes and screens).
// All amounts are already formatted as dollars. Receipt-derived text
// (vendor, summary, line items) is untrusted: show it as plain text only.
import type { Comparison } from "./differences";
import type { BudgetBar, DuesProgress } from "./overview";
import type { TabCode } from "./tabs";

export type Overview = {
  clubName: string;
  joinCode: string;
  /** "$1,234.56", or null while the club's account is being set up / unreachable. */
  balance: string | null;
  /** Approvals are possible (the club's vault is set up). */
  onChain: boolean;
  dues: DuesProgress & { collected: string; expected: string; periodLabel: string; amount: string };
  spentThisMonth: string;
  monthLabel: string;
  waitingCount: number;
  totalRequests: number;
  budgets: (BudgetBar & { budget: string; spent: string })[];
};

export type RequestRow = {
  id: string;
  status: string;
  statusLabel: string;
  memberName: string;
  amount: string;
  category: string;
  vendor: string | null;
  /** ISO time shown on the row: paid date for Paid, decided date for Denied, else submitted. */
  date: string;
};

export type RequestList = {
  tab: TabCode;
  counts: Record<TabCode, number>;
  rows: RequestRow[];
  limit: number;
};

export type DuplicateOriginal = {
  id: string;
  photoUrl: string | null;
  vendor: string | null;
  date: string | null;
  amount: string;
  statusLabel: string;
  memberName: string;
  submittedAt: string;
};

export type RequestDetail = {
  id: string;
  status: string;
  statusLabel: string;
  memberName: string;
  memberEmail: string | null;
  submittedAt: string;
  photoUrl: string | null;
  vendor: string | null;
  receiptDate: string | null;
  summary: string | null;
  lineItems: { description: string; amount: string }[];
  looksLikeReceipt: boolean | null;
  amount: string;
  category: string;
  comparison: Comparison[];
  memberEdited: boolean;
  reasons: string[];
  payoutError: string | null;
  denialNote: string | null;
  decidedAt: string | null;
  paidAt: string | null;
  verifyUrl: string | null;
  duplicateOf: DuplicateOriginal | null;
  actions: { approve: boolean; deny: boolean; retry: boolean };
};
