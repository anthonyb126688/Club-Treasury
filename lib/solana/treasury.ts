import "server-only";
import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import type { ChainStatus } from "@/lib/welcome/decide";
import { getDevnetRpc } from "./rpc";

// The ONLY place that loads the club treasury key (CLAUDE.md). Server-only.
// The treasury pays every network fee, so members never need SOL.

let signer: Promise<KeyPairSigner> | null = null;

export function getTreasurySigner(): Promise<KeyPairSigner> {
  signer ??= (async () => {
    const secret = process.env.TREASURY_SECRET_KEY;
    if (!secret) throw new Error("TREASURY_SECRET_KEY is not set");
    return createKeyPairSignerFromBytes(getBase58Encoder().encode(secret));
  })();
  return signer;
}

export type SignedPayment = { signature: string; wire: string };

/**
 * Build and sign a payment with the treasury as fee payer, without sending
 * it. Callers save the signature first, so a retry can check whether it
 * landed instead of paying twice.
 */
export async function signWithTreasury(instructions: Instruction[]): Promise<SignedPayment> {
  const rpc = await getDevnetRpc();
  const treasury = await getTreasurySigner();
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const tx = await signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(treasury, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    ),
  );
  return {
    signature: getSignatureFromTransaction(tx),
    wire: getBase64EncodedWireTransaction(tx),
  };
}

export async function submit(payment: Pick<SignedPayment, "wire">): Promise<void> {
  const rpc = await getDevnetRpc();
  await rpc
    .sendTransaction(payment.wire as Parameters<typeof rpc.sendTransaction>[0], {
      encoding: "base64",
    })
    .send();
}

export async function getChainStatus(signature: string): Promise<ChainStatus> {
  const rpc = await getDevnetRpc();
  const { value } = await rpc
    .getSignatureStatuses([signature as Parameters<typeof rpc.getSignatureStatuses>[0][number]], {
      searchTransactionHistory: true,
    })
    .send();
  const s = value[0];
  if (!s) return "not_found";
  if (s.err) return "failed";
  if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") {
    return "confirmed";
  }
  return "processing";
}

/** Poll until confirmed/failed, or give up after `timeoutMs` and say "processing". */
export async function waitForConfirmation(
  signature: string,
  timeoutMs = 20_000,
): Promise<ChainStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getChainStatus(signature);
    if (status === "confirmed" || status === "failed") return status;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return "processing";
}
