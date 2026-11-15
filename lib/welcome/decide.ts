// Pure decision logic for the one-time $50 welcome payment. No I/O here, so
// it can be fully unit-tested. The route does the database and chain calls.

export type WelcomeRow = {
  welcome_status: "pending" | "sent" | "failed";
  welcome_signature: string | null;
  welcome_claimed_at: string; // ISO timestamp
};

/** What the chain says about a previously signed welcome payment. */
export type ChainStatus = "confirmed" | "failed" | "processing" | "not_found";

export type WelcomeDecision =
  | "claim_new" // no row yet: insert one, then pay
  | "done" // already paid
  | "mark_sent" // a payment we sent earlier landed; just record it
  | "retry" // earlier attempt definitely didn't pay; claim again and pay
  | "wait"; // another attempt is in flight; don't pay

/**
 * A signed payment can only land while its blockhash is valid (~60–90s).
 * After this long with no trace on-chain, it's safe to try again.
 */
export const STALE_AFTER_MS = 2 * 60 * 1000;

export function decideWelcome(
  row: WelcomeRow | null,
  now: Date,
  chain: ChainStatus | null,
): WelcomeDecision {
  if (!row) return "claim_new";
  if (row.welcome_status === "sent") return "done";
  if (row.welcome_status === "failed") return "retry";

  // pending
  if (chain === "confirmed") return "mark_sent";
  if (chain === "failed") return "retry";
  if (chain === "processing") return "wait";

  const age = now.getTime() - new Date(row.welcome_claimed_at).getTime();
  return age > STALE_AFTER_MS ? "retry" : "wait";
}
