// Pure decision logic for "can this member pay dues for this term right now?"
// No I/O, fully unit-tested. app/api/dues/* does the database and chain calls.
import type { ChainStatus } from "@/lib/welcome/decide";

export type DuesRow = {
  status: "pending" | "sent" | "failed";
  signature: string | null;
  pending_tx: string | null;
  claimed_at: string; // ISO timestamp
};

export type DuesDecision =
  | "claim_new" // no payment this term yet: start one
  | "paid" // already paid this term: never charge again
  | "mark_paid" // the payment landed on-chain; record it
  | "resume" // a prepared payment is still valid: hand the same one back
  | "retry" // the earlier attempt definitely didn't charge: start over
  | "wait"; // a payment is being processed: don't start another

/** A prepared payment expires (blockhash) after ~60–90s; after this it can't land. */
export const DUES_STALE_AFTER_MS = 2 * 60 * 1000;

export function decideDues(
  row: DuesRow | null,
  now: Date,
  chain: ChainStatus | null,
): DuesDecision {
  if (!row) return "claim_new";
  if (row.status === "sent") return "paid";
  if (row.status === "failed") return "retry";

  // pending
  if (chain === "confirmed") return "mark_paid";
  if (chain === "failed") return "retry";
  if (chain === "processing") return "wait";

  const age = now.getTime() - new Date(row.claimed_at).getTime();
  if (age > DUES_STALE_AFTER_MS) return "retry";
  return row.pending_tx ? "resume" : "wait";
}
