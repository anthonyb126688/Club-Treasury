"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LedgerItem } from "@/lib/ledger/view";
import { headerAction, memberPage, PageHeader } from "../../c/[orgId]/_components/PageHeader";
import { Mark } from "../../_components/Mark";

type LedgerResponse = {
  club: { name: string; school: string };
  entries: LedgerItem[];
  showingNames: boolean;
  vaultUrl: string | null;
};

const REFRESH_MS = 5000;

// Public ledger: every dollar in and out, newest first. Refreshes itself
// every few seconds so new dues show up without reloading. `embedded` is the
// same view inside the club's app shell (/c/[orgId]/ledger).
export function LedgerView({ embedded = false }: { embedded?: boolean }) {
  const { orgId } = useParams<{ orgId: string }>();
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function load() {
      try {
        // Logged-in visitors send their login so the treasurer sees names.
        const token = authenticated ? await getAccessToken() : null;
        const res = await fetch(`/api/ledger/${orgId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error();
        const body = (await res.json()) as LedgerResponse;
        if (!cancelled) {
          setData(body);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
      if (!cancelled) timer = setTimeout(load, REFRESH_MS);
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, authenticated, getAccessToken, orgId]);

  return (
    <main className={embedded ? memberPage : "mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-6 pb-12"}>
      {embedded ? (
        <PageHeader
          title="Ledger"
          subtitle="Every dollar that comes in or goes out of the club. Tap Verify to see the public record."
          action={
            <Link href={`/ledger/${orgId}`} className={headerAction}>
              Public page
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Link href={authenticated ? `/c/${orgId}` : "/"} aria-label="Club Treasury home">
              <Mark />
            </Link>
            <Link
              href={authenticated ? `/c/${orgId}` : "/"}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              Home
            </Link>
          </div>

          <div>
            <p className="truncate text-zinc-600 dark:text-zinc-400">{data?.club.name ?? "\u00a0"}</p>
            <h1 className="text-4xl font-semibold">Public ledger</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Every dollar that comes in or goes out of the club. Tap Verify to see the public record.
            </p>
          </div>
        </>
      )}

      {data?.vaultUrl && (
        <a
          href={data.vaultUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 rounded-2xl bg-brand-50 p-4 hover:bg-brand-100 dark:bg-brand-950 dark:hover:bg-brand-900"
        >
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white dark:bg-brand-400 dark:text-brand-950">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
              <circle cx="14" cy="12" r="3" />
              <path d="M14 9v-.5M14 15.5V15M7 9.5v5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-brand-900 dark:text-brand-100">View the club vault</span>
            <span className="block text-sm text-brand-800/80 dark:text-brand-200/80">
              The club&apos;s money is held in a Squads vault on Solana. Anyone can check the balance and every
              payment in and out.
            </span>
          </span>
        </a>
      )}

      {failed && !data && (
        <p role="alert" className="text-sm text-red-600">
          We couldn&apos;t load the ledger. Refresh to try again.
        </p>
      )}

      {!data && !failed && (
        <ul aria-label="Loading the ledger" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-16 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </ul>
      )}

      {data && data.entries.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          No money has moved yet. Dues and reimbursements show up here as they happen.
        </p>
      )}

      {data && data.entries.length > 0 && (
        <ul className="flex flex-col divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {data.entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
              <div className="flex min-w-0 gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    e.direction === "in"
                      ? "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {e.direction === "in" ? <path d="M8 3v10M4 9l4 4 4-4" /> : <path d="M8 13V3M4 7l4-4 4 4" />}
                  </svg>
                </span>
                <div className="min-w-0">
                  {/* description is plain text: React escapes it, never HTML */}
                  <p className="font-medium">{e.description}</p>
                  <p className="mt-0.5 truncate text-sm text-zinc-600 dark:text-zinc-400">
                    {e.who && <span className={data.showingNames ? "" : "font-mono text-xs"}>{e.who} · </span>}
                    {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p
                  className={`font-display text-lg font-semibold tabular-nums ${
                    e.direction === "in" ? "text-brand-600 dark:text-brand-300" : ""
                  }`}
                >
                  {e.direction === "in" ? "+" : "\u2212"}
                  {e.amount}
                </p>
                <a
                  href={e.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-700 hover:border-brand-500 hover:text-brand-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-brand-300"
                >
                  Verify
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
