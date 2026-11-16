// ONE-TIME: create the club's Squads multisig + vault on devnet.
//   npm run setup-squads
//
// Members:
//   * the treasurer (from the members table, role = 'treasurer'): can
//     propose, vote, and execute. The only voter; threshold 1.
//   * the server's treasury key: propose-only (Initiate). It can open
//     proposals but never approve or execute them.
// The server is TEMPORARY config authority so scripts/add-spending-limit.mts
// can add the daily allowance; that script then removes the authority
// for good.
//
// Prints addresses only. Never prints keys.
process.loadEnvFile(".env.local");

const multisig = await import("@sqds/multisig");
const { Keypair, PublicKey, TransactionMessage, VersionedTransaction } = await import("@solana/web3.js");
const { db } = await import("@/lib/db");
const { sendWeb3, signatureOf, squadsConnection, VAULT_INDEX } = await import("@/lib/solana/squads");
const { getTreasuryKeypairForSquads } = await import("@/lib/solana/treasury");

if (process.env.SQUADS_MULTISIG_ADDRESS) {
  console.error("SQUADS_MULTISIG_ADDRESS is already set in .env.local. Refusing to create a second vault.");
  process.exit(1);
}

const { data: treasurers, error } = await db()
  .from("members")
  .select("email, solana_address")
  .eq("role", "treasurer");
if (error) throw new Error(error.message);
if (treasurers?.length !== 1) {
  console.error(`Expected exactly one treasurer in the members table, found ${treasurers?.length ?? 0}.`);
  process.exit(1);
}
const treasurer = new PublicKey(treasurers[0].solana_address);

const conn = await squadsConnection();
const server = getTreasuryKeypairForSquads();
const createKey = Keypair.generate(); // one-time seed for the multisig address
const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
const [vaultPda] = multisig.getVaultPda({ multisigPda, index: VAULT_INDEX });

const [programConfigPda] = multisig.getProgramConfigPda({});
const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(conn, programConfigPda);

const { Permission, Permissions } = multisig.types;
const ix = multisig.instructions.multisigCreateV2({
  treasury: programConfig.treasury,
  creator: server.publicKey,
  multisigPda,
  configAuthority: server.publicKey, // temporary; removed by add-spending-limit
  threshold: 1,
  members: [
    { key: treasurer, permissions: Permissions.all() },
    { key: server.publicKey, permissions: Permissions.fromPermissions([Permission.Initiate]) },
  ],
  timeLock: 0,
  createKey: createKey.publicKey,
  rentCollector: null,
  memo: "club-treasury:create-vault",
});

const { blockhash } = await conn.getLatestBlockhash();
const tx = new VersionedTransaction(
  new TransactionMessage({ payerKey: server.publicKey, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message(),
);
tx.sign([server, createKey]);

// Print the addresses BEFORE sending, so they can't be lost if anything hangs.
console.log("Paste these into .env.local:");
console.log(`SQUADS_MULTISIG_ADDRESS=${multisigPda.toBase58()}`);
console.log(`SQUADS_VAULT_ADDRESS=${vaultPda.toBase58()}`);
console.log("");
console.log(`Explorer: https://explorer.solana.com/tx/${signatureOf(tx)}?cluster=devnet`);
const status = await sendWeb3(tx);
console.log(`Status: ${status}. Treasurer (only approver): ${treasurers[0].email}`);
console.log("");
console.log("Next: npm run add-spending-limit (it also locks the setup).");
