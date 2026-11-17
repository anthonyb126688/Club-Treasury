"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DuesCard } from "../../_components/DuesCard";
import { useOrg } from "../../_components/OrgProvider";
import { ReimbursementHistory } from "../../_components/ReimbursementHistory";
import { useAuthFetch } from "../../_components/useAuthFetch";
import { ClubLinks } from "./_components/ClubLinks";

// A club's home for members (phone-first): club name, my balance, dues,
// a big Get reimbursed button, my requests, and links to the budget,
// the public ledger and (for treasurers) the treasurer area.
export default function ClubHome() {
  const { orgId, club, isTreasurer } = useOrg();
  const authFetch = useAuthFetch();
  const [balance, setBalance] = useState<string | null>(null);
  const [clubBalance, setClubBalance] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/balance");
        if (res.ok && !cancelled) setBalance(((await res.json()) as { balance: string | null }).balance);
      } catch {
        // Keep the last balance on screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, reloadKey]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-12">
      <div>
        {club?.school && <p className="text-sm text-zinc-600 dark:text-zinc-400">{club.school}</p>}
        <h1 className="text-2xl font-semibold tracking-tight break-words">{club?.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Your balance</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{balance ?? "…"}</p>
        </div>
        <div className="rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Club balance</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{clubBalance ?? "…"}</p>
        </div>
      </div>

      <Link
        href={`/c/${orgId}/reimburse`}
        className="flex w-full flex-col items-center rounded-2xl bg-zinc-900 px-4 py-6 text-center text-white active:opacity-90 dark:bg-zinc-50 dark:text-zinc-900"
      >
        <span className="text-xl font-semibold">Get reimbursed</span>
        <span className="mt-1 text-sm opacity-80">Snap a receipt, get paid back</span>
      </Link>

      <DuesCard orgId={orgId} onPaid={reload} onClubBalance={setClubBalance} refreshKey={reloadKey} />

      <ReimbursementHistory orgId={orgId} onChange={reload} />

      <ClubLinks orgId={orgId} isTreasurer={isTreasurer} />
    </main>
  );
}
