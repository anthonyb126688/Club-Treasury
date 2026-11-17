import { connection } from "next/server";
import { db } from "@/lib/db";
import { currentPeriod } from "@/lib/dues/period";
import { budgetBars, duesProgress, earliestStart, monthStart, SPENT_STATUSES, sumSince } from "@/lib/dashboard/overview";
import type { Overview } from "@/lib/dashboard/types";
import { formatCents, formatUsd } from "@/lib/money";
import { requireTreasurer } from "@/lib/orgs/access";
import { loadOrgCategories, loadOrgSettings } from "@/lib/orgs/settings";
import { getDollarBalance } from "@/lib/solana/balance";
import { ClubNotReadyError, clubHolderAddress, squadsConfigFor } from "@/lib/solana/squads";

// GET /api/orgs/:orgId/treasurer/overview: the numbers at the top of the
// treasurer dashboard for THIS club (balance, dues, spending, waiting
// requests, budget vs actual per category). Treasurer only.

export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/treasurer/overview">) {
  await connection();
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const now = new Date();
    const [settings, categories] = await Promise.all([loadOrgSettings(orgId), loadOrgCategories(orgId)]);
    const duesPeriod = currentPeriod(settings.duesPeriod, now);
    const thisMonth = monthStart(now);
    const budgetStart = earliestStart(categories, now);
    const requests = () => db().from("reimbursement_requests");

    const [dues, members, paid, spent, waiting, total] = await Promise.all([
      db()
        .from("dues_payments")
        .select("privy_user_id, amount_cents")
        .eq("org_id", orgId)
        .eq("period", duesPeriod.id)
        .eq("status", "sent"),
      db()
        .from("org_memberships")
        .select("privy_user_id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "active"),
      requests().select("total_cents, paid_at").eq("org_id", orgId).eq("status", "paid").gte("paid_at", thisMonth),
      requests()
        .select("category, total_cents, decided_at")
        .eq("org_id", orgId)
        .in("status", [...SPENT_STATUSES])
        .gte("decided_at", budgetStart),
      requests().select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "queued"),
      requests().select("id", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "submitted"),
    ]);
    for (const r of [dues, members, paid, spent, waiting, total]) {
      if (r.error) throw new Error(`overview lookup: ${r.error.message}`);
    }

    let balance: string | null = null;
    try {
      balance = formatUsd(await getDollarBalance(clubHolderAddress(access.org)));
    } catch (err) {
      // Not set up yet, or the network is slow: show the rest anyway.
      if (!(err instanceof ClubNotReadyError)) console.error("club balance failed:", (err as Error).message);
    }

    let onChain = false;
    try {
      onChain = squadsConfigFor(access.org) !== null;
    } catch (err) {
      console.error("vault config:", (err as Error).message);
    }

    const progress = duesProgress(dues.data ?? [], members.count ?? 0, settings.duesAmountCents);
    const spentThisMonth = sumSince(paid.data ?? [], (r) => r.paid_at, thisMonth);
    const bars = budgetBars(categories, spent.data ?? [], now);

    const body: Overview = {
      clubName: access.org.name,
      joinCode: access.org.join_code,
      balance,
      onChain,
      dues: {
        ...progress,
        collected: formatCents(progress.collectedCents),
        expected: formatCents(progress.expectedCents),
        periodLabel: duesPeriod.label,
        amount: formatCents(settings.duesAmountCents),
      },
      spentThisMonth: formatCents(spentThisMonth),
      monthLabel: currentPeriod("month", now).label,
      waitingCount: waiting.count ?? 0,
      totalRequests: total.count ?? 0,
      budgets: bars.map((b) => ({ ...b, budget: formatCents(b.budgetCents), spent: formatCents(b.spentCents) })),
    };
    return Response.json(body);
  } catch (err) {
    console.error("treasurer overview failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
