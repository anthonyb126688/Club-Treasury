import "server-only";
import { createSolanaRpc } from "@solana/kit";

// Devnet only (CLAUDE.md). Every Solana network has a fixed "genesis hash";
// we check it so a mainnet URL pasted into HELIUS_DEVNET_RPC_URL by mistake
// is refused instead of silently used.
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

let checked: Promise<ReturnType<typeof createSolanaRpc>> | null = null;

/** A Solana RPC client that is guaranteed to be talking to devnet. */
export function getDevnetRpc() {
  checked ??= (async () => {
    const url = process.env.HELIUS_DEVNET_RPC_URL;
    if (!url) throw new Error("HELIUS_DEVNET_RPC_URL is not set");
    const rpc = createSolanaRpc(url);
    const genesis = await rpc.getGenesisHash().send();
    if (genesis !== DEVNET_GENESIS_HASH) {
      throw new Error("HELIUS_DEVNET_RPC_URL is not a devnet endpoint; refusing to use it");
    }
    return rpc;
  })().catch((err) => {
    checked = null; // allow a retry after the env var is fixed
    throw err;
  });
  return checked;
}
