// DEMO / SECURITY TEST: pretend our server was hacked. Skip the rules engine
// entirely and try to take $1 MORE than today's allowance straight from the
// Squads vault, using the server's own key. Squads (the blockchain) must
// refuse it. Nothing is paid.
//   npm run try-overspend
//
// We send it with "skip preflight" so the attempt really lands on-chain and
// fails there, giving an Explorer link anyone can check.
process.loadEnvFile(".env.local");


const { db } = await import("@/lib/db");
const { formatUsd } = await import("@/lib/money");
const { getDollarBalance } = await import("@/lib/solana/balance");
const { explorerTxUrl } = await import("@/lib/solana/memo");
const { getDevnetRpc } = await import("@/lib/solana/rpc");
const { allowanceLeft, allowancePaymentInstructions, squadsConfig } = await import("@/lib/solana/squads");
const { signWithTreasury, waitForConfirmation } = await import("@/lib/solana/treasury");

const config = squadsConfig();
if (!config) {
  console.error("Squads isn't set up: add the SQUADS_* addresses to .env.local.");
  process.exit(1);
}

const { data } = await db().from("members").select("solana_address").eq("role", "treasurer").single();
const to = data!.solana_address as string;
const vault = config.vault.toBase58();

const left = await allowanceLeft(config);
const attemptCents = Number(left / BigInt(10_000)) + 100; // $1 over what's left
console.log(`Allowance left today: ${formatUsd(left)}`);
console.log(`Vault holds:          ${formatUsd(await getDollarBalance(vault))}`);
console.log(`Trying to take ${formatUsd(BigInt(attemptCents) * BigInt(10_000))} with the server key, bypassing our rules...`);

const payment = await signWithTreasury(
  await allowancePaymentInstructions(config, to, attemptCents, "club-treasury:overspend-test"),
);

// Bypass the simulation check so the attempt is recorded on-chain.
const rpc = await getDevnetRpc();
await rpc
  .sendTransaction(payment.wire as Parameters<typeof rpc.sendTransaction>[0], {
    encoding: "base64",
    skipPreflight: true,
  })
  .send();
const status = await waitForConfirmation(payment.signature, 40_000);

console.log("");
console.log(`Result: ${status === "failed" ? "REFUSED by the blockchain ✓" : `unexpected: ${status}`}`);
const tx = await rpc
  .getTransaction(payment.signature as Parameters<typeof rpc.getTransaction>[0], {
    maxSupportedTransactionVersion: 0,
    encoding: "json",
  })
  .send();
const logs = tx?.meta?.logMessages ?? [];
const reason = logs.find((l) => /AnchorError|Error Message/.test(l));
if (reason) console.log(`Squads said: ${reason.replace(/^Program log: /, "")}`);
console.log("Explorer:", explorerTxUrl(payment.signature));
console.log(`Vault still holds:    ${formatUsd(await getDollarBalance(vault))}`);
