"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TabCode } from "@/lib/dashboard/tabs";
import type { Overview, RequestDetail, RequestList } from "@/lib/dashboard/types";
import { useAuthFetch } from "../../../_components/useAuthFetch";
import { signalDataChanged, useLiveData, useOnDataChanged } from "../../../_components/useLiveData";
import { useOrg } from "../../../_components/OrgProvider";
import { useShell } from "../_components/AppShell";
import { PageHeader, treasurerPage } from "../_components/PageHeader";
import { ErrorState, LoadingBlocks } from "../../../_components/ui/EmptyState";
import { OverviewCards } from "./_components/OverviewCards";
import { RequestPanel } from "./_components/RequestPanel";
import { RequestTabs } from "./_components/RequestTabs";
import { useTreasurerActions, type Target } from "./_components/useTreasurerActions";

// Approvals (the treasurer dashboard): club numbers at the top, then requests by tab.
// Tapping a request opens its details in a sheet (side panel on wide
// screens, full screen on a phone), where the treasurer approves, denies, or retries.
export default function TreasurerDashboard() {
  const { orgId } = useOrg();
  const authFetch = useAuthFetch();
  const actions = useTreasurerActions(orgId);
  const { refreshApprovals } = useShell();

  // Club numbers stay live: every 10 seconds, and right after any change.
  const live = useLiveData<Overview>(`/api/orgs/${orgId}/treasurer/overview`, { intervalMs: 10_000 });
  const overview = live.data;
  const overviewFailed = live.error;
  const loadOverview = live.refresh;
  const [tab, setTab] = useState<TabCode>("needs_approval");
  const [list, setList] = useState<RequestList | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Ignore answers that arrive after the treasurer moved on.
  const tabRef = useRef(tab);
  const selectedRef = useRef(selectedId);

  const loadList = useCallback(
    async (which: TabCode) => {
      try {
        const res = await authFetch(`/api/orgs/${orgId}/treasurer/requests?tab=${which}`);
        if (!res.ok) throw new Error();
        const body = (await res.json()) as RequestList;
        if (tabRef.current === which) setList(body);
        setListFailed(false);
      } catch {
        setListFailed(true);
      }
    },
    [authFetch, orgId],
  );

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      try {
        const res = await authFetch(`/api/orgs/${orgId}/treasurer/requests/${id}`);
        if (!res.ok) throw new Error();
        const body = (await res.json()) as RequestDetail;
        if (selectedRef.current === id) setDetail(body);
        setDetailFailed(false);
      } catch {
        if (selectedRef.current === id) setDetailFailed(true);
      } finally {
        setDetailLoading(false);
      }
    },
    [authFetch, orgId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the chosen tab
    loadList(tab);
    const timer = setInterval(() => loadList(tab), 10_000); // pick up new requests
    return () => clearInterval(timer);
  }, [loadList, tab]);

  // A new receipt or a payment anywhere: refresh the list now.
  useOnDataChanged(() => loadList(tabRef.current));

  function chooseTab(next: TabCode) {
    tabRef.current = next;
    setTab(next);
  }

  function select(id: string) {
    selectedRef.current = id;
    setSelectedId(id);
    setDetail(null);
    setDetailFailed(false);
    setNotice(null);
    loadDetail(id);
  }

  function close() {
    selectedRef.current = null;
    setSelectedId(null);
    setDetail(null);
  }

  async function run(work: (target: Target) => Promise<string>) {
    if (!detail) return;
    const target: Target = { id: detail.id, amount: detail.amount, memberName: detail.memberName, vendor: detail.vendor };
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await work(target));
      signalDataChanged(); // the badge, tiles and other tabs refresh
    } catch {
      setNotice("That didn't work. Try again.");
    } finally {
      setBusy(false);
      refreshApprovals(); // the badge in the nav
      await Promise.all([loadOverview(), loadList(tabRef.current), loadDetail(target.id)]);
    }
  }

  return (
    <main className={treasurerPage}>
      <PageHeader title="Approvals" />

      {overview ? (
        <OverviewCards overview={overview} orgId={orgId} />
      ) : overviewFailed ? (
        <ErrorState
          what="We couldn't load the club's numbers."
          todo="Check your connection; we'll keep trying every 30 seconds."
          onRetry={loadOverview}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <LoadingBlocks key={i} rows={1} height="h-24" label="Loading the club's numbers" />
          ))}
        </div>
      )}

      {overview && (
        <p className="px-1 text-[13px] text-muted">
          Invite members with join code <span className="font-mono font-semibold text-ink">{overview.joinCode}</span>
          {" · "}
          <Link href={`/c/${orgId}/treasurer/settings`} className="font-semibold text-ink underline underline-offset-4">
            Invite link and QR
          </Link>
        </p>
      )}

      {notice && !selectedId && (
        <p role="status" className="glass rounded-[12px] px-4 py-3 text-[13px] font-medium">
          {notice}
        </p>
      )}

      <div>
        <RequestTabs
          orgId={orgId}
          tab={tab}
          onTab={chooseTab}
          list={list}
          failed={listFailed}
          overview={overview}
          selectedId={selectedId}
          onSelect={select}
        />
        {selectedId && (
          <RequestPanel
            detail={detail}
            loading={detailLoading}
            failed={detailFailed}
            busy={busy}
            notice={notice}
            onClose={close}
            canApprove={overview?.onChain ?? false}
            onApprove={() => run(actions.approve)}
            onDeny={(note) => run((t) => actions.deny(t, note))}
            onRetry={() => run(actions.retry)}
          />
        )}
      </div>
    </main>
  );
}
