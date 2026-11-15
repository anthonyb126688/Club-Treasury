"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useWallets, type ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";

/** The member's Privy-created Solana account, ready to approve payments (or null). */
export function useMemberAccount(): ConnectedStandardSolanaWallet | null {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const linked = user?.linkedAccounts.find(
    (a) => a.type === "wallet" && a.chainType === "solana" && a.walletClientType === "privy",
  );
  const addr = linked && "address" in linked ? linked.address : null;
  return wallets.find((w) => w.address === addr) ?? null;
}
