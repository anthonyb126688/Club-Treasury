// What a member sees for each of their reimbursement requests: a simple
// status line (Submitted → Approved → Paid), or Blocked / Denied with a short
// reason. Pure, tested in tests/member-status.test.ts.
//
// "Blocked" uses the same definition as the treasurer dashboard: waiting for
// the treasurer as a possible duplicate, or approved but the payout failed.
import type { RequestStatus } from "@/lib/reimburse/decide";

export type Step = "submitted" | "approved" | "paid";
export const STEPS: readonly Step[] = ["submitted", "approved", "paid"];
export const STEP_LABELS: Record<Step, string> = {
  submitted: "Submitted",
  approved: "Approved",
  paid: "Paid",
};

export type StatusLine =
  // On the normal path. `waiting` is set while the treasurer is checking it.
  | { kind: "steps"; current: Step; waiting: boolean; reasons: string[] }
  | { kind: "blocked"; reasons: string[] }
  | { kind: "denied"; note: string | null };

/** Short, member-friendly reasons, keyed by the policy's reason code. */
export const MEMBER_REASONS: Record<string, string> = {
  over_cap: "Over the club's limit for instant payouts",
  possible_duplicate: "Looks like a receipt that was already sent",
  edited_by_member: "You changed what we read, so the treasurer will check it",
  over_budget: "Over this category's budget",
  daily_limit: "The club's daily limit was reached",
  category_not_allowed: "This category is always checked by the treasurer",
  unreadable: "We couldn't read it clearly",
  date_problem: "There's a problem with the receipt date",
};

export const FALLBACK_REASON = "The treasurer will take a look";
export const PAYOUT_PROBLEM_REASON = "Approved, but the payout didn't go through yet. The treasurer will retry it";

/**
 * Turn stored review reasons into member-friendly text. Only the reason
 * CODE is used (the stored messages are written for the treasurer).
 * Unknown codes fall back to a generic line; duplicates are dropped.
 */
export function memberReasons(reviewReasons: unknown): string[] {
  const list = Array.isArray(reviewReasons) ? reviewReasons : [];
  const out: string[] = [];
  for (const r of list) {
    const code = r && typeof r === "object" && "code" in r ? (r as { code: unknown }).code : null;
    const text = typeof code === "string" && Object.hasOwn(MEMBER_REASONS, code) ? MEMBER_REASONS[code] : FALLBACK_REASON;
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

export type StatusInput = {
  status: RequestStatus;
  reviewGroup: string | null;
  reviewReasons: unknown;
  denialNote: string | null;
};

/** The status line for one request, or null for drafts (never shown). */
export function statusLine(r: StatusInput): StatusLine | null {
  switch (r.status) {
    case "submitted":
      return null;
    case "queued": {
      const reasons = memberReasons(r.reviewReasons);
      if (r.reviewGroup === "possible_duplicate") {
        return { kind: "blocked", reasons: reasons.length ? reasons : [MEMBER_REASONS.possible_duplicate] };
      }
      return { kind: "steps", current: "submitted", waiting: true, reasons: reasons.length ? reasons : [FALLBACK_REASON] };
    }
    case "auto_approved":
    case "approved":
      return { kind: "steps", current: "approved", waiting: false, reasons: [] };
    case "paid":
      return { kind: "steps", current: "paid", waiting: false, reasons: [] };
    case "payment_failed":
      return { kind: "blocked", reasons: [PAYOUT_PROBLEM_REASON] };
    case "rejected":
      return { kind: "denied", note: r.denialNote?.trim() ? r.denialNote.trim() : null };
  }
}

/** Still moving (worth checking back on): anything not yet Paid or Denied. */
export function isInProgress(line: StatusLine): boolean {
  if (line.kind === "denied") return false;
  if (line.kind === "steps") return line.current !== "paid";
  return true;
}

/** The one-line summary under a request, e.g. "Paid" or "Waiting for the treasurer". */
export function statusHeadline(line: StatusLine): string {
  if (line.kind === "denied") return "Denied";
  if (line.kind === "blocked") return "Blocked";
  if (line.current === "submitted") return line.waiting ? "Submitted · waiting for the treasurer" : "Submitted";
  if (line.current === "approved") return "Approved · payment on its way";
  return "Paid";
}

/** What the submit API returns, mapped onto the same status words. */
export type SubmitOutcome = "reimbursed" | "paying" | "pending" | "delayed";

export function outcomeStep(outcome: SubmitOutcome): { step: Step | "blocked"; headline: string } {
  switch (outcome) {
    case "reimbursed":
      return { step: "paid", headline: "Paid" };
    case "paying":
      return { step: "approved", headline: "Approved" };
    case "pending":
      return { step: "submitted", headline: "Submitted" };
    case "delayed":
      return { step: "blocked", headline: "Blocked" };
  }
}
