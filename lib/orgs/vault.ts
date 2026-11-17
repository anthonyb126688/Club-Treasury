import "server-only";
import * as multisig from "@sqds/multisig";
import { Keypair, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { address } from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token";
import { db } from "@/lib/db";
import { centsToUnits } from "@/lib/money";
import { checkApprovedPayment } from "@/lib/solana/dues";
import { getDollarMint } from "@/lib/solana/mint";
import {
  kitToWeb3,
  sendWeb3,
  signatureOf,
  squadsConfigFor,
  squadsConnection,
  VAULT_INDEX,
} from "@/lib/solana/squads";
import {
  getChainStatus,
  getTreasuryKeypairForSquads,
  getTreasurySigner,
  submit,
  waitForConfirmation,
} from "@/lib/solana/treasury";
import type { Org } from "./orgs";

// Each club's Squads vault (CLAUDE.md "Squads vault"):
//   * createClubVault: when a club is created. The club's treasurer is the
//     only voter; the server is propose-only and gets a daily allowance equal
//     to the club's daily auto-approve limit. Then the settings are locked.
//   * prepare/finishVaultChange: later changes (new daily allowance, add or
//     remove a co-treasurer). The server opens a Squads config proposal; the
//     treasurer's own account approves + applies it silently.

const { Permission, Permissions, Period } = multisig.types;

function tx(payer: PublicKey, blockhash: string, instructions: TransactionInstruction[]) {
  return new VersionedTransaction(
    new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions }).compileToV0Message(),
  );
}

async function setOrg(orgId: string, fields: Record<string, unknown>) {
  const { error } = await db().from("orgs").update(fields).eq("id", orgId);
  if (error) throw new Error(`org update: ${error.message}`);
}

/**
 * Create (or finish creating) a club's vault. Safe to call again after a
 * failure: it picks up where it left off. Addresses are saved BEFORE each
 * step is sent, so they can never be lost.
 */
export async function createClubVault(
  orgId: string,
  treasurerAddress: string,
  dailyLimitCents: number,
): Promise<"ready" | "failed"> {
  try {
    const conn = await squadsConnection();
    const server = getTreasuryKeypairForSquads();
    const { data: org, error } = await db()
      .from("orgs")
      .select("squads_multisig_address, squads_spending_limit_address")
      .eq("id", orgId)
      .single();
    if (error) throw new Error(error.message);

    // Step 1: the multisig (treasurer = only voter; server = propose-only).
    let multisigPda: PublicKey;
    if (org.squads_multisig_address) {
      multisigPda = new PublicKey(org.squads_multisig_address);
    } else {
      const createKey = Keypair.generate();
      [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
      const [vaultPda] = multisig.getVaultPda({ multisigPda, index: VAULT_INDEX });
      const [programConfigPda] = multisig.getProgramConfigPda({});
      const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(conn, programConfigPda);
      const { blockhash } = await conn.getLatestBlockhash();
      const create = tx(server.publicKey, blockhash, [
        multisig.instructions.multisigCreateV2({
          treasury: programConfig.treasury,
          creator: server.publicKey,
          multisigPda,
          configAuthority: server.publicKey, // temporary; removed in step 2
          threshold: 1,
          members: [
            { key: new PublicKey(treasurerAddress), permissions: Permissions.all() },
            { key: server.publicKey, permissions: Permissions.fromPermissions([Permission.Initiate]) },
          ],
          timeLock: 0,
          createKey: createKey.publicKey,
          rentCollector: null,
          memo: "club-treasury:create-vault",
        }),
      ]);
      create.sign([server, createKey]);
      await setOrg(orgId, {
        squads_multisig_address: multisigPda.toBase58(),
        squads_vault_address: vaultPda.toBase58(),
        vault_status: "pending",
      });
      if ((await sendWeb3(create)) !== "confirmed") throw new Error("vault create didn't confirm");
    }

    // Step 2: the daily allowance + the vault's dollar account, then lock.
    const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda);
    if (ms.configAuthority.equals(server.publicKey)) {
      const seed = Keypair.generate().publicKey;
      const [spendingLimitPda] = multisig.getSpendingLimitPda({ multisigPda, createKey: seed });
      const [vaultPda] = multisig.getVaultPda({ multisigPda, index: VAULT_INDEX });
      const treasury = await getTreasurySigner();
      const mint = getDollarMint();
      const [vaultTokenAccount] = await findAssociatedTokenPda({
        owner: address(vaultPda.toBase58()),
        mint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      const { blockhash } = await conn.getLatestBlockhash();
      const setup = tx(server.publicKey, blockhash, [
        kitToWeb3(
          getCreateAssociatedTokenIdempotentInstruction({
            payer: treasury,
            ata: vaultTokenAccount,
            owner: address(vaultPda.toBase58()),
            mint,
          }),
        ),
        multisig.instructions.multisigAddSpendingLimit({
          multisigPda,
          configAuthority: server.publicKey,
          spendingLimit: spendingLimitPda,
          rentPayer: server.publicKey,
          createKey: seed,
          vaultIndex: VAULT_INDEX,
          mint: new PublicKey(mint),
          amount: centsToUnits(Math.max(dailyLimitCents, 1)),
          period: Period.Day,
          members: [server.publicKey],
          destinations: [],
          memo: "club-treasury:daily-allowance",
        }),
        multisig.instructions.multisigSetConfigAuthority({
          multisigPda,
          configAuthority: server.publicKey,
          newConfigAuthority: PublicKey.default, // locked: changes need the treasurer's vote
          memo: "club-treasury:lock-settings",
        }),
      ]);
      setup.sign([server]);
      await setOrg(orgId, { squads_spending_limit_address: spendingLimitPda.toBase58() });
      if ((await sendWeb3(setup)) !== "confirmed") throw new Error("vault setup didn't confirm");
    }

    await setOrg(orgId, { vault_status: "ready" });
    return "ready";
  } catch (err) {
    console.error("club vault setup failed:", (err as Error).message);
    await setOrg(orgId, { vault_status: "failed" }).catch(() => {});
    return "failed";
  }
}

// ---- Changes the treasurer approves on-chain ----------------------------------

export type VaultChange =
  | { kind: "set_daily_limit"; cents: number }
  | { kind: "add_approver"; userId: string; address: string }
  | { kind: "remove_approver"; userId: string; address: string; then: "demote" | "remove" };

export type VaultChangeStart =
  | { status: "ready"; changeId: string; transaction: string }
  | { status: "not_ready" | "failed" };

/**
 * Step 1: open a Squads config proposal for this change (the server signs
 * as proposer) and build "approve + apply" for the treasurer's account to
 * sign silently in the browser.
 */
export async function prepareVaultChange(
  org: Org,
  change: VaultChange,
  treasurer: { userId: string; solanaAddress: string },
): Promise<VaultChangeStart> {
  const config = squadsConfigFor(org);
  if (!config) return { status: "not_ready" };
  // Finish any earlier change first, so the vault's current state is known.
  await settleVaultChanges(org.id);
  const conn = await squadsConnection();
  const server = getTreasuryKeypairForSquads();
  const member = new PublicKey(treasurer.solanaAddress);

  // One or more Squads config proposals. (Removing and adding a spending
  // limit must be separate proposals: Squads rejects both in one execute.)
  type Step = { actions: multisig.types.ConfigAction[]; spendingLimits?: PublicKey[] };
  let steps: Step[];
  let payload: Record<string, unknown> = { ...change };
  if (change.kind === "set_daily_limit") {
    const seed = Keypair.generate().publicKey;
    const [newLimit] = multisig.getSpendingLimitPda({ multisigPda: config.multisig, createKey: seed });
    steps = [
      {
        actions: [{ __kind: "RemoveSpendingLimit", spendingLimit: config.spendingLimit }],
        spendingLimits: [config.spendingLimit],
      },
      {
        actions: [
          {
            __kind: "AddSpendingLimit",
            createKey: seed,
            vaultIndex: VAULT_INDEX,
            mint: new PublicKey(getDollarMint()),
            amount: Number(centsToUnits(Math.max(change.cents, 1))), // max $9M: fits a JS number
            period: Period.Day,
            members: [server.publicKey],
            destinations: [],
          },
        ],
        spendingLimits: [newLimit],
      },
    ];
    payload = { ...change, newSpendingLimit: newLimit.toBase58() };
  } else if (change.kind === "add_approver") {
    steps = [{ actions: [{ __kind: "AddMember", newMember: { key: new PublicKey(change.address), permissions: Permissions.all() } }] }];
  } else {
    steps = [{ actions: [{ __kind: "RemoveMember", oldMember: new PublicKey(change.address) }] }];
  }

  // Open the proposals in one go (retry if someone took the same indexes).
  let firstIndex: bigint | null = null;
  for (let attempt = 0; attempt < 3 && firstIndex === null; attempt++) {
    const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, config.multisig);
    const base = BigInt(ms.transactionIndex.toString()) + BigInt(1);
    const { blockhash } = await conn.getLatestBlockhash();
    const open = tx(
      server.publicKey,
      blockhash,
      steps.flatMap((step, i) => [
        multisig.instructions.configTransactionCreate({
          multisigPda: config.multisig,
          creator: server.publicKey,
          rentPayer: server.publicKey,
          transactionIndex: base + BigInt(i),
          actions: step.actions,
          memo: `club-treasury:${change.kind}`,
        }),
        multisig.instructions.proposalCreate({
          multisigPda: config.multisig,
          creator: server.publicKey,
          rentPayer: server.publicKey,
          transactionIndex: base + BigInt(i),
        }),
      ]),
    );
    open.sign([server]);
    try {
      if ((await sendWeb3(open)) === "confirmed") firstIndex = base;
    } catch (err) {
      console.error("config proposal failed:", (err as Error).message);
    }
  }
  if (firstIndex === null) return { status: "failed" };
  const index = firstIndex;

  // What the treasurer's account signs: approve + apply each step, in order,
  // in ONE transaction (one silent approval). The server pays the fee.
  const { blockhash } = await conn.getLatestBlockhash();
  const approve = tx(
    server.publicKey,
    blockhash,
    steps.flatMap((step, i) => [
      multisig.instructions.proposalApprove({ multisigPda: config.multisig, transactionIndex: index + BigInt(i), member }),
      multisig.instructions.configTransactionExecute({
        multisigPda: config.multisig,
        transactionIndex: index + BigInt(i),
        member,
        rentPayer: server.publicKey,
        spendingLimits: step.spendingLimits,
      }),
    ]),
  );
  approve.sign([server]);
  const wire = Buffer.from(approve.serialize()).toString("base64");

  const { data, error } = await db()
    .from("org_vault_changes")
    .insert({
      org_id: org.id,
      kind: change.kind,
      payload,
      requested_by: treasurer.userId,
      transaction_index: index.toString(),
      approval_tx: wire,
      approval_signature: signatureOf(approve),
    })
    .select("id")
    .single();
  if (error) throw new Error(`vault change save: ${error.message}`);
  return { status: "ready", changeId: data.id, transaction: wire };
}

/**
 * Step 2: the treasurer's account signed it. Check it's exactly what we
 * prepared, send it, and on success apply the change to the database too.
 */
export async function finishVaultChange(
  org: Org,
  changeId: string,
  treasurer: { userId: string; solanaAddress: string },
  signedWire: string,
): Promise<"done" | "processing" | "failed" | "conflict"> {
  const { data: change, error } = await db()
    .from("org_vault_changes")
    .select("id, kind, payload, approval_signature, status")
    .eq("id", changeId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (error) throw new Error(`vault change lookup: ${error.message}`);
  if (!change || change.status !== "prepared" || !change.approval_signature) return "conflict";

  let wire: string;
  try {
    wire = checkApprovedPayment(signedWire, change.approval_signature, treasurer.solanaAddress);
  } catch {
    return "conflict";
  }

  const { data: claimed } = await db()
    .from("org_vault_changes")
    .update({ status: "sent" })
    .eq("id", change.id)
    .eq("status", "prepared")
    .select("id");
  if (!claimed?.length) return "conflict";

  try {
    await submit({ wire });
  } catch (err) {
    console.error("vault change send failed:", (err as Error).message);
    await db().from("org_vault_changes").update({ status: "failed" }).eq("id", change.id);
    return "failed";
  }
  const result = await waitForConfirmation(change.approval_signature);
  if (result === "failed") {
    await db().from("org_vault_changes").update({ status: "failed" }).eq("id", change.id);
    return "failed";
  }
  if (result !== "confirmed") return "processing";

  await applyVaultChange(org.id, change.kind, change.payload);
  await db().from("org_vault_changes").update({ status: "done" }).eq("id", change.id);
  return "done";
}

/** A sent change older than this that never showed up on-chain can't land anymore. */
const VAULT_CHANGE_STALE_MS = 2 * 60 * 1000;

/**
 * Finish vault changes whose confirmation we stopped waiting for ("sent"):
 * apply them if they landed on-chain, mark them failed if they never will.
 * Safe to call any time (e.g. when loading the members or settings page).
 */
export async function settleVaultChanges(orgId: string): Promise<void> {
  const { data, error } = await db()
    .from("org_vault_changes")
    .select("id, kind, payload, approval_signature, created_at")
    .eq("org_id", orgId)
    .eq("status", "sent");
  if (error) throw new Error(`vault changes lookup: ${error.message}`);
  for (const change of data ?? []) {
    if (!change.approval_signature) continue;
    const chain = await getChainStatus(change.approval_signature);
    if (chain === "confirmed") {
      const { data: claimed } = await db()
        .from("org_vault_changes")
        .update({ status: "done" })
        .eq("id", change.id)
        .eq("status", "sent")
        .select("id");
      if (claimed?.length) await applyVaultChange(orgId, change.kind, change.payload);
    } else if (
      chain === "failed" ||
      (chain === "not_found" && Date.now() - new Date(change.created_at).getTime() > VAULT_CHANGE_STALE_MS)
    ) {
      await db().from("org_vault_changes").update({ status: "failed" }).eq("id", change.id).eq("status", "sent");
    }
  }
}

/** Mirror a confirmed on-chain change in the database. */
async function applyVaultChange(orgId: string, kind: string, payload: Record<string, unknown>) {
  if (kind === "set_daily_limit") {
    await setOrg(orgId, { squads_spending_limit_address: payload.newSpendingLimit });
    await db()
      .from("org_settings")
      .update({ daily_auto_approve_limit_cents: payload.cents, updated_at: new Date().toISOString() })
      .eq("org_id", orgId);
  } else if (kind === "add_approver") {
    await db()
      .from("org_memberships")
      .update({ role: "treasurer" })
      .eq("org_id", orgId)
      .eq("privy_user_id", payload.userId as string)
      .eq("status", "active");
  } else if (kind === "remove_approver") {
    await db()
      .from("org_memberships")
      .update(payload.then === "remove" ? { status: "removed", role: "member" } : { role: "member" })
      .eq("org_id", orgId)
      .eq("privy_user_id", payload.userId as string);
  }
}
