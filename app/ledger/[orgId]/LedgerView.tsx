"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LedgerItem } from "@/lib/ledger/view";

type LedgerResponse = {
  club: { name: string; school: string };
  entries: LedgerItem[];
  showingNames: boolean;
  vaultUrl: string | null;
};

const REFRESH_MS = 5000;

// Public ledger: every dollar in and out, newest first. Refreshes itself
// every few seconds so new dues show up without reloading.
export function LedgerView() {
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Ledger</h1>
          {data && <p className="truncate text-zinc-600 dark:text-zinc-400">{data.club.name}</p>}
        </div>
        <Link href={authenticated ? `/c/${orgId}` : "/"} className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Every dollar that comes in or goes out of the club. Tap Verify to see the public record.
      </p>

      {data?.vaultUrl && (
        <a
          href={data.vaultUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <span>
            <span className="block font-medium">View the club vault ↗</span>
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">
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

      {!data && !failed && <p className="text-zinc-600 dark:text-zinc-400">Loading…</p>}

      {data && data.entries.length === 0 && (
        <p className="text-zinc-600 dark:text-zinc-400">No money has moved yet.</p>
      )}

      {data && data.entries.length > 0 && (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {data.entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-4 py-4">
              <div className="min-w-0">
                {/* description is plain text: React escapes it, never HTML */}
                <p className="font-medium">{e.description}</p>
                <p className="mt-0.5 break-all text-sm text-zinc-600 dark:text-zinc-400">
                  {e.who && <span className={data.showingNames ? "" : "font-mono"}>{e.who} · </span>}
                  {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`font-semibold tabular-nums ${
                    e.direction === "in" ? "text-green-700 dark:text-green-400" : ""
                  }`}
                >
                  {e.direction === "in" ? "+" : "−"}
                  {e.amount}
                </p>
                <a
                  href={e.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-600 underline dark:text-zinc-400"
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
