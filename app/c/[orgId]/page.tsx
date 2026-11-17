"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DuesCard } from "../../_components/DuesCard";
import { useOrg } from "../../_components/OrgProvider";
import { ReimbursementHistory } from "../../_components/ReimbursementHistory";
import { useAuthFetch } from "../../_components/useAuthFetch";

// A club's home for members: my balance, dues, Get reimbursed, my requests.
// (Phase 6 redesigns this screen; Phase 1 keeps today's features working.)
export default function ClubHome() {
  const { orgId, me, isTreasurer } = useOrg();
  const authFetch = useAuthFetch();
  const [balance, setBalance] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await authFetch("/api/balance");
      if (res.ok && !cancelled) setBalance(((await res.json()) as { balance: string | null }).balance);
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, reloadKey]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-12">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Logged in as</p>
        <p className="break-all text-lg font-medium">{me?.email}</p>
      </div>

      <div className="rounded-2xl bg-zinc-100 p-6 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Your balance</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">{balance ?? "…"}</p>
      </div>

      <DuesCard orgId={orgId} onPaid={reload} />
      <Link
        href={`/c/${orgId}/reimburse`}
        className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-center text-base font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Get reimbursed
      </Link>
      <ReimbursementHistory orgId={orgId} onChange={reload} />

      {isTreasurer && (
        <Link
          href={`/c/${orgId}/treasurer`}
          className="w-full rounded-xl border border-zinc-900 px-4 py-3 text-center font-medium dark:border-zinc-50"
        >
          Treasurer dashboard
        </Link>
      )}

      <Link
        href={`/ledger/${orgId}`}
        className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-center font-medium dark:border-zinc-800"
      >
        See where the money goes
      </Link>
    </main>
  );
}
