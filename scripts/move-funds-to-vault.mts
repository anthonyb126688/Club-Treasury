// ONE-TIME: move the club's dollars from the old treasury wallet into the
// Squads vault. Not a ledger entry: it's the same club money, moving to its
// new home.
//   npm run move-funds-to-vault
process.loadEnvFile(".env.local");

const { formatUsd } = await import("@/lib/money");
const { getDollarBalance } = await import("@/lib/solana/balance");
const { squadsConfig } = await import("@/lib/solana/squads");
const { getTreasurySigner } = await import("@/lib/solana/treasury");
const { sendDollars } = await import("@/lib/solana/transfer");

const config = squadsConfig();
if (!config) {
  console.error("Set SQUADS_MULTISIG_ADDRESS, SQUADS_VAULT_ADDRESS and SQUADS_SPENDING_LIMIT_ADDRESS in .env.local first.");
  process.exit(1);
}

const treasury = await getTreasurySigner();
const units = await getDollarBalance(treasury.address);
const cents = Number(units / BigInt(10_000));
if (cents <= 0) {
  console.log("The old treasury has no club dollars left. Nothing to move.");
  process.exit(0);
}

const vault = config.vault.toBase58();
console.log(`Moving ${formatUsd(units)} from the old treasury into the vault ${vault}...`);
const result = await sendDollars(vault, cents, "club-treasury:move-to-vault");
console.log("Status:", result.status);
console.log("Explorer:", result.explorerUrl);
console.log("Vault now holds:", formatUsd(await getDollarBalance(vault)));
