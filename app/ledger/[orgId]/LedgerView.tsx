"use client";

import { usePrivy } from "@privy-io/react-auth";
import { ExternalLink, ListOrdered, Vault } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LedgerItem } from "@/lib/ledger/view";
import { headerAction, memberPage } from "../../c/[orgId]/_components/PageHeader";
import { Mark } from "../../_components/Mark";
import { ActivityRow } from "../../_components/RecentActivity";
import { EmptyState, ErrorState, LoadingBlocks } from "../../_components/ui/EmptyState";
import { IconTile } from "../../_components/ui/ListRow";
import { PageHeader } from "../../_components/ui/PageHeader";
import { useLiveData } from "../../_components/useLiveData";

type LedgerResponse = {
  club: { name: string; school: string };
  entries: LedgerItem[];
  showingNames: boolean;
  vaultUrl: string | null;
};

const REFRESH_MS = 5000;

// Every dollar in and out, newest first, as list rows with a Verify link.
// Used for the public ledger (/ledger/[orgId], no login needed; refreshes
// every 5 seconds) and, with `embedded`, for Activity inside the app
// (/c/[orgId]/activity; live via useLiveData).
export function LedgerView({ embedded = false }: { embedded?: boolean }) {
  return embedded ? <ActivityLive /> : <PublicLedger />;
}

function ActivityLive() {
  const { orgId } = useParams<{ orgId: string }>();
  // Live: every 15 seconds, and right away when anything changes.
  const { data, error } = useLiveData<LedgerResponse>(`/api/ledger/${orgId}`, { intervalMs: 15_000 });
  return <LedgerContent embedded orgId={orgId} authenticated data={data} failed={error} />;
}

function PublicLedger() {
  const { orgId } = useParams<{ orgId: string }>();
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function load() {
      try {
        // Logged-in visitors send their login so the treasurer sees names.
        const token = authenticated ? await getAccessToken() : null;
        const res = await fetch(`/api/ledger/${orgId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error();
        const body = (await res.json()) as LedgerResponse;
        if (!cancelled) {
          setData(body);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
      if (!cancelled) timer = setTimeout(load, REFRESH_MS);
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, authenticated, getAccessToken, orgId]);

  return <LedgerContent embedded={false} orgId={orgId} authenticated={authenticated} data={data} failed={failed} />;
}

function LedgerContent({
  embedded,
  orgId,
  authenticated,
  data,
  failed,
}: {
  embedded: boolean;
  orgId: string;
  authenticated: boolean;
  data: LedgerResponse | null;
  failed: boolean;
}) {
  const intro = "Every dollar that comes in or goes out of the club. Tap Verify to see the public record.";

  return (
    <main className={embedded ? memberPage : "mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-5 px-4 pt-4 pb-12"}>
      {embedded ? (
        <PageHeader
          title="Activity"
          subtitle={intro}
          action={
            <Link href={`/ledger/${orgId}`} className={headerAction}>
              Public page
            </Link>
          }
        />
      ) : (
        <>
          <div className="glass flex items-center justify-between gap-3 rounded-full py-1.5 pr-1.5 pl-2">
            <Link href={authenticated ? `/c/${orgId}` : "/"} aria-label="Club Treasury home" className="flex items-center gap-2">
              <Mark className="h-8 w-8" />
              <span className="text-[15px] font-semibold">Club Treasury</span>
            </Link>
            <Link href={authenticated ? `/c/${orgId}` : "/"} className={headerAction}>
              {authenticated ? "Open the app" : "Log in"}
            </Link>
          </div>
          <PageHeader title="Public ledger" subtitle={data ? `${data.club.name} · ${intro}` : intro} />
        </>
      )}

      {data?.vaultUrl && (
        <a
          href={data.vaultUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="glass flex items-center gap-3 rounded-[16px] px-4 py-3 hover:bg-white/70"
        >
          <IconTile icon={Vault} dark />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">View the club vault</span>
            <span className="block text-[13px] text-muted">
              The club&apos;s money is held in a Squads vault on Solana. Anyone can check the balance and every payment in
              and out.
            </span>
          </span>
          <ExternalLink size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-zinc-400" />
        </a>
      )}

      {failed && !data && (
        <ErrorState what="We couldn't load the activity." todo="Check your connection; we'll try again in a few seconds." />
      )}

      {!data && !failed && <LoadingBlocks rows={4} height="h-14" label="Loading the activity" />}

      {data && data.entries.length === 0 && (
        <EmptyState icon={ListOrdered} title="No money has moved yet">
          Dues and reimbursements show up here as they happen.
        </EmptyState>
      )}

      {data && data.entries.length > 0 && (
        <ul className="glass divide-y divide-black/[0.06] overflow-hidden rounded-[16px]">
          {data.entries.map((e) => (
            <ActivityRow key={e.id} e={e} showingNames={data.showingNames} />
          ))}
        </ul>
      )}
    </main>
  );
}
