import "server-only";
import {
  address,
  appendTransactionMessageInstructions,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getAddMemoInstruction } from "@solana-program/memo";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import { centsToUnits } from "@/lib/money";
import { getDollarBalance } from "./balance";
import { validateMemo } from "./memo";
import { DOLLAR_DECIMALS, getDollarMint } from "./mint";
import { getDevnetRpc } from "./rpc";
import { getTreasurySigner, type SignedPayment } from "./treasury";

export class NotEnoughMoneyError extends Error {}

/**
 * Build a dues payment from the member to the club treasury.
 *
 * The treasury signs now as FEE PAYER only (members never need SOL). The
 * member still has to approve it in the browser. Because the treasury's
 * signature covers the exact payment, any change to it (amount, recipient)
 * makes the signature invalid and the network rejects it.
 *
 * Returns the payment's signature (save it before handing the payment out)
 * and the partly-signed payment as base64.
 */
export async function prepareDuesPayment(
  memberAddress: string,
  amountCents: number,
  memo: string,
): Promise<SignedPayment> {
  const amount = centsToUnits(amountCents);
  validateMemo(memo);

  if ((await getDollarBalance(memberAddress)) < amount) {
    throw new NotEnoughMoneyError("Member doesn't have enough dollars for dues");
  }

  const rpc = await getDevnetRpc();
  const treasury = await getTreasurySigner();
  const mint = getDollarMint();
  const member = createNoopSigner(address(memberAddress)); // signs later, in the browser
  const [[from], [to]] = await Promise.all([
    findAssociatedTokenPda({ owner: member.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS }),
    findAssociatedTokenPda({ owner: treasury.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS }),
  ]);
  const { value: blockhash } = await rpc.getLatestBlockhash().send();

  const tx = await partiallySignTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(treasury, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) =>
        appendTransactionMessageInstructions(
          [
            getTransferCheckedInstruction({
              source: from,
              mint,
              destination: to,
              authority: member,
              amount,
              decimals: DOLLAR_DECIMALS,
            }),
            getAddMemoInstruction({ memo }),
          ],
          m,
        ),
    ),
  );

  return {
    signature: getSignatureFromTransaction(tx),
    wire: getBase64EncodedWireTransaction(tx),
  };
}

/**
 * Check a payment the browser sent back after the member approved it.
 * It must be the exact payment we prepared (same treasury signature) and
 * must carry the member's approval. Returns it ready to send.
 */
export function checkApprovedDuesPayment(
  wireBase64: string,
  expectedSignature: string,
  memberAddress: string,
): string {
  let tx;
  try {
    tx = getTransactionDecoder().decode(getBase64Encoder().encode(wireBase64));
  } catch {
    throw new Error("Not a valid payment");
  }
  if (getSignatureFromTransaction(tx) !== expectedSignature) {
    throw new Error("This isn't the payment we prepared");
  }
  if (!tx.signatures[address(memberAddress)]) {
    throw new Error("The member hasn't approved this payment");
  }
  return getBase64EncodedWireTransaction(tx);
}
