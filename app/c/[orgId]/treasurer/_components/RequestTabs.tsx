"use client";

import Link from "next/link";
import { TAB_TITLES, TABS, type TabCode } from "@/lib/dashboard/tabs";
import type { Overview, RequestList } from "@/lib/dashboard/types";
import { EmptyState, ErrorState, LoadingBlocks } from "../../../../_components/ui/EmptyState";
import { ListRow } from "../../../../_components/ui/ListRow";
import { SegmentedControl } from "../../../../_components/ui/SegmentedControl";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Empty({ tab, overview, orgId }: { tab: TabCode; overview: Overview | null; orgId: string }) {
  if (tab === "needs_approval" && overview && overview.totalRequests === 0) {
    return (
      <EmptyState
        title="No requests yet"
        action={
          <Link href={`/c/${orgId}/treasurer/settings`} className="text-[13px] font-semibold underline underline-offset-4">
            Join code, invite link and QR
          </Link>
        }
      >
        Share your join code <span className="font-mono font-semibold text-ink">{overview.joinCode}</span> to invite
        members. Their receipts will show up here.
      </EmptyState>
    );
  }
  const text: Record<TabCode, [string, string]> = {
    needs_approval: ["All caught up", "Nothing is waiting for you."],
    paid: ["No payouts yet", "Approved requests show up here with a Verify link."],
    blocked: ["Nothing blocked", "Possible duplicates and payouts that didn't go through show up here."],
    denied: ["Nothing denied", "Requests you deny show up here with your note."],
  };
  return <EmptyState title={text[tab][0]}>{text[tab][1]}</EmptyState>;
}

// The request tabs (a segmented control with counts) and the requests in
// the chosen tab, as list rows.
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
      <SegmentedControl
        label="Requests"
        value={tab}
        onChange={onTab}
        options={TABS.map((t) => {
          const count = list?.counts[t];
          return {
            value: t,
            label: (
              <>
                {TAB_TITLES[t]}
                {count !== undefined && (
                  <span
                    className={`ml-1.5 tabular-nums ${t === "needs_approval" && count > 0 ? "font-bold text-alert" : "text-muted"}`}
                  >
                    {count}
                  </span>
                )}
              </>
            ),
          };
        })}
      />

      {!rows ? (
        failed ? (
          <ErrorState what="We couldn't load the requests." todo="Check your connection; we'll try again in a few seconds." />
        ) : (
          <LoadingBlocks rows={3} height="h-14" label="Loading requests" />
        )
      ) : rows.length === 0 ? (
        <Empty tab={tab} overview={overview} orgId={orgId} />
      ) : (
        <>
          <ul className="glass divide-y divide-black/[0.06] overflow-hidden rounded-[16px]">
            {rows.map((r) => (
              <li key={r.id} className="fade-in">
                <ListRow
                  onClick={() => onSelect(r.id)}
                  selected={r.id === selectedId}
                  title={r.memberName}
                  // Receipt-derived text: plain text only.
                  subtitle={`${r.vendor ?? "Unknown store"} · ${r.category} · ${shortDate(r.date)}`}
                  trailing={r.amount}
                  trailingSub={
                    <span className={r.status === "payment_failed" ? "font-semibold text-alert" : ""}>{r.statusLabel}</span>
                  }
                />
              </li>
            ))}
          </ul>
          {list && list.counts[tab] > rows.length && (
            <p className="px-1 text-[13px] text-muted">
              Showing the {rows.length} most recent of {list.counts[tab]}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
