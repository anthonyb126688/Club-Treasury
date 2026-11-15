import "server-only";
import { address } from "@solana/kit";
import { getDollarMint } from "./mint";
import { getDevnetRpc } from "./rpc";

// Read-only: looks up balances. Never touches the treasury key.

/** Total club dollars owned by `owner`, in base units (6 decimals). */
export async function getDollarBalance(owner: string): Promise<bigint> {
  const rpc = await getDevnetRpc();
  const { value } = await rpc
    .getTokenAccountsByOwner(
      address(owner),
      { mint: getDollarMint() },
      { encoding: "jsonParsed" },
    )
    .send();

  let total = BigInt(0);
  for (const account of value) {
    total += BigInt(account.account.data.parsed.info.tokenAmount.amount);
  }
  return total;
}
