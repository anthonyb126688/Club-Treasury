// Check the treasurer-approval path without paying anything:
//   * opens a Squads proposal for every queued request that lacks one
//     (the app does this automatically; only the treasurer can approve)
//   * builds the treasurer's "approve + pay" for each and checks it on the
//     network WITHOUT sending it. It can't pass fully (the treasurer hasn't
//     signed), so we only report problems other than the missing signature.
//   npm run check-proposals
process.loadEnvFile(".env.local");

const multisig = await import("@sqds/multisig");
const { VersionedTransaction } = await import("@solana/web3.js");
const { db } = await import("@/lib/db");
const { formatCents } = await import("@/lib/money");
const { ensureProposal } = await import("@/lib/reimburse/server");
const { prepareProposalApproval, squadsConfig, squadsConnection } = await import("@/lib/solana/squads");

const config = squadsConfig();
if (!config) {
  console.error("Squads isn't set up: add the SQUADS_* addresses to .env.local.");
  process.exit(1);
}
const conn = await squadsConnection();

const { data: treasurer } = await db().from("members").select("solana_address").eq("role", "treasurer").single();
const { data: rows } = await db()
  .from("reimbursement_requests")
  .select("id, total_cents, vendor")
  .eq("status", "queued")
  .order("created_at");

for (const row of rows ?? []) {
  const index = await ensureProposal(row.id);
  console.log(`\n${row.vendor} ${formatCents(row.total_cents)} → proposal #${index}`);
  if (index === null) continue;

  const [proposalPda] = multisig.getProposalPda({ multisigPda: config.multisig, transactionIndex: index });
  const proposal = await multisig.accounts.Proposal.fromAccountAddress(conn, proposalPda);
  console.log(`  proposal status on-chain: ${proposal.status.__kind}`);

  const prep = await prepareProposalApproval(config, index, treasurer!.solana_address);
  if (prep.status !== "ready") {
    console.log(`  approval: ${prep.status}`);
    continue;
  }
  const tx = VersionedTransaction.deserialize(Buffer.from(prep.payment.wire, "base64"));
  const sim = await conn.simulateTransaction(tx, { sigVerify: false });
  const err = sim.value.err ? JSON.stringify(sim.value.err) : "none";
  console.log(`  approve + pay, simulated without sending: error ${err}`);
  const notable = (sim.value.logs ?? []).filter((l) => /Instruction:|Error|success|failed/.test(l));
  for (const l of notable.slice(0, 12)) console.log(`    ${l}`);
}
