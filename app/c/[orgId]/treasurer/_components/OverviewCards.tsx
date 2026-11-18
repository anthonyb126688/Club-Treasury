"use client";

import Link from "next/link";
import type { Overview } from "@/lib/dashboard/types";
import { SectionLabel } from "../../../../_components/ui/GlassCard";
import { ProgressBar } from "../../../../_components/ui/ProgressBar";
import { StatTile } from "../../../../_components/ui/StatTile";

// The numbers at the top of Approvals, then budget vs actual per category.
export function OverviewCards({ overview, orgId }: { overview: Overview; orgId: string }) {
  const { dues } = overview;
  const waiting = overview.waitingCount;
  return (
    <section className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Club balance"
          value={overview.balance ?? "—"}
          note={overview.balance ? undefined : "Still setting up the club's account"}
        />
        <StatTile
          label={`Dues · ${dues.periodLabel}`}
          value={dues.collected}
          note={`${dues.paidCount} of ${dues.memberCount} paid · ${dues.amount} each`}
        />
        <StatTile label="Spent this month" value={overview.spentThisMonth} note={overview.monthLabel} />
        <StatTile
          label="Waiting for you"
          value={String(waiting)}
          emphasis={waiting > 0 ? "alert" : undefined}
          note={waiting === 0 ? "All caught up" : waiting === 1 ? "request" : "requests"}
        />
      </div>

      {overview.budgets.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel
            action={
              <Link href={`/c/${orgId}/treasurer/budget`} className="text-[13px] font-semibold text-ink hover:underline">
                Edit budgets
              </Link>
            }
          >
            Budget by category
          </SectionLabel>
          <ul className="glass grid gap-x-8 gap-y-4 rounded-[16px] p-4 sm:p-5 md:grid-cols-2">
            {overview.budgets.map((b) => (
              <li key={b.slug} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="font-semibold">{b.name}</span>
                  <span className={`tabular-nums ${b.over ? "font-semibold text-alert" : "text-muted"}`}>
                    {b.percent === null ? `${b.spent} spent · no budget` : `${b.spent} of ${b.budget}`}
                  </span>
                </div>
                <ProgressBar
                  percent={b.percent ?? 0}
                  tone={b.over ? "alert" : "normal"}
                  label={`${b.name} budget used`}
                />
                <span className="text-[12px] text-muted">
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
