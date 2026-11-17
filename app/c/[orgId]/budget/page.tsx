"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useOrg } from "../../../_components/OrgProvider";
import { useAuthFetch } from "../../../_components/useAuthFetch";

type BudgetCategory = {
  slug: string;
  name: string;
  periodPhrase: string; // "this month" / "this semester"
  periodLabel: string; // "November 2026"
  budget: string;
  spent: string;
  remaining: string;
  overBy: string | null;
  hasBudget: boolean;
  percentUsed: number;
};

// Club budget (read-only, any member): for each category, what's budgeted,
// spent and left this period, so everyone can see where club money goes.
export default function BudgetPage() {
  const { orgId, club } = useOrg();
  const authFetch = useAuthFetch();
  const [categories, setCategories] = useState<BudgetCategory[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/orgs/${orgId}/budget`);
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { categories: BudgetCategory[] };
        if (!cancelled) setCategories(body.categories);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, orgId]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-12">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Club budget</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 break-words">
            How {club?.name ?? "the club"} is spending its money.
          </p>
        </div>
        <Link href={`/c/${orgId}`} className="shrink-0 rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900">
          Home
        </Link>
      </div>

      {categories === null ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {failed ? "We couldn't load the budget. Try again in a minute." : "Loading…"}
        </p>
      ) : categories.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          The treasurer hasn&apos;t set up any budget categories yet. Check back later.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {categories.map((c) => (
            <li key={c.slug} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate font-medium">{c.name}</p>
                <p className="shrink-0 text-sm text-zinc-600 dark:text-zinc-400">{c.periodLabel}</p>
              </div>

              {c.hasBudget ? (
                <>
                  <div
                    className="mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={c.percentUsed}
                    aria-label={`${c.name}: ${c.percentUsed}% used`}
                  >
                    <div
                      className={`h-full rounded-full ${
                        c.overBy ? "bg-red-600" : c.percentUsed >= 80 ? "bg-amber-500" : "bg-brand-600 dark:bg-brand-400"
                      }`}
                      style={{ width: `${c.percentUsed}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
                    <p className="text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">{c.spent}</span> of{" "}
                      <span className="tabular-nums">{c.budget}</span> spent {c.periodPhrase}
                    </p>
                    <p
                      className={`shrink-0 font-medium tabular-nums ${
                        c.overBy ? "text-red-700 dark:text-red-400" : "text-brand-700 dark:text-brand-300"
                      }`}
                    >
                      {c.overBy ? `${c.overBy} over` : `${c.remaining} left`}
                    </p>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  No set budget. <span className="tabular-nums">{c.spent}</span> spent {c.periodPhrase}.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/ledger/${orgId}`}
        className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-center font-medium dark:border-zinc-800"
      >
        See every payment on the public ledger
      </Link>
    </main>
  );
}
