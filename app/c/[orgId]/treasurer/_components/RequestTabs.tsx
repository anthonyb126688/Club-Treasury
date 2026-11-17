"use client";

import Link from "next/link";
import { TAB_TITLES, TABS, type TabCode } from "@/lib/dashboard/tabs";
import type { Overview, RequestList } from "@/lib/dashboard/types";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  payment_failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  rejected: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  paid: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
};

function EmptyState({ tab, overview, orgId }: { tab: TabCode; overview: Overview | null; orgId: string }) {
  if (tab === "needs_approval" && overview && overview.totalRequests === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-zinc-100 px-4 py-8 text-center dark:bg-zinc-900">
        <p className="font-medium">No requests yet.</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Share your join code <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-50">{overview.joinCode}</span>{" "}
          to invite members. Their receipts will show up here.
        </p>
        <Link href={`/c/${orgId}/treasurer/settings`} className="text-sm underline">
          Join code and settings
        </Link>
      </div>
    );
  }
  const text: Record<TabCode, string> = {
    needs_approval: "✓ All caught up. Nothing is waiting for you.",
    paid: "No payouts yet. Approved requests show up here with a Verify link.",
    blocked: "Nothing blocked. Possible duplicates and payouts that didn't go through show up here.",
    denied: "Nothing denied. Requests you deny show up here with your note.",
  };
  return (
    <p className="rounded-2xl bg-zinc-100 px-4 py-8 text-center text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
      {text[tab]}
    </p>
  );
}

// Tabs (with counts) and the list of requests in the chosen tab.
export function RequestTabs({
  orgId,
  tab,
  onTab,
  list,
  failed,
  overview,
  selectedId,
  onSelect,
}: {
  orgId: string;
  tab: TabCode;
  onTab: (tab: TabCode) => void;
  list: RequestList | null;
  failed: boolean;
  overview: Overview | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const rows = list && list.tab === tab ? list.rows : null;
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div role="tablist" aria-label="Requests" className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => {
          const count = list?.counts[t];
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(t)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
                active
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50"
                  : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              {TAB_TITLES[t]}
              {count !== undefined && (
                <span
                  className={`ml-1.5 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    t === "needs_approval" && count > 0
                      ? "bg-amber-500 text-white"
                      : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!rows ? (
        <p className="py-6 text-zinc-600 dark:text-zinc-400">
          {failed ? "We couldn't load requests. Refresh to try again." : "Loading…"}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState tab={tab} overview={overview} orgId={orgId} />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  aria-current={r.id === selectedId ? "true" : undefined}
                  className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 sm:grid-cols-[1fr_7rem_6rem_9rem] ${
                    r.id === selectedId ? "bg-zinc-100 dark:bg-zinc-900" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.memberName}</span>
                    {/* Receipt-derived text: plain text only. */}
                    <span className="block truncate text-sm text-zinc-600 dark:text-zinc-400">
                      {r.vendor ?? "Unknown store"} · {r.category}
                    </span>
                  </span>
                  <span className="text-right font-semibold tabular-nums sm:order-none">{r.amount}</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">{shortDate(r.date)}</span>
                  <span className="text-right sm:text-left">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status] ?? "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"}`}>
                      {r.statusLabel}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {list && list.counts[tab] > rows.length && (
            <p className="text-sm text-zinc-500">
              Showing the {rows.length} most recent of {list.counts[tab]}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
