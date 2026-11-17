"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TabCode } from "@/lib/dashboard/tabs";
import type { Overview, RequestDetail, RequestList } from "@/lib/dashboard/types";
import { useAuthFetch } from "../../../_components/useAuthFetch";
import { useOrg } from "../../../_components/OrgProvider";
import { OverviewCards } from "./_components/OverviewCards";
import { RequestPanel } from "./_components/RequestPanel";
import { RequestTabs } from "./_components/RequestTabs";
import { useTreasurerActions, type Target } from "./_components/useTreasurerActions";

// Treasurer dashboard: club numbers at the top, then requests by tab.
// Tapping a request opens its details (side panel on wide screens, full
// screen on a phone), where the treasurer approves, denies, or retries.
export default function TreasurerDashboard() {
  const { orgId } = useOrg();
  const authFetch = useAuthFetch();
  const actions = useTreasurerActions(orgId);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewFailed, setOverviewFailed] = useState(false);
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

  const loadOverview = useCallback(async () => {
    try {
      const res = await authFetch(`/api/orgs/${orgId}/treasurer/overview`);
      if (!res.ok) throw new Error();
      setOverview((await res.json()) as Overview);
      setOverviewFailed(false);
    } catch {
      setOverviewFailed(true);
    }
  }, [authFetch, orgId]);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    loadOverview();
    const timer = setInterval(loadOverview, 30_000);
    return () => clearInterval(timer);
  }, [loadOverview]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the chosen tab
    loadList(tab);
    const timer = setInterval(() => loadList(tab), 15_000); // pick up new requests
    return () => clearInterval(timer);
  }, [loadList, tab]);

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
    } catch {
      setNotice("That didn't work. Try again.");
    } finally {
      setBusy(false);
      await Promise.all([loadOverview(), loadList(tabRef.current), loadDetail(target.id)]);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pb-12">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>

      {overview ? (
        <OverviewCards overview={overview} orgId={orgId} />
      ) : (
        <p className="text-zinc-600 dark:text-zinc-400">
          {overviewFailed ? "We couldn't load the club's numbers. Refresh to try again." : "Loading…"}
        </p>
      )}

      {overview && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Invite members with join code{" "}
          <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-50">{overview.joinCode}</span>
          {" · "}
          <Link href={`/c/${orgId}/treasurer/settings`} className="underline">
            Settings
          </Link>
        </p>
      )}

      {notice && !selectedId && (
        <p role="status" className="rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
          {notice}
        </p>
      )}

      <div className={`grid items-start gap-6 ${selectedId ? "lg:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
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
