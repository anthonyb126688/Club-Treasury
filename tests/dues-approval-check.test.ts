import {
  appendTransactionMessageInstructions,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  partiallySignTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
  type KeyPairSigner,
} from "@solana/kit";
import { getAddMemoInstruction } from "@solana-program/memo";
import { beforeAll, describe, expect, it } from "vitest";
import { checkApprovedDuesPayment } from "@/lib/solana/dues";

// The server only sends a dues payment if it's EXACTLY the one it prepared
// (same treasury signature) and the member approved it. These build payments
// offline with throwaway keys; nothing touches the network.

let treasury: KeyPairSigner;
let member: KeyPairSigner;
const blockhash = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: BigInt(100),
};

async function prepare(memo: string) {
  return partiallySignTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(treasury, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) =>
        appendTransactionMessageInstructions(
          [getAddMemoInstruction({ memo, signers: [createNoopSigner(member.address)] })],
          m,
        ),
    ),
  );
}

beforeAll(async () => {
  treasury = await generateKeyPairSigner();
  member = await generateKeyPairSigner();
});

describe("checkApprovedDuesPayment", () => {
  it("accepts the prepared payment once the member approved it", async () => {
    const prepared = await prepare("dues $25");
    const approved = await partiallySignTransaction([member.keyPair], prepared);
    const wire = getBase64EncodedWireTransaction(approved);
    expect(
      checkApprovedDuesPayment(wire, getSignatureFromTransaction(prepared), member.address),
    ).toBe(wire);
  });

  it("rejects it if the member hasn't approved it", async () => {
    const prepared = await prepare("dues $25");
    expect(() =>
      checkApprovedDuesPayment(
        getBase64EncodedWireTransaction(prepared),
        getSignatureFromTransaction(prepared),
        member.address,
      ),
    ).toThrow(/hasn't approved/);
  });

  it("rejects a different payment, even one the treasury also signed", async () => {
    const prepared = await prepare("dues $25");
    const swapped = await partiallySignTransaction([member.keyPair], await prepare("dues $1"));
    expect(() =>
      checkApprovedDuesPayment(
        getBase64EncodedWireTransaction(swapped),
        getSignatureFromTransaction(prepared),
        member.address,
      ),
    ).toThrow(/isn't the payment we prepared/);
  });

  it("rejects garbage", () => {
    expect(() => checkApprovedDuesPayment("not-a-payment", "sig", member.address)).toThrow();
  });
});
