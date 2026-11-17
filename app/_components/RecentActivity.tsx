"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { LedgerItem } from "@/lib/ledger/view";
import { useLiveData } from "./useLiveData";
import { EmptyState } from "./ui/EmptyState";
import { SectionLabel } from "./ui/GlassCard";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** One money-in / money-out row, shared by Home and Activity. Text is plain (untrusted). */
export function ActivityRow({ e, showingNames }: { e: LedgerItem; showingNames: boolean }) {
  const incoming = e.direction === "in";
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
  return (
    <li className="fade-in flex min-h-14 items-center gap-3 px-4 py-2.5">
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-black/[0.06] text-ink">
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{e.description}</span>
        <span className="block truncate text-[13px] text-muted">
          {e.who && <span className={showingNames ? "" : "font-mono text-[12px]"}>{e.who} · </span>}
          {shortDate(e.date)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={`text-[15px] font-semibold tabular-nums ${incoming ? "text-income" : ""}`}>
          {incoming ? "+" : "−"}
          {e.amount}
        </span>
        <a
          href={e.verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] font-medium text-muted underline decoration-black/20 underline-offset-2 hover:text-ink"
        >
          Verify
        </a>
      </span>
    </li>
  );
}

// The latest few money movements on the club home, with "See all".
export function RecentActivity({ orgId, limit = 5 }: { orgId: string; limit?: number }) {
  // Live: every 15 seconds, and right away when anything changes.
  const { data } = useLiveData<{ entries: LedgerItem[]; showingNames: boolean }>(`/api/ledger/${orgId}`, {
    intervalMs: 15_000,
  });

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel
        action={
          <Link href={`/c/${orgId}/activity`} className="text-[13px] font-semibold text-ink hover:underline">
            See all
          </Link>
        }
      >
        Recent activity
      </SectionLabel>
      {data === null ? (
        <span role="status" aria-label="Loading activity" className="block h-32 animate-pulse rounded-[16px] bg-white/50" />
      ) : data.entries.length === 0 ? (
        <EmptyState title="No money has moved yet">Dues and reimbursements show up here.</EmptyState>
      ) : (
        <ul className="glass divide-y divide-black/[0.06] overflow-hidden rounded-[16px]">
          {data.entries.slice(0, limit).map((e) => (
            <ActivityRow key={e.id} e={e} showingNames={data.showingNames} />
          ))}
        </ul>
      )}
    </section>
  );
}
