// Test: pay $1.00 from the Squads vault using the server's daily allowance
// (the same path instant reimbursements use). Not recorded on the ledger.
//   npm run pay-from-allowance            → pays the treasurer
//   npm run pay-from-allowance -- <addr>  → pays that address
process.loadEnvFile(".env.local");

const { isAddress } = await import("@solana/kit");
const { db } = await import("@/lib/db");
const { formatUsd } = await import("@/lib/money");
const { getDollarBalance } = await import("@/lib/solana/balance");
const { explorerTxUrl } = await import("@/lib/solana/memo");
const { allowanceLeft, allowancePaymentInstructions, squadsConfigFor } = await import("@/lib/solana/squads");
// Which club: --club=<id> (defaults to the demo club).
const { DEFAULT_ORG_ID, loadOrg } = await import("@/lib/orgs/orgs");
const clubArg = process.argv.find((a) => a.startsWith("--club="))?.slice("--club=".length);
const club = await loadOrg(clubArg ?? DEFAULT_ORG_ID);
if (!club) {
  console.error(`No club with id ${clubArg}.`);
  process.exit(1);
}

const { signWithTreasury, submit, waitForConfirmation } = await import("@/lib/solana/treasury");

const config = squadsConfigFor(club);
if (!config) {
  console.error("This club's vault isn't set up yet.");
  process.exit(1);
}

let to = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!to) {
  const { data } = await db()
  .from("org_memberships")
  .select("member:members(solana_address)")
  .eq("org_id", club.id)
  .eq("role", "treasurer")
  .eq("status", "active")
  .limit(1)
  .single();
  to = (data as unknown as { member: { solana_address: string } }).member.solana_address;
}
if (!isAddress(to)) {
  console.error("Usage: npm run pay-from-allowance -- <address>");
  process.exit(1);
}

const vault = config.vault.toBase58();
console.log(`Allowance left today: ${formatUsd(await allowanceLeft(config))}`);
console.log(`Vault holds:          ${formatUsd(await getDollarBalance(vault))}`);
console.log(`Paying $1.00 from the vault to ${to}...`);

const payment = await signWithTreasury(
  await allowancePaymentInstructions(config, to, 100, "club-treasury:test-allowance"),
);
await submit(payment);
const status = await waitForConfirmation(payment.signature);

console.log("Status:", status);
console.log("Explorer:", explorerTxUrl(payment.signature));
console.log(`Allowance left now:   ${formatUsd(await allowanceLeft(config))}`);
console.log(`Vault holds now:      ${formatUsd(await getDollarBalance(vault))}`);
