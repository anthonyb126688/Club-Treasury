// ONE-TIME: give the server its daily allowance from the vault, then lock
// the vault's settings for good.
//   npm run add-spending-limit
//
// In ONE atomic step:
//   1. Add a Squads spending limit: club dollars only, $150 per day (the
//      daily auto-approve limit in lib/policy/rules.ts), usable only by the
//      server's key, payable to anyone (an empty destination list means any
//      address; every member can be reimbursed).
//   2. Remove the server as config authority. From then on, members and
//      limits can only change with the treasurer's vote.
//
// Prints addresses only. Never prints keys.
process.loadEnvFile(".env.local");

const multisig = await import("@sqds/multisig");
const { Keypair, PublicKey, TransactionMessage, VersionedTransaction } = await import("@solana/web3.js");
const { DEFAULT_RULES } = await import("@/lib/policy/rules");
const { centsToUnits, formatCents } = await import("@/lib/money");
const { getDollarMint } = await import("@/lib/solana/mint");
const { sendWeb3, signatureOf, squadsConnection, VAULT_INDEX } = await import("@/lib/solana/squads");
const { getTreasuryKeypairForSquads } = await import("@/lib/solana/treasury");

const msAddress = process.env.SQUADS_MULTISIG_ADDRESS;
if (!msAddress) {
  console.error("Set SQUADS_MULTISIG_ADDRESS in .env.local first (from npm run setup-squads).");
  process.exit(1);
}
if (process.env.SQUADS_SPENDING_LIMIT_ADDRESS) {
  console.error("SQUADS_SPENDING_LIMIT_ADDRESS is already set. Refusing to add a second allowance.");
  process.exit(1);
}

const conn = await squadsConnection();
const server = getTreasuryKeypairForSquads();
const multisigPda = new PublicKey(msAddress);

const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda);
if (!ms.configAuthority.equals(server.publicKey)) {
  console.error("The server isn't this vault's config authority (already locked?). Nothing to do.");
  process.exit(1);
}

const dailyCents = DEFAULT_RULES.dailyAutoApproveLimitCents;
const createKey = Keypair.generate();
const [spendingLimitPda] = multisig.getSpendingLimitPda({ multisigPda, createKey: createKey.publicKey });

const add = multisig.instructions.multisigAddSpendingLimit({
  multisigPda,
  configAuthority: server.publicKey,
  spendingLimit: spendingLimitPda,
  rentPayer: server.publicKey,
  createKey: createKey.publicKey,
  vaultIndex: VAULT_INDEX,
  mint: new PublicKey(getDollarMint()),
  amount: centsToUnits(dailyCents),
  period: multisig.types.Period.Day,
  members: [server.publicKey],
  destinations: [], // any member can be reimbursed
  memo: "club-treasury:daily-allowance",
});

const lock = multisig.instructions.multisigSetConfigAuthority({
  multisigPda,
  configAuthority: server.publicKey,
  newConfigAuthority: PublicKey.default, // nobody: changes now need the treasurer's vote
  memo: "club-treasury:lock-settings",
});

const { blockhash } = await conn.getLatestBlockhash();
const tx = new VersionedTransaction(
  new TransactionMessage({ payerKey: server.publicKey, recentBlockhash: blockhash, instructions: [add, lock] }).compileToV0Message(),
);
tx.sign([server]); // createKey is only an address seed here, not a signer

// Print the address BEFORE sending, so it can't be lost if anything hangs.
console.log("Paste this into .env.local:");
console.log(`SQUADS_SPENDING_LIMIT_ADDRESS=${spendingLimitPda.toBase58()}`);
console.log("");
const signature = signatureOf(tx);
const status = await sendWeb3(tx);
console.log(`Status: ${status}`);

const after = await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda);
console.log(`Added a ${formatCents(dailyCents)}/day allowance for the server, and locked the vault's settings.`);
console.log(`Config authority is now: ${after.configAuthority.equals(PublicKey.default) ? "nobody (locked)" : after.configAuthority.toBase58()}`);
console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
