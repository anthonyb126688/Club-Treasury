import "server-only";
import * as multisig from "@sqds/multisig";
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  address,
  AccountRole,
  createNoopSigner,
  getBase58Decoder,
  isSignerRole,
  isWritableRole,
  type Instruction,
} from "@solana/kit";
import { getAddMemoInstruction } from "@solana-program/memo";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import { centsToUnits } from "@/lib/money";
import { allowanceRemaining, ONE_DAY_SECONDS } from "./allowance";
import { validateMemo } from "./memo";
import { DOLLAR_DECIMALS, getDollarMint } from "./mint";
import { getDevnetRpc } from "./rpc";
import {
  getTreasuryKeypairForSquads,
  getTreasurySigner,
  submit,
  waitForConfirmation,
  type SignedPayment,
} from "./treasury";

// The club's Squads vault (CLAUDE.md "Squads vault").
//   * Instant reimbursements: the server spends from its daily allowance
//     (a Squads spending limit). Squads itself refuses anything over it.
//   * Bigger payments: the server opens a proposal (it's a propose-only
//     member); the treasurer approves + executes it with their own account.
// The Squads SDK uses @solana/web3.js v1; the rest of the app uses
// @solana/kit. The small converters below move instructions between them.

export const VAULT_INDEX = 0;

export type SquadsConfig = { multisig: PublicKey; vault: PublicKey; spendingLimit: PublicKey };

/** The vault addresses stored on a club's row (lib/orgs). */
export type VaultAddresses = {
  squads_multisig_address: string | null;
  squads_vault_address: string | null;
  squads_spending_limit_address: string | null;
};

/** A club's Squads addresses, or null if its vault isn't set up yet. */
export function squadsConfigFor(org: VaultAddresses): SquadsConfig | null {
  const ms = org.squads_multisig_address;
  const vault = org.squads_vault_address;
  const limit = org.squads_spending_limit_address;
  if (!ms || !vault || !limit) return null;
  const config = {
    multisig: new PublicKey(ms),
    vault: new PublicKey(vault),
    spendingLimit: new PublicKey(limit),
  };
  // Guard against a mixed-up address: money sent to the multisig address
  // itself can be lost, so the vault must be the one Squads derives.
  const [expected] = multisig.getVaultPda({ multisigPda: config.multisig, index: VAULT_INDEX });
  if (!expected.equals(config.vault)) {
    throw new Error("Vault address doesn't match the club's multisig (vault 0)");
  }
  return config;
}

export class ClubNotReadyError extends Error {
  constructor() {
    super("This club's vault isn't set up yet");
  }
}

/** Where a club's money lives: its Squads vault. */
export function clubHolderAddress(org: VaultAddresses): string {
  const config = squadsConfigFor(org);
  if (!config) throw new ClubNotReadyError();
  return config.vault.toBase58();
}

let connection: Connection | null = null;

/** web3.js connection for the Squads SDK, only after rpc.ts has confirmed devnet. */
export async function squadsConnection(): Promise<Connection> {
  await getDevnetRpc(); // throws unless HELIUS_DEVNET_RPC_URL is devnet
  connection ??= new Connection(process.env.HELIUS_DEVNET_RPC_URL!, "confirmed");
  return connection;
}

// ---- kit <-> web3.js instruction converters --------------------------------

export function web3ToKit(ix: TransactionInstruction): Instruction {
  return {
    programAddress: address(ix.programId.toBase58()),
    accounts: ix.keys.map((k) => ({
      address: address(k.pubkey.toBase58()),
      role: k.isSigner
        ? k.isWritable
          ? AccountRole.WRITABLE_SIGNER
          : AccountRole.READONLY_SIGNER
        : k.isWritable
          ? AccountRole.WRITABLE
          : AccountRole.READONLY,
    })),
    data: new Uint8Array(ix.data),
  };
}

export function kitToWeb3(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a) => ({
      pubkey: new PublicKey(a.address),
      isSigner: isSignerRole(a.role),
      isWritable: isWritableRole(a.role),
    })),
    data: Buffer.from(ix.data ?? new Uint8Array()),
  });
}

async function tokenAccount(owner: string) {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: getDollarMint(),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return ata;
}

// ---- The server's daily allowance -------------------------------------------

/** How much of today's allowance is left, in base units (6 decimals). */
export async function allowanceLeft(config: SquadsConfig): Promise<bigint> {
  const limit = await multisig.accounts.SpendingLimit.fromAccountAddress(
    await squadsConnection(),
    config.spendingLimit,
  );
  const period = Number(limit.period);
  const periodSeconds =
    period === multisig.types.Period.Day
      ? ONE_DAY_SECONDS
      : period === multisig.types.Period.Week
        ? ONE_DAY_SECONDS * BigInt(7)
        : period === multisig.types.Period.Month
          ? ONE_DAY_SECONDS * BigInt(30)
          : null;
  return allowanceRemaining(
    {
      amount: BigInt(limit.amount.toString()),
      remaining: BigInt(limit.remainingAmount.toString()),
      lastReset: BigInt(limit.lastReset.toString()),
      periodSeconds,
    },
    BigInt(Math.floor(Date.now() / 1000)),
  );
}

/**
 * Instructions that pay `to` from the vault using the server's allowance.
 * Sign and send them with signWithTreasury (the treasury pays the fee and is
 * the allowance's spender). Squads rejects the whole thing if it's over the
 * allowance.
 */
export async function allowancePaymentInstructions(
  config: SquadsConfig,
  to: string,
  amountCents: number,
  memo: string,
): Promise<Instruction[]> {
  const amount = centsToUnits(amountCents);
  validateMemo(memo);
  const treasury = await getTreasurySigner();
  const mint = getDollarMint();
  const toAccount = await tokenAccount(to);

  const use = multisig.instructions.spendingLimitUse({
    multisigPda: config.multisig,
    member: new PublicKey(treasury.address),
    spendingLimit: config.spendingLimit,
    mint: new PublicKey(mint),
    vaultIndex: VAULT_INDEX,
    amount: Number(amount),
    decimals: DOLLAR_DECIMALS,
    destination: new PublicKey(to),
  });

  return [
    getCreateAssociatedTokenIdempotentInstruction({
      payer: treasury,
      ata: toAccount,
      owner: address(to),
      mint,
    }),
    web3ToKit(use),
    getAddMemoInstruction({ memo, signers: [treasury] }),
  ];
}

// ---- Proposals: bigger payments the treasurer approves ----------------------

export function signatureOf(tx: VersionedTransaction): string {
  return getBase58Decoder().decode(tx.signatures[0]);
}

/**
 * Send a signed web3.js transaction and poll until it settles. (We don't use
 * web3.js's confirmTransaction: it waits on a websocket that can hang.)
 */
export async function sendWeb3(tx: VersionedTransaction) {
  const wire = Buffer.from(tx.serialize()).toString("base64");
  await submit({ wire });
  return waitForConfirmation(signatureOf(tx));
}

/**
 * Open a proposal for "pay `to` this amount from the vault". The server
 * signs as a propose-only member; nothing moves until the treasurer approves.
 * Returns the proposal's transaction index.
 */
export async function createPaymentProposal(
  config: SquadsConfig,
  to: string,
  amountCents: number,
  memo: string,
): Promise<bigint> {
  const amount = centsToUnits(amountCents);
  validateMemo(memo);
  const conn = await squadsConnection();
  const server = getTreasuryKeypairForSquads();
  const treasury = await getTreasurySigner();
  const mint = getDollarMint();
  const vault = config.vault.toBase58();
  const [fromAccount, toAccount] = await Promise.all([tokenAccount(vault), tokenAccount(to)]);

  // What the vault will do once approved: transfer + public memo.
  const inner = [
    getTransferCheckedInstruction({
      source: fromAccount,
      mint,
      destination: toAccount,
      authority: createNoopSigner(address(vault)), // the vault signs inside Squads
      amount,
      decimals: DOLLAR_DECIMALS,
    }),
    getAddMemoInstruction({ memo }),
  ].map(kitToWeb3);

  for (let attempt = 0; attempt < 3; attempt++) {
    const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, config.multisig);
    const index = BigInt(ms.transactionIndex.toString()) + BigInt(1);
    const { blockhash } = await conn.getLatestBlockhash();

    const message = new TransactionMessage({
      payerKey: config.vault,
      recentBlockhash: blockhash,
      instructions: inner,
    });

    const outer = [
      // The member's dollar account must exist before the payment runs.
      kitToWeb3(
        getCreateAssociatedTokenIdempotentInstruction({
          payer: treasury,
          ata: toAccount,
          owner: address(to),
          mint,
        }),
      ),
      multisig.instructions.vaultTransactionCreate({
        multisigPda: config.multisig,
        transactionIndex: index,
        creator: server.publicKey,
        rentPayer: server.publicKey,
        vaultIndex: VAULT_INDEX,
        ephemeralSigners: 0,
        transactionMessage: message,
      }),
      multisig.instructions.proposalCreate({
        multisigPda: config.multisig,
        transactionIndex: index,
        creator: server.publicKey,
        rentPayer: server.publicKey,
      }),
    ];

    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: server.publicKey,
        recentBlockhash: blockhash,
        instructions: outer,
      }).compileToV0Message(),
    );
    tx.sign([server]);

    try {
      const status = await sendWeb3(tx);
      if (status === "confirmed") return index;
    } catch (err) {
      // Most likely someone else took this index at the same moment; retry.
      console.error("proposal create failed:", (err as Error).message);
    }
  }
  throw new Error("Couldn't open a proposal for this payment");
}

export type ApprovalPrep =
  | { status: "ready"; payment: SignedPayment }
  | { status: "executed" }
  | { status: "unavailable" };

/** Is this address a voting member of the vault? */
export async function isVaultApprover(config: SquadsConfig, who: string): Promise<boolean> {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(
    await squadsConnection(),
    config.multisig,
  );
  const member = ms.members.find((m) => m.key.toBase58() === who);
  return !!member && multisig.types.Permissions.has(member.permissions, multisig.types.Permission.Vote);
}

/**
 * Build "approve + pay out" for a proposal, for the treasurer's account to
 * approve in the browser. The server signs now as fee payer only.
 */
export async function prepareProposalApproval(
  config: SquadsConfig,
  transactionIndex: bigint,
  treasurer: string,
): Promise<ApprovalPrep> {
  const conn = await squadsConnection();
  const server = getTreasuryKeypairForSquads();
  const member = new PublicKey(treasurer);
  const [proposalPda] = multisig.getProposalPda({ multisigPda: config.multisig, transactionIndex });

  let proposal;
  try {
    proposal = await multisig.accounts.Proposal.fromAccountAddress(conn, proposalPda);
  } catch {
    return { status: "unavailable" };
  }
  const kind = proposal.status.__kind;
  if (kind === "Executed") return { status: "executed" };
  if (kind !== "Active" && kind !== "Approved") return { status: "unavailable" };

  // Adding/removing an approver cancels every older open proposal on-chain
  // ("stale"). Treat those as gone so the caller opens a fresh one.
  const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, config.multisig);
  if (transactionIndex <= BigInt(ms.staleTransactionIndex.toString())) return { status: "unavailable" };

  const ixs: TransactionInstruction[] = [];
  if (kind === "Active") {
    ixs.push(
      multisig.instructions.proposalApprove({ multisigPda: config.multisig, transactionIndex, member }),
    );
  }
  const { instruction: execute, lookupTableAccounts } =
    await multisig.instructions.vaultTransactionExecute({
      connection: conn,
      multisigPda: config.multisig,
      transactionIndex,
      member,
    });
  ixs.push(execute);

  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: server.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message(lookupTableAccounts),
  );
  tx.sign([server]); // fee payer only; the treasurer signs in the browser

  return {
    status: "ready",
    payment: { signature: signatureOf(tx), wire: Buffer.from(tx.serialize()).toString("base64") },
  };
}
