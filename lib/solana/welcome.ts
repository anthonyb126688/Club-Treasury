import "server-only";
import { address } from "@solana/kit";
import { getAddMemoInstruction } from "@solana-program/memo";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToCheckedInstruction,
} from "@solana-program/token";
import { DOLLAR_DECIMALS, getDollarMint } from "./mint";
import { getTreasurySigner, signWithTreasury, type SignedPayment } from "./treasury";

/** $50.00 in base units (6 decimals). */
export const WELCOME_AMOUNT = BigInt(50_000_000);

/**
 * Sign (but don't send) the one-time $50 welcome payment to a new member.
 * Creates the member's dollar account if needed (treasury pays the fee),
 * issues $50 into it, and tags it with a memo for the public ledger.
 */
export async function signWelcomePayment(memberAddress: string): Promise<SignedPayment> {
  const treasury = await getTreasurySigner();
  const mint = getDollarMint();
  const owner = address(memberAddress);
  const [memberTokenAccount] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  return signWithTreasury([
    getCreateAssociatedTokenIdempotentInstruction({
      payer: treasury,
      ata: memberTokenAccount,
      owner,
      mint,
    }),
    getMintToCheckedInstruction({
      mint,
      token: memberTokenAccount,
      mintAuthority: treasury,
      amount: WELCOME_AMOUNT,
      decimals: DOLLAR_DECIMALS,
    }),
    getAddMemoInstruction({ memo: "club-treasury:welcome" }),
  ]);
}
