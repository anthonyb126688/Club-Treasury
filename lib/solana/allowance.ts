// Pure helpers for the Squads spending limit (the server's daily allowance).
// No I/O, tested in tests/squads-allowance.test.ts.

export type AllowanceState = {
  amount: bigint; // full allowance per period, in base units
  remaining: bigint; // what's left in the current period, in base units
  lastReset: bigint; // unix seconds
  periodSeconds: bigint | null; // null = one-time limit
};

export const ONE_DAY_SECONDS = BigInt(86_400);

/**
 * How much the server can spend right now. Mirrors the Squads program: the
 * allowance refills once MORE than one full period has passed since the last
 * reset (counted from when the limit was created, not from midnight).
 */
export function allowanceRemaining(state: AllowanceState, nowSeconds: bigint): bigint {
  if (state.periodSeconds !== null && nowSeconds - state.lastReset > state.periodSeconds) {
    return state.amount;
  }
  return state.remaining;
}

/** Squads error 6026 (0x178a): "Spending limit exceeded". */
export const SPENDING_LIMIT_EXCEEDED_CODE = 6026;

/** Did this send/simulation error come from Squads refusing the spending limit? */
export function isSpendingLimitExceeded(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify(err)}` : String(err);
  return /0x178a|SpendingLimitExceeded|"Custom":\s*6026|custom program error: 6026/i.test(text);
}
