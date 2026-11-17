"use client";

import Link from "next/link";
import type { Overview } from "@/lib/dashboard/types";

function Card({ label, value, sub, attention }: { label: string; value: string; sub?: string; attention?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        attention
          ? "border-gold-400 bg-gold-200/60 dark:border-gold-500/60 dark:bg-gold-500/10"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

// The numbers at the top of the dashboard, then budget vs actual per category.
export function OverviewCards({ overview, orgId }: { overview: Overview; orgId: string }) {
  const { dues } = overview;
  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          label="Club balance"
          value={overview.balance ?? "—"}
          sub={overview.balance ? undefined : "Still setting up the club's account"}
        />
        <Card
          label={`Dues · ${dues.periodLabel}`}
          value={`${dues.collected} of ${dues.expected}`}
          sub={`${dues.paidCount} of ${dues.memberCount} members paid`}
        />
        <Card label="Spent this month" value={overview.spentThisMonth} sub={overview.monthLabel} />
        <Card
          label="Waiting for approval"
          value={String(overview.waitingCount)}
          attention={overview.waitingCount > 0}
          sub={overview.waitingCount === 0 ? "All caught up" : overview.waitingCount === 1 ? "request" : "requests"}
        />
      </div>

      {overview.budgets.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Budget by category</h2>
            <Link href={`/c/${orgId}/treasurer/budget`} className="text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-brand-300">
              Edit budgets
            </Link>
          </div>
          <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {overview.budgets.map((b) => (
              <li key={b.slug} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{b.name}</span>
                  <span className={`tabular-nums ${b.over ? "font-semibold text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}>
                    {b.percent === null ? `${b.spent} spent · no budget` : `${b.spent} of ${b.budget}`}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  role="progressbar"
                  aria-label={`${b.name} budget used`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={b.percent ?? 0}
                >
                  <div
                    className={`h-full rounded-full ${
                      b.over ? "bg-red-600" : (b.percent ?? 0) >= 80 ? "bg-amber-500" : "bg-brand-600"
                    }`}
                    style={{ width: `${b.percent ?? 0}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-500">
                  {b.periodLabel}
                  {b.over ? " · over budget" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
