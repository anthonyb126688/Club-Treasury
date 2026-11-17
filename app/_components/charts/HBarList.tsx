"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChartEmpty, DataTable } from "./common";

export type HBar = {
  key: string;
  label: string;
  value: number;
  valueText: string;
  sub?: string; // e.g. "2 requests"
  marker?: ReactNode; // e.g. a dues paid / not paid badge
  href?: string;
};

// A list of horizontal bars (name, bar, total). Rows with an href open
// something (e.g. that member's sheet).
export function HBarList({ rows, ariaLabel, emptyText }: { rows: HBar[]; ariaLabel: string; emptyText: string }) {
  if (rows.length === 0) return <ChartEmpty text={emptyText} />;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    // role="figure" (not "img"): the rows are links, and "img" would hide them.
    <div role="figure" aria-label={ariaLabel}>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const inner = (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[15px] font-medium">{r.label}</span>
                  {r.marker}
                </span>
                <span className="shrink-0 text-right">
                  <span className="text-[15px] font-semibold tabular-nums">{r.valueText}</span>
                  {r.sub && <span className="ml-1.5 text-[12px] text-muted">{r.sub}</span>}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-black/[0.07]">
                <div
                  className="h-full rounded-full bg-ink transition-[width] duration-300 ease-out"
                  style={{ width: `${(r.value / max) * 100}%` }}
                />
              </div>
            </>
          );
          return (
            <li key={r.key} className="fade-in border-b border-black/[0.06] last:border-0">
              {r.href ? (
                <Link href={r.href} className="flex items-center gap-2 py-2.5 hover:opacity-80">
                  <span className="min-w-0 flex-1">{inner}</span>
                  <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-zinc-400" />
                </Link>
              ) : (
                <div className="py-2.5">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      <DataTable
        caption={ariaLabel}
        head={["Name", "Total", "Details"]}
        rows={rows.map((r) => [r.label, r.valueText, r.sub ?? ""])}
      />
    </div>
  );
}
