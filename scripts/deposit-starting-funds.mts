// One-time: put the club's $1,000 starting funds into the treasury and record
// it on the public ledger as a deposit.
//   npm run deposit-starting-funds
// Safe to re-run: skips if a deposit is already on the ledger.
process.loadEnvFile(".env.local");

const { db } = await import("@/lib/db");
const { depositToTreasury } = await import("@/lib/solana/transfer");

const AMOUNT_CENTS = 100_000; // $1,000.00 (tweak later if needed)

const { data: existing, error } = await db()
  .from("ledger_entries")
  .select("id, amount_cents, signature")
  .eq("kind", "deposit")
  .limit(1);
if (error) throw new Error(`ledger lookup: ${error.message}`);
if (existing.length > 0) {
  console.log("Starting funds already deposited. Nothing to do.");
  process.exit(0);
}

console.log("Depositing $1,000.00 of starting funds into the club treasury...");
const result = await depositToTreasury(AMOUNT_CENTS, "club-treasury:deposit:starting-funds");
if (result.status !== "confirmed") {
  console.log(`Deposit not confirmed yet (${result.status}). Check: ${result.explorerUrl}`);
  console.log("Not recorded on the ledger. Re-check before re-running to avoid a double deposit.");
  process.exit(1);
}

const { error: insertError } = await db().from("ledger_entries").insert({
  direction: "in",
  kind: "deposit",
  amount_cents: AMOUNT_CENTS,
  description: "Starting club funds",
  signature: result.signature,
});
if (insertError) throw new Error(`ledger insert: ${insertError.message}`);

console.log("Done. Recorded on the ledger.");
console.log("Explorer:", result.explorerUrl);

export {};
