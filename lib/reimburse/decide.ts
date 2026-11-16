// Pure logic for reimbursements: when a payout may be sent, and what the
// member sees. No I/O, tested in tests/reimburse-decide.test.ts.
import type { ChainStatus } from "@/lib/welcome/decide";

export type RequestStatus =
  | "submitted" // AI has read it; member hasn't confirmed yet
  | "auto_approved" // policy approved; payout in progress
  | "queued" // waiting for the treasurer
  | "approved" // treasurer approved; payout in progress
  | "rejected"
  | "paid"
  | "payment_failed";

export const PAYABLE: readonly RequestStatus[] = ["auto_approved", "approved", "payment_failed"];

export type PayoutRow = {
  status: RequestStatus;
  payout_signature: string | null;
  payout_claimed_at: string | null; // ISO timestamp
};

export type PayoutDecision =
  | "done" // already paid
  | "not_payable" // not approved (or rejected): never pay
  | "mark_paid" // the payout landed; record it
  | "wait" // a payout is in flight; don't start another
  | "send"; // safe to (re)send

/** A prepared payout expires (blockhash) after ~60–90s; after this it can't land. */
export const PAYOUT_STALE_AFTER_MS = 2 * 60 * 1000;

export function decidePayout(row: PayoutRow, now: Date, chain: ChainStatus | null): PayoutDecision {
  if (row.status === "paid") return "done";
  if (!PAYABLE.includes(row.status)) return "not_payable";

  const age = row.payout_claimed_at
    ? now.getTime() - new Date(row.payout_claimed_at).getTime()
    : Number.POSITIVE_INFINITY;

  if (row.payout_signature) {
    if (chain === "confirmed") return "mark_paid";
    if (chain === "processing") return "wait";
    if (chain === "failed") return "send";
    // Not found: it might still land until its blockhash expires.
    return age > PAYOUT_STALE_AFTER_MS ? "send" : "wait";
  }
  // Claimed but not yet signed: another request is about to send it.
  return age > PAYOUT_STALE_AFTER_MS ? "send" : "wait";
}

export type ProposalPayoutDecision =
  | "done" // already paid
  | "not_payable" // still waiting for the treasurer (or rejected)
  | "mark_paid" // the treasurer's approve + pay landed; record it
  | "wait" // it's in flight
  | "reopen"; // it never landed: put it back in the treasurer's queue

/**
 * For requests paid through a Squads proposal (the treasurer's approval).
 * The server never sends these itself; it only works out what happened.
 */
export function decideProposalPayout(
  row: PayoutRow,
  now: Date,
  chain: ChainStatus | null,
): ProposalPayoutDecision {
  if (row.status === "paid") return "done";
  if (row.status !== "approved") return "not_payable";
  if (!row.payout_signature) return "reopen";
  if (chain === "confirmed") return "mark_paid";
  if (chain === "processing") return "wait";
  if (chain === "failed") return "reopen";
  const age = row.payout_claimed_at
    ? now.getTime() - new Date(row.payout_claimed_at).getTime()
    : Number.POSITIVE_INFINITY;
  return age > PAYOUT_STALE_AFTER_MS ? "reopen" : "wait";
}

export type MemberStatus = "paying" | "reimbursed" | "pending" | "not_approved" | "delayed";

/** What the member sees for each request. Drafts ("submitted") aren't shown. */
export function memberStatus(status: RequestStatus): MemberStatus | null {
  switch (status) {
    case "submitted":
      return null;
    case "auto_approved":
    case "approved":
      return "paying";
    case "paid":
      return "reimbursed";
    case "queued":
      return "pending";
    case "rejected":
      return "not_approved";
    case "payment_failed":
      return "delayed";
  }
}

/** Accept "18", "18.5", "$18.40", "1,234.56" → cents. Null if not a valid amount. */
export function parseDollarsToCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return cents > 0 ? cents : null;
}
