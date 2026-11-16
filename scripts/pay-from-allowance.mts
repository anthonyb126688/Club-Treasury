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
const { allowanceLeft, allowancePaymentInstructions, squadsConfig } = await import("@/lib/solana/squads");
const { signWithTreasury, submit, waitForConfirmation } = await import("@/lib/solana/treasury");

const config = squadsConfig();
if (!config) {
  console.error("Squads isn't set up: add the SQUADS_* addresses to .env.local.");
  process.exit(1);
}

let to = process.argv[2];
if (!to) {
  const { data } = await db().from("members").select("solana_address").eq("role", "treasurer").single();
  to = data!.solana_address as string;
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
