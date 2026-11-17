"use client";

import { ChartPie } from "lucide-react";
import { useEffect, useState } from "react";
import { useOrg } from "../../../_components/OrgProvider";
import { ButtonLink } from "../../../_components/ui/Button";
import { EmptyState, ErrorState, LoadingBlocks } from "../../../_components/ui/EmptyState";
import { ProgressBar } from "../../../_components/ui/ProgressBar";
import { useAuthFetch } from "../../../_components/useAuthFetch";
import { memberPage, PageHeader } from "../_components/PageHeader";

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
    <main className={memberPage}>
      <PageHeader title="Budget" subtitle={`How ${club?.name ?? "the club"} is spending its money.`} />

      {categories === null ? (
        failed ? (
          <ErrorState what="We couldn't load the budget." todo="Check your connection, then refresh the page." />
        ) : (
          <LoadingBlocks rows={4} height="h-20" label="Loading the budget" />
        )
      ) : categories.length === 0 ? (
        <EmptyState icon={ChartPie} title="No budget yet">
          The treasurer hasn&apos;t set up any budget categories. Check back later.
        </EmptyState>
      ) : (
        <ul className="glass divide-y divide-black/[0.06] overflow-hidden rounded-[16px]">
          {categories.map((c) => (
            <li key={c.slug} className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[15px] font-semibold">{c.name}</p>
                <p className="shrink-0 text-[13px] text-muted">{c.periodLabel}</p>
              </div>

              {c.hasBudget ? (
                <>
                  <ProgressBar
                    percent={c.percentUsed}
                    tone={c.overBy ? "alert" : "normal"}
                    label={`${c.name}: ${c.percentUsed}% used`}
                  />
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <p className="text-muted">
                      <span className="font-semibold text-ink tabular-nums">{c.spent}</span> of{" "}
                      <span className="tabular-nums">{c.budget}</span> {c.periodPhrase}
                    </p>
                    <p className={`shrink-0 font-semibold tabular-nums ${c.overBy ? "text-alert" : ""}`}>
                      {c.overBy ? `${c.overBy} over` : `${c.remaining} left`}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-muted">
                  No set budget. <span className="tabular-nums">{c.spent}</span> spent {c.periodPhrase}.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <ButtonLink href={`/c/${orgId}/activity`} variant="secondary" className="w-full">
        See every payment in Activity
      </ButtonLink>
    </main>
  );
}
