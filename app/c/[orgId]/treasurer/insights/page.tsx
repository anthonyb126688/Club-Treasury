"use client";

import { Download, FileText, ListOrdered, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { EXPORT_TYPES, type ExportType, type InsightsResponse } from "@/lib/insights/types";
import { parseRange, RANGE_KINDS, type RangeKind } from "@/lib/insights/ranges";
import { updatedLabel } from "@/lib/live/state";
import { BarChart } from "../../../../_components/charts/BarChart";
import { Donut } from "../../../../_components/charts/Donut";
import { HBarList } from "../../../../_components/charts/HBarList";
import { PairedBars } from "../../../../_components/charts/PairedBars";
import { useOrg } from "../../../../_components/OrgProvider";
import { Badge } from "../../../../_components/ui/Badge";
import { Button } from "../../../../_components/ui/Button";
import { EmptyState, ErrorState, LoadingBlocks } from "../../../../_components/ui/EmptyState";
import { ListRow } from "../../../../_components/ui/ListRow";
import { PageHeader } from "../../../../_components/ui/PageHeader";
import { ProgressBar } from "../../../../_components/ui/ProgressBar";
import { SegmentedControl } from "../../../../_components/ui/SegmentedControl";
import { Sheet } from "../../../../_components/ui/Sheet";
import { StatTile } from "../../../../_components/ui/StatTile";
import { useAuthFetch } from "../../../../_components/useAuthFetch";
import { useLiveData } from "../../../../_components/useLiveData";
import { treasurerPage } from "../../_components/PageHeader";

const RANGE_LABELS: Record<RangeKind, string> = { month: "Month", semester: "Semester", year: "Year" };
const RANGE_PHRASE: Record<RangeKind, string> = { month: "this month", semester: "this semester", year: "this year" };
const EXPORT_INFO: Record<ExportType, { title: string; subtitle: string; icon: typeof ListOrdered }> = {
  activity: { title: "Activity", subtitle: "Every dollar in and out, with Verify links", icon: ListOrdered },
  requests: { title: "Requests", subtitle: "Every receipt, its status and any note", icon: FileText },
  members: { title: "Members", subtitle: "Dues paid and money reimbursed per person", icon: Users },
};

// Insights (treasurers): where the club's money goes. Live: refreshes every
// 10 seconds and right after any payment, approval or denial.
export default function InsightsPage() {
  const { orgId } = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const range = parseRange(params.get("range"));
  const [exportOpen, setExportOpen] = useState(false);

  const live = useLiveData<InsightsResponse>(`/api/orgs/${orgId}/treasurer/insights?range=${range}`, {
    intervalMs: 10_000,
  });
  const data = live.data;

  // Re-render the "Updated … ago" label every 20 seconds.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  function chooseRange(next: RangeKind) {
    const q = new URLSearchParams(params.toString());
    q.set("range", next);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  return (
    <main className={treasurerPage}>
      <PageHeader
        title="Insights"
        subtitle={
          <>
            {data?.range.label ?? " "}
            {live.updatedAt && <span className="text-muted"> · {updatedLabel(live.updatedAt, Math.max(now, live.updatedAt))}</span>}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Time range"
          value={range}
          onChange={chooseRange}
          options={RANGE_KINDS.map((k) => ({ value: k, label: RANGE_LABELS[k] }))}
        />
        <Button variant="secondary" onClick={() => setExportOpen(true)} className="min-h-10">
          <Download size={18} strokeWidth={1.75} aria-hidden />
          Export
        </Button>
      </div>

      {!data ? (
        live.error ? (
          <ErrorState
            what="We couldn't load Insights."
            todo="Check your connection; we'll keep trying every 10 seconds."
            onRetry={live.refresh}
          />
        ) : (
          <LoadingBlocks rows={4} height="h-40" label="Loading Insights" />
        )
      ) : (
        <InsightsBody data={data} orgId={orgId} range={range} />
      )}

      {exportOpen && <ExportSheet orgId={orgId} range={range} onClose={() => setExportOpen(false)} />}
    </main>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="glass flex min-w-0 flex-col gap-4 rounded-[16px] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function InsightsBody({ data, orgId, range }: { data: InsightsResponse; orgId: string; range: RangeKind }) {
  const t = data.tiles;
  const phrase = RANGE_PHRASE[range];
  const runway =
    t.runwayMonths === null ? "No spending yet" : t.runwayMonths >= 24 ? "Lasts 2+ years" : `Lasts ~${t.runwayMonths} months`;
  const auto = t.autoApproved.share === null ? "—" : `${Math.round(t.autoApproved.share * 100)}%`;
  const net = data.cashflow.totals.net;

  return (
    <div className="flex flex-col gap-5">
      {/* Tiles: 2×2 on phones, one row on wide screens. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Club balance" value={t.balance?.text ?? "—"} note={t.balance ? runway : "Couldn't read the balance"} />
        <StatTile
          label={`Spent ${phrase}`}
          value={t.spent.text}
          note={t.spentPercent === null ? "No budget set" : `${t.spentPercent}% of ${t.budget.text} budget`}
          emphasis={t.spentPercent !== null && t.spentPercent > 100 ? "alert" : undefined}
        />
        <StatTile
          label={`Dues · ${t.dues.periodLabel}`}
          value={t.dues.collected.text}
          note={`${t.dues.paidCount} of ${t.dues.memberCount} paid`}
        />
        <StatTile
          label="Paid automatically"
          value={auto}
          note={t.autoApproved.total ? `${t.autoApproved.count} of ${t.autoApproved.total} requests` : "No requests yet"}
        />
      </div>

      {/* Phones stack in this order; wide screens pair them up. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Spending by month" aside={<span className="text-[13px] text-muted">Dashed line: monthly budget</span>}>
          <BarChart
            bars={data.spendingByMonth.map((m) => ({
              key: m.key,
              label: m.label,
              value: m.total.cents,
              valueText: m.total.text,
              partial: m.partial,
            }))}
            budget={data.budgetPerMonth.cents > 0 ? { value: data.budgetPerMonth.cents, text: data.budgetPerMonth.text } : null}
            ariaLabel={`Spending by month ${phrase}: ${t.spent.text} in total.`}
            emptyText={`No spending yet ${phrase}`}
          />
        </Card>

        <Card title="Budget pace" aside={<span className="text-[13px] text-muted">Tick: where you should be today</span>}>
          {data.pace.length === 0 ? (
            <EmptyState title="No budget categories yet" />
          ) : (
            <ul className="flex flex-col gap-4">
              {data.pace.map((p) => (
                <li key={p.slug} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="font-semibold">
                      {p.name}
                      {p.status === "ahead_of_pace" && <span className="font-medium text-warn-text"> · ahead of pace</span>}
                      {p.status === "over_budget" && <span className="font-medium text-alert"> · over budget</span>}
                    </span>
                    <span className="shrink-0 text-muted tabular-nums">
                      {p.budget.cents > 0 ? `${p.spent.text} of ${p.budget.text}` : `${p.spent.text} spent · no budget`}
                    </span>
                  </div>
                  <ProgressBar
                    percent={p.percentUsed}
                    pace={p.budget.cents > 0 ? p.elapsedPercent : null}
                    tone={p.status === "over_budget" ? "alert" : p.status === "ahead_of_pace" ? "warn" : "normal"}
                    label={`${p.name}: ${p.percentUsed}% of budget used, ${p.elapsedPercent}% of the period gone`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="By category">
          <Donut
            slices={data.categories.map((c) => ({
              key: c.slug,
              label: c.name,
              value: c.total.cents,
              valueText: c.total.text,
              tone: c.status === "over_budget" ? "alert" : c.status === "ahead_of_pace" ? "warn" : "normal",
              note: c.status === "over_budget" ? "over budget" : c.status === "ahead_of_pace" ? "ahead of pace" : undefined,
            }))}
            totalText={t.spent.text}
            totalLabel={`Spent ${phrase}`}
            ariaLabel={`Spending by category ${phrase}, ${t.spent.text} in total.`}
            emptyText={`No spending yet ${phrase}`}
          />
        </Card>

        <Card
          title="Money in vs. money out"
          aside={
            <span className={`text-[13px] font-semibold tabular-nums ${net.cents > 0 ? "text-income" : ""}`}>
              Net {net.cents > 0 ? "+" : ""}
              {net.text}
            </span>
          }
        >
          <PairedBars
            pairs={data.cashflow.months.map((m) => ({
              key: m.key,
              label: m.label,
              inValue: m.in.cents,
              outValue: m.out.cents,
              inText: m.in.text,
              outText: m.out.text,
            }))}
            ariaLabel={`Money in ${data.cashflow.totals.in.text} and money out ${data.cashflow.totals.out.text} ${phrase}.`}
            emptyText={`No money moved yet ${phrase}`}
          />
        </Card>

        <Card title="Spending by member">
          <HBarList
            rows={data.members.map((m) => ({
              key: m.userId,
              label: m.name,
              value: m.total.cents,
              valueText: m.total.text,
              sub: `${m.requestCount} ${m.requestCount === 1 ? "request" : "requests"}`,
              marker: <Badge tone={m.duesPaid ? "neutral" : "warn"}>{m.duesPaid ? "Dues paid" : "Dues not paid"}</Badge>,
              href: `/c/${orgId}/treasurer/members?person=${encodeURIComponent(m.userId)}`,
            }))}
            ariaLabel={`Reimbursements paid per member ${phrase}.`}
            emptyText="No members yet"
          />
        </Card>

        <Card title="Top vendors">
          {data.vendors.length === 0 ? (
            <EmptyState title={`No spending yet ${phrase}`} />
          ) : (
            <ul className="-mx-4 divide-y divide-black/[0.06] sm:-mx-5">
              {data.vendors.map((v) => (
                <li key={v.name} className="fade-in">
                  {/* Vendor names come from receipts: plain text only. */}
                  <ListRow
                    title={v.name}
                    subtitle={`${v.count} ${v.count === 1 ? "receipt" : "receipts"}`}
                    trailing={v.total.text}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// Export: pick Activity, Requests or Members; downloads a CSV for the selected range.
function ExportSheet({ orgId, range, onClose }: { orgId: string; range: RangeKind; onClose: () => void }) {
  const authFetch = useAuthFetch();
  const [busy, setBusy] = useState<ExportType | null>(null);
  const [problem, setProblem] = useState(false);

  async function download(type: ExportType) {
    setBusy(type);
    setProblem(false);
    try {
      const res = await authFetch(`/api/orgs/${orgId}/treasurer/export?range=${range}&type=${type}`);
      if (!res.ok) throw new Error();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `${type}.csv`;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onClose();
    } catch {
      setProblem(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet title={`Export ${RANGE_PHRASE[range]}`} onClose={onClose} side={false}>
      <div className="flex flex-col gap-3">
        <p className="px-1 text-[13px] text-muted">A spreadsheet file (CSV) you can open in Excel, Numbers or Google Sheets.</p>
        <ul className="glass divide-y divide-black/[0.06] overflow-hidden rounded-[16px]">
          {EXPORT_TYPES.map((type) => (
            <li key={type}>
              <ListRow
                icon={EXPORT_INFO[type].icon}
                title={EXPORT_INFO[type].title}
                subtitle={busy === type ? "Preparing…" : EXPORT_INFO[type].subtitle}
                onClick={() => !busy && download(type)}
              />
            </li>
          ))}
        </ul>
        {problem && (
          <ErrorState what="We couldn't make the file." todo="Check your connection, then tap it again." />
        )}
      </div>
    </Sheet>
  );
}
