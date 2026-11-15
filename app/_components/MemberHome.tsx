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
  const [welcoming, setWelcoming] = useState(true);
  const failed = loadFailed || account === "failed";

  useEffect(() => {
    if (account !== "ready") return;
    let cancelled = false;
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

    async function authHeader() {
      return { Authorization: `Bearer ${await getAccessToken()}` };
    }

    // New members get a one-time $50. The server makes sure it's only paid
    // once, so calling this on every visit is safe; for existing members it
    // answers "sent" straight away.
    async function welcome() {
      for (let i = 0; i < 20 && !cancelled; i++) {
        const res = await fetch("/api/welcome", { method: "POST", headers: await authHeader() });
        if (res.ok && ((await res.json()) as { status: string }).status === "sent") return;
        await pause(3000);
      }
    }

    async function loadBalance() {
      for (let i = 0; i < 15 && !cancelled; i++) {
        const res = await fetch("/api/balance", { headers: await authHeader() });
        if (!res.ok) throw new Error();
        const body = (await res.json()) as BalanceResponse;
        if (cancelled) return;
        setData(body);
        if (body.ready) return;
        await pause(2000);
      }
    }

    (async () => {
      try {
        await welcome();
      } catch {
        // If the welcome can't be paid right now, still show the balance.
      }
      if (!cancelled) setWelcoming(false);
      try {
        await loadBalance();
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();

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
        {!failed && (account === "checking" || welcoming || (data && !data.ready)) && (
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
