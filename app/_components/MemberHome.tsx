"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { useEnsureSolanaAccount } from "@/lib/wallets/useEnsureSolanaAccount";

type BalanceResponse = {
  email: string | null;
  balance: string | null;
  ready: boolean;
};

export function MemberHome() {
  const { getAccessToken, logout, user } = usePrivy();
  const account = useEnsureSolanaAccount();
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const failed = loadFailed || account === "failed";

  useEffect(() => {
    if (account !== "ready") return;
    let cancelled = false;
    let tries = 0;

    async function load() {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/balance", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const body = (await res.json()) as BalanceResponse;
        if (cancelled) return;
        setData(body);
        // Right after a first login the account may still be getting set up.
        if (!body.ready && ++tries < 15) setTimeout(load, 2000);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [account, getAccessToken]);

  const email = data?.email ?? user?.email?.address ?? "";

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Logged in as</p>
        <p className="break-all text-lg font-medium">{email}</p>
      </div>

      <div className="rounded-2xl bg-zinc-100 p-6 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Your balance</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">
          {failed
            ? "—"
            : data?.ready
              ? data.balance
              : "…"}
        </p>
        {failed && (
          <p className="mt-2 text-sm text-red-600">
            We couldn&apos;t load your balance. Refresh to try again.
          </p>
        )}
        {!failed && (account === "checking" || (data && !data.ready)) && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Setting up your account…
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={logout}
        className="self-start text-sm text-zinc-600 underline dark:text-zinc-400"
      >
        Log out
      </button>
    </div>
  );
}
