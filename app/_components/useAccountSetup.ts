"use client";

import { useEffect, useState } from "react";
import { useEnsureSolanaAccount } from "@/lib/wallets/useEnsureSolanaAccount";
import { useAuthFetch } from "./useAuthFetch";

/**
 * Right after login: make sure the person has an account behind the scenes
 * and has had their one-time $50 welcome (which also creates their members
 * row). Safe on every visit: the server only pays the welcome once.
 */
export function useAccountSetup(): "setting_up" | "ready" | "failed" {
  const account = useEnsureSolanaAccount();
  const authFetch = useAuthFetch();
  const [welcomed, setWelcomed] = useState(false);

  useEffect(() => {
    if (account !== "ready") return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 20 && !cancelled; i++) {
        try {
          const res = await authFetch("/api/welcome", { method: "POST" });
          if (res.ok && ((await res.json()) as { status: string }).status === "sent") break;
        } catch {
          // try again below
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!cancelled) setWelcomed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authFetch]);

  if (account === "failed") return "failed";
  return welcomed ? "ready" : "setting_up";
}
