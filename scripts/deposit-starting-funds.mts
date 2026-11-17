// Put starting funds into a club's vault and record it on that club's public
// ledger as a deposit. Test dollars only (devnet). New clubs get this
// automatically when created; this is for older clubs or a failed attempt.
//   npm run deposit-starting-funds                      → demo club, $1,000
//   npm run deposit-starting-funds -- --club=<id> --amount=500
// Safe to re-run: skips if the club already has a starting-funds deposit.
process.loadEnvFile(".env.local");

const { formatCents } = await import("@/lib/money");
const { DEFAULT_ORG_ID, loadOrg } = await import("@/lib/orgs/orgs");
const { giveStartingFunds } = await import("@/lib/orgs/starting-funds");

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const club = await loadOrg(arg("club") ?? DEFAULT_ORG_ID);
if (!club) {
  console.error("No such club.");
  process.exit(1);
}
const amountCents = Math.round(Number(arg("amount") ?? 1000) * 100);
if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
  console.error("--amount must be a positive dollar amount, e.g. --amount=500");
  process.exit(1);
}

console.log(`Depositing ${formatCents(amountCents)} of starting funds into ${club.name}'s vault...`);
const result = await giveStartingFunds(club.id, amountCents);
if (result.status === "already_funded") {
  console.log(`${club.name} already has its starting funds. Nothing to do.`);
} else if (result.status === "not_confirmed") {
  console.log(`Deposit not confirmed yet. Check: ${result.explorerUrl}`);
  console.log("Not recorded on the ledger. Re-check before re-running to avoid a double deposit.");
  process.exit(1);
} else {
  console.log("Done. Recorded on the club's ledger.");
  console.log("Explorer:", result.explorerUrl);
}
