"use client";

import { Check, Receipt } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { budgetRing, type BudgetRing, type RingCategory } from "@/lib/member/ring";
import { formatCents } from "@/lib/money";
import { Ring } from "../../_components/charts/Ring";
import { useDues } from "../../_components/DuesCard";
import { useOrg } from "../../_components/OrgProvider";
import { RecentActivity } from "../../_components/RecentActivity";
import { ReimbursementHistory } from "../../_components/ReimbursementHistory";
import { Button, ButtonLink } from "../../_components/ui/Button";
import { GlassCard } from "../../_components/ui/GlassCard";
import { PageHeader } from "../../_components/ui/PageHeader";
import { InsightsCard } from "./_components/InsightsCard";
import { signalDataChanged, useLiveData } from "../../_components/useLiveData";

// A club's home (phone-first): balances with Get reimbursed and Pay dues,
// how much of the club budget is spent, dues status, my requests, and the
// latest money in and out.
export default function ClubHome() {
  const { orgId, club, me, isTreasurer } = useOrg();
  const [clubBalance, setClubBalance] = useState<string | null>(null);
  // Live: every 15 seconds, and right away when anything changes.
  const balanceLive = useLiveData<{ balance: string | null }>("/api/balance", { intervalMs: 15_000 });
  const budgetLive = useLiveData<{ categories: RingCategory[] }>(`/api/orgs/${orgId}/budget`, { intervalMs: 15_000 });
  const balance = balanceLive.data?.balance ?? null;
  const ring: BudgetRing | null = budgetLive.data ? budgetRing(budgetLive.data.categories) : null;
  // A payout landed or dues went through: every live number refreshes.
  const reload = useCallback(() => signalDataChanged(), []);
  const { dues, busy, message, payDues } = useDues({
    orgId,
    onPaid: reload,
    onClubBalance: setClubBalance,
  });

  const duesPaid = dues?.status === "paid";
  const duesPending = dues?.status === "pending";

  return (
    <main className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-5 px-4 pb-12 sm:px-6 xl:max-w-5xl">
      <PageHeader
        title={me?.firstName ? `Hi, ${me.firstName}` : "Home"}
        subtitle={club ? `${club.name} · ${isTreasurer ? "Treasurer" : "Member"}` : undefined}
      />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Balances, with the two things people come here to do. */}
          <GlassCard className="flex flex-col gap-5">
            <dl className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <dt className="text-[13px] font-medium text-muted">Club balance</dt>
                <dd className="mt-0.5 text-[40px] leading-none font-bold tracking-[-0.03em] tabular-nums">
                  {clubBalance ?? <Placeholder wide />}
                </dd>
              </div>
              <div className="shrink-0 sm:text-right">
                <dt className="text-[13px] font-medium text-muted">Your balance</dt>
                <dd className="mt-0.5 text-[17px] font-semibold tabular-nums">{balance ?? <Placeholder />}</dd>
              </div>
            </dl>
            <div className="grid grid-cols-2 gap-2.5">
              <ButtonLink href={`/c/${orgId}/reimburse`} className="px-2 whitespace-nowrap">
                <Receipt size={18} strokeWidth={1.75} aria-hidden className="hidden min-[420px]:block" />
                Get reimbursed
              </ButtonLink>
              {duesPaid ? (
                <Button variant="secondary" disabled className="px-2 whitespace-nowrap disabled:opacity-100">
                  <Check size={18} strokeWidth={1.75} aria-hidden />
                  Dues paid
                </Button>
              ) : (
                <Button variant="secondary" onClick={payDues} disabled={!dues || busy || duesPending} className="px-2 whitespace-nowrap">
                  {busy || duesPending ? "Paying…" : dues ? `Pay ${dues.amount} dues` : "Pay dues"}
                </Button>
              )}
            </div>
            {message && (
              <p role="alert" className="text-[13px] font-medium text-alert">
                {message}
              </p>
            )}
          </GlassCard>

          {/* Treasurers: a quick look at Insights. */}
          {isTreasurer && <InsightsCard orgId={orgId} />}

          {/* How much of the club budget is spent this period. */}
          {ring && (
            <Link href={isTreasurer ? `/c/${orgId}/treasurer/budget` : `/c/${orgId}/budget`} className="block rounded-[16px]">
              <GlassCard className="flex items-center gap-4 hover:bg-white/70">
                <Ring
                  percent={ring.percent}
                  tone={ring.over ? "alert" : "normal"}
                  label={`${ring.percent}% of the club budget spent this period`}
                >
                  <span className="text-[17px] font-bold tabular-nums">{ring.percent}%</span>
                </Ring>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-muted">Club budget spent this period</p>
                  <p className="mt-0.5 text-[17px] font-semibold tabular-nums">
                    {formatCents(ring.spentCents)}{" "}
                    <span className="font-normal text-muted">of {formatCents(ring.budgetCents)}</span>
                  </p>
                  {ring.over && <p className="text-[13px] font-medium text-alert">Over budget</p>}
                </div>
              </GlassCard>
            </Link>
          )}

          {/* Dues status. */}
          <GlassCard className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">Dues</p>
              <p className="text-[13px] text-muted">{dues ? `${dues.amount} · ${dues.term}` : " "}</p>
            </div>
            <p className={`shrink-0 text-[15px] font-semibold ${duesPaid ? "" : "text-muted"}`}>
              {!dues ? "" : duesPaid ? "✓ Paid" : duesPending ? "Going through…" : "Not paid yet"}
            </p>
          </GlassCard>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <ReimbursementHistory orgId={orgId} onChange={reload} />
          <RecentActivity orgId={orgId} />
        </div>
      </div>
    </main>
  );
}

// A soft block in place of a number that's still loading.
function Placeholder({ wide = false }: { wide?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-pulse rounded-lg bg-black/[0.07] align-middle ${wide ? "h-9 w-40" : "h-5 w-16"}`}
    />
  );
}
