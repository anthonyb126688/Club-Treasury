// Which tab of the treasurer dashboard a reimbursement request belongs in,
// and the plain-English status shown on its row. Pure, tested in
// tests/dashboard-tabs.test.ts.

export const TABS = ["needs_approval", "paid", "blocked", "denied"] as const;
export type TabCode = (typeof TABS)[number];

export const TAB_TITLES: Record<TabCode, string> = {
  needs_approval: "Needs approval",
  paid: "Paid",
  blocked: "Blocked",
  denied: "Denied",
};

/** How many rows each tab shows (most recent first). */
export const TAB_LIMIT = 50;

export const DUPLICATE_GROUP = "possible_duplicate";

export function isTab(value: unknown): value is TabCode {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}

/**
 * The tab for a request, or null for drafts (submitted) that the treasurer
 * never sees. Approved-but-still-paying requests sit under Paid ("On its way").
 */
export function tabFor(status: string, reviewGroup: string | null): TabCode | null {
  switch (status) {
    case "queued":
      return reviewGroup === DUPLICATE_GROUP ? "blocked" : "needs_approval";
    case "payment_failed":
      return "blocked";
    case "paid":
    case "approved":
    case "auto_approved":
      return "paid";
    case "rejected":
      return "denied";
    default:
      return null;
  }
}

/**
 * PostgREST filters (for Supabase `.or(...)`) that select exactly the rows
 * tabFor puts in each tab. Kept next to tabFor so they stay in sync.
 */
export const TAB_FILTERS: Record<TabCode, string> = {
  needs_approval: `and(status.eq.queued,or(review_group.is.null,review_group.neq.${DUPLICATE_GROUP}))`,
  paid: "status.in.(paid,approved,auto_approved)",
  blocked: `status.eq.payment_failed,and(status.eq.queued,review_group.eq.${DUPLICATE_GROUP})`,
  denied: "status.eq.rejected",
};

/** Short status shown on a row. */
export function statusLabel(status: string, reviewGroup: string | null): string {
  if (status === "queued") return reviewGroup === DUPLICATE_GROUP ? "Possible duplicate" : "Waiting for you";
  if (status === "payment_failed") return "Payout didn't go through";
  if (status === "paid") return "Paid";
  if (status === "approved" || status === "auto_approved") return "On its way";
  if (status === "rejected") return "Denied";
  return "Draft";
}

/** What the treasurer can do with a request in this state. */
export function actionsFor(status: string): { approve: boolean; deny: boolean; retry: boolean } {
  return {
    approve: status === "queued",
    deny: status === "queued",
    retry: status === "payment_failed",
  };
}
