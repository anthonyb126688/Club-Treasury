import "server-only";
import { address } from "@solana/kit";
import { getAddMemoInstruction } from "@solana-program/memo";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToCheckedInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import { centsToUnits } from "@/lib/money";
import { getDollarBalance } from "./balance";
import { explorerTxUrl, validateMemo } from "./memo";
import { DOLLAR_DECIMALS, getDollarMint } from "./mint";
import {
  getTreasurySigner,
  signWithTreasury,
  submit,
  waitForConfirmation,
  type SignedPayment,
} from "./treasury";
import type { ChainStatus } from "@/lib/welcome/decide";

export type SendResult = {
  signature: string;
  status: ChainStatus;
  explorerUrl: string;
};

async function tokenAccountOf(owner: string) {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: getDollarMint(),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return ata;
}

/**
 * Sign (but don't send) a payment of `amountCents` from the club treasury to
 * `to`, tagged with a public memo. Creates the recipient's dollar account if
 * needed; the treasury pays every fee.
 *
 * For payments that must never happen twice (payouts), save the returned
 * signature BEFORE calling submit(), like app/api/welcome does.
 */
export async function signDollarTransfer(
  to: string,
  amountCents: number,
  memo: string,
): Promise<SignedPayment> {
  const amount = centsToUnits(amountCents);
  validateMemo(memo);

  const treasury = await getTreasurySigner();
  const balance = await getDollarBalance(treasury.address);
  if (balance < amount) {
    throw new Error("Club treasury doesn't have enough dollars for this payment");
  }

  const mint = getDollarMint();
  const recipient = address(to);
  const [fromAccount, toAccount] = await Promise.all([
    tokenAccountOf(treasury.address),
    tokenAccountOf(to),
  ]);

  return signWithTreasury([
    getCreateAssociatedTokenIdempotentInstruction({
      payer: treasury,
      ata: toAccount,
      owner: recipient,
      mint,
    }),
    getTransferCheckedInstruction({
      source: fromAccount,
      mint,
      destination: toAccount,
      authority: treasury,
      amount,
      decimals: DOLLAR_DECIMALS,
    }),
    getAddMemoInstruction({ memo, signers: [treasury] }),
  ]);
}

/** Sign, send, and wait for a treasury payment. */
export async function sendDollars(
  to: string,
  amountCents: number,
  memo: string,
): Promise<SendResult> {
  const payment = await signDollarTransfer(to, amountCents, memo);
  await submit(payment);
  const status = await waitForConfirmation(payment.signature);
  return { signature: payment.signature, status, explorerUrl: explorerTxUrl(payment.signature) };
}

/**
 * Add new test dollars to a club's vault (or, by default, the treasury), e.g.
 * starting funds or a sponsor. Only possible because the treasury issues our
 * test-dollar token; with real USDC this would be an incoming transfer.
 */
export async function depositToTreasury(
  amountCents: number,
  memo: string,
  owner?: string,
): Promise<SendResult> {
  const amount = centsToUnits(amountCents);
  validateMemo(memo);
  const treasury = await getTreasurySigner();
  const mint = getDollarMint();
  const holder = owner ?? treasury.address;
  const treasuryAccount = await tokenAccountOf(holder);

  const payment = await signWithTreasury([
    getCreateAssociatedTokenIdempotentInstruction({
      payer: treasury,
      ata: treasuryAccount,
      owner: address(holder),
      mint,
    }),
    getMintToCheckedInstruction({
      mint,
      token: treasuryAccount,
      mintAuthority: treasury,
      amount,
      decimals: DOLLAR_DECIMALS,
    }),
    getAddMemoInstruction({ memo, signers: [treasury] }),
  ]);
  await submit(payment);
  const status = await waitForConfirmation(payment.signature);
  return { signature: payment.signature, status, explorerUrl: explorerTxUrl(payment.signature) };
}
