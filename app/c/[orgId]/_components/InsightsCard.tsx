"use client";

import { ChevronRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { InsightsResponse } from "@/lib/insights/types";
import { LineChart } from "../../../_components/charts/LineChart";
import { useLiveData } from "../../../_components/useLiveData";

// Home, treasurers only: a mini spending line for the semester and the single
// most important alert ("Food is ahead of pace"), linking to Insights.
export function InsightsCard({ orgId }: { orgId: string }) {
  const { data } = useLiveData<InsightsResponse>(`/api/orgs/${orgId}/treasurer/insights?range=semester`, {
    intervalMs: 15_000,
  });
  if (!data) return null;

  const alert = data.alert;
  return (
    <Link
      href={`/c/${orgId}/treasurer/insights?range=semester`}
      className="glass flex flex-col gap-3 rounded-[16px] p-4 hover:bg-white/70 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted">Insights · {data.range.label}</p>
          <p className="text-[17px] font-semibold tabular-nums">
            {data.tiles.spent.text} spent
            {data.tiles.spentPercent !== null && (
              <span className="font-normal text-muted"> · {data.tiles.spentPercent}% of budget</span>
            )}
          </p>
        </div>
        <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-zinc-400" />
      </div>
      <LineChart
        points={data.spendingByMonth.map((m) => ({ key: m.key, label: m.label, value: m.total.cents, valueText: m.total.text }))}
        ariaLabel={`Spending by month this semester: ${data.tiles.spent.text} in total.`}
        emptyText="No spending yet this semester"
        height={48}
      />
      <p
        className={`flex items-center gap-1.5 text-[13px] font-medium ${
          alert ? (alert.status === "over_budget" ? "text-alert" : "text-warn-text") : "text-muted"
        }`}
      >
        {alert && <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />}
        {alert ? alert.text : "Every category is on track."}
      </p>
    </Link>
  );
}
