// USDC uses 6 decimal places: 1_000_000 base units = $1.00.
export const USDC_DECIMALS = 6;
const UNITS_PER_DOLLAR = BigInt(10 ** USDC_DECIMALS);
const UNITS_PER_CENT = UNITS_PER_DOLLAR / BigInt(100);

/**
 * Turn a USDC amount in base units into a dollar string like "$1,234.56".
 * Fractions of a cent are dropped (rounded down) so we never show more
 * money than someone actually has.
 */
export function formatUsd(baseUnits: bigint): string {
  const negative = baseUnits < BigInt(0);
  const abs = negative ? -baseUnits : baseUnits;
  const dollars = abs / UNITS_PER_DOLLAR;
  const cents = (abs % UNITS_PER_DOLLAR) / UNITS_PER_CENT;
  const text = `$${dollars.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}
