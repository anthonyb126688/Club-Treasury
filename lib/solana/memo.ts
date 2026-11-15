// Memo rules, kept separate from the server-only code so they can be tested.
// Memos are public and permanent on-chain: never put emails, names, or
// anything private in them. Use references like "club-treasury:dues:<id>".

export const MEMO_MAX_BYTES = 200;

export function validateMemo(memo: string): string {
  if (memo.length === 0) throw new Error("Memo can't be empty");
  if (new TextEncoder().encode(memo).length > MEMO_MAX_BYTES) {
    throw new Error(`Memo is longer than ${MEMO_MAX_BYTES} bytes`);
  }
  if (/[\u0000-\u001f\u007f]/.test(memo)) throw new Error("Memo has control characters");
  return memo;
}

/** Link to a payment on Solana Explorer (devnet). Used by "Verify" links. */
export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}
