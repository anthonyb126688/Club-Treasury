"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/solana";
import { useEffect, useRef, useState } from "react";

/**
 * Make sure the logged-in member has a Privy-created Solana account.
 * Privy's `createOnLogin` setting doesn't fire for our own (headless) email
 * form, so we create it here, once, right after login.
 */
export function useEnsureSolanaAccount(): "checking" | "ready" | "failed" {
  const { ready, authenticated, user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const started = useRef(false);
  const [status, setStatus] = useState<"checking" | "ready" | "failed">("checking");

  const hasAccount = !!user?.linkedAccounts.some(
    (a) =>
      a.type === "wallet" &&
      a.chainType === "solana" &&
      a.walletClientType === "privy",
  );

  useEffect(() => {
    if (!ready || !authenticated || !user || hasAccount || started.current) return;
    started.current = true;
    createWallet()
      .then(() => setStatus("ready"))
      .catch((err: unknown) => {
        console.error("account setup failed:", (err as Error)?.message);
        setStatus("failed");
      });
  }, [ready, authenticated, user, hasAccount, createWallet]);

  return hasAccount ? "ready" : status;
}
