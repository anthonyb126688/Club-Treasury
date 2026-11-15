import "server-only";
import { address } from "@solana/kit";
import { getDevnetRpc } from "./rpc";
import { USDC_DEVNET_MINT } from "./usdc";

// Read-only: looks up balances. Never touches the treasury key.

/** Total devnet USDC owned by `owner`, in base units (6 decimals). */
export async function getUsdcBalance(owner: string): Promise<bigint> {
  const rpc = await getDevnetRpc();
  const { value } = await rpc
    .getTokenAccountsByOwner(
      address(owner),
      { mint: address(USDC_DEVNET_MINT) },
      { encoding: "jsonParsed" },
    )
    .send();

  let total = BigInt(0);
  for (const account of value) {
    total += BigInt(account.account.data.parsed.info.tokenAmount.amount);
  }
  return total;
}
