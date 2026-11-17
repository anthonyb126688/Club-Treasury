"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DuesCard } from "../../_components/DuesCard";
import { useOrg } from "../../_components/OrgProvider";
import { ReimbursementHistory } from "../../_components/ReimbursementHistory";
import { useAuthFetch } from "../../_components/useAuthFetch";
import { memberPage, PageHeader } from "./_components/PageHeader";

// A club's home for members (phone-first): club name, my balance, dues,
// a big Get reimbursed button, and my requests. Budget, ledger and the
// treasurer pages are in the app shell's navigation.
export default function ClubHome() {
  const { orgId, club, me, isTreasurer } = useOrg();
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
    <main className={memberPage}>
      <PageHeader title={me?.firstName ? `Hi, ${me.firstName}` : "Home"} />
      {/* The club card: who you're with, and where the money stands. */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-700 p-5 text-white shadow-[0_18px_40px_-20px_rgb(17_51_39/0.7)] dark:bg-brand-800">
        <svg viewBox="0 0 64 48" aria-hidden className="pointer-events-none absolute top-5 right-0 h-12 w-16">
          <path d="M64 2 8 24l56 22z" className="fill-brand-600 dark:fill-brand-700" />
          <path d="M64 17 34 24l30 7z" className="fill-gold-400" />
        </svg>
        <div className="relative">
          <p className="flex items-center gap-2 text-sm text-brand-100">
            <span className="rounded-full bg-white/12 px-2 py-0.5 text-xs font-medium text-white">
              {isTreasurer ? "Treasurer" : "Member"}
            </span>
            {club?.school && <span className="truncate">{club.school}</span>}
          </p>
          <h2 className="mt-2 max-w-[80%] text-2xl font-semibold break-words">{club?.name}</h2>
        </div>
        <dl className="relative mt-8 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-brand-100">Your balance</dt>
            <dd className="mt-0.5 font-display text-3xl font-semibold tabular-nums">{balance ?? "…"}</dd>
          </div>
          <div className="border-l border-white/15 pl-4">
            <dt className="text-sm text-brand-100">Club balance</dt>
            <dd className="mt-0.5 font-display text-3xl font-semibold tabular-nums">{clubBalance ?? "…"}</dd>
          </div>
        </dl>
      </section>

      <Link
        href={`/c/${orgId}/reimburse`}
        className="group flex w-full items-center gap-4 rounded-3xl bg-gold-400 px-5 py-5 text-brand-950 hover:bg-gold-300"
      >
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-950/10">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl font-semibold">Get reimbursed</span>
          <span className="block text-sm text-brand-950/75">Snap a receipt, get paid back</span>
        </span>
      </Link>

      <DuesCard orgId={orgId} onPaid={reload} onClubBalance={setClubBalance} refreshKey={reloadKey} />

      <ReimbursementHistory orgId={orgId} onChange={reload} />
    </main>
  );
}
