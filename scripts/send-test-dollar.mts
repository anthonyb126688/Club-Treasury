// Send $1.00 of club test dollars from the treasury to an address, with a
// memo, and print the Solana Explorer link. A manual end-to-end test of
// lib/solana/transfer.ts. Not recorded on the ledger (it's a test).
//   npm run send-test-dollar -- <solana-address>
process.loadEnvFile(".env.local");

const { isAddress } = await import("@solana/kit");
const { formatUsd } = await import("@/lib/money");
const { getDollarBalance } = await import("@/lib/solana/balance");
const { sendDollars } = await import("@/lib/solana/transfer");

const to = process.argv[2];
if (!to || !isAddress(to)) {
  console.error("Usage: npm run send-test-dollar -- <solana-address>");
  process.exit(1);
}

console.log(`Sending $1.00 to ${to}...`);
const result = await sendDollars(to, 100, "club-treasury:test-send");
console.log("Status:", result.status);
console.log("Explorer:", result.explorerUrl);
console.log("Recipient balance now:", formatUsd(await getDollarBalance(to)));

export {};
