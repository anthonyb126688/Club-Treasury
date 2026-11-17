import "server-only";
import { db } from "@/lib/db";
import { reasonMessages } from "@/lib/dashboard/format";
import { duesProgress, SPENT_STATUSES } from "@/lib/dashboard/overview";
import { statusLabel } from "@/lib/dashboard/tabs";
import { currentPeriod } from "@/lib/dues/period";
import { formatCents } from "@/lib/money";
import { loadOrgCategories, loadOrgSettings } from "@/lib/orgs/settings";
import type { Org } from "@/lib/orgs/orgs";
import { getDollarBalance } from "@/lib/solana/balance";
import { explorerTxUrl } from "@/lib/solana/memo";
import { ClubNotReadyError, clubHolderAddress } from "@/lib/solana/squads";
import { displayName, spendingByMember, type PaidRow, type Person } from "./byMember";
import { cashflow, type LedgerFlowRow } from "./cashflow";
import { toCsv } from "./csv";
import { paceRows, topAlert } from "./pace";
import { inRange, rangeFor, TIME_ZONE, type RangeKind } from "./ranges";
import {
  budgetForRange,
  categoryTotals,
  monthlyBudgetCents,
  spendingByMonth,
  spentInRange,
  type CategoryInfo,
  type SpendRow,
} from "./spending";
import type { ExportType, InsightsResponse, Money } from "./types";
import { topVendors } from "./vendors";

// Loads a club's rows (every query filtered by org_id) and hands them to the
// pure functions in lib/insights/. Used by the treasurer-only insights and
// export routes.

const money = (cents: number): Money => ({ cents, text: formatCents(cents) });

/** USDC base units → whole cents (6 decimals → 2). */
const unitsToCents = (units: bigint) => Number(units / BigInt(10_000));

async function clubBalanceCents(org: Org): Promise<number | null> {
  try {
    return unitsToCents(await getDollarBalance(clubHolderAddress(org)));
  } catch (err) {
    // Not set up yet, or the network is slow: show the rest anyway.
    if (!(err instanceof ClubNotReadyError)) console.error("insights balance failed:", (err as Error).message);
    return null;
  }
}

function check<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
}

async function loadPeople(ids: string[]): Promise<Person[]> {
  if (ids.length === 0) return [];
  const r = await db().from("members").select("privy_user_id, first_name, last_name, email").in("privy_user_id", ids);
  return check<Person[]>(r, "insights members");
}

export async function loadInsights(org: Org, kind: RangeKind, now: Date = new Date()): Promise<InsightsResponse> {
  const orgId = org.id;
  const range = rangeFor(kind, now);
  const [settings, allCategories] = await Promise.all([loadOrgSettings(orgId), loadOrgCategories(orgId, true)]);
  const categories: CategoryInfo[] = allCategories.map((c) => ({
    slug: c.slug,
    name: c.name,
    budgetCents: c.budgetCents,
    period: c.period,
    archived: c.archived,
  }));
  const duesPeriod = currentPeriod(settings.duesPeriod, now);

  const [requests, ledger, memberships, dues, balanceCents] = await Promise.all([
    db()
      .from("reimbursement_requests")
      .select("privy_user_id, vendor, category, total_cents, status, decided_by, decided_at, paid_at")
      .eq("org_id", orgId)
      .in("status", [...SPENT_STATUSES])
      .gte("decided_at", range.queryFrom),
    db()
      .from("ledger_entries")
      .select("direction, kind, amount_cents, created_at")
      .eq("org_id", orgId)
      .gte("created_at", range.queryFrom),
    db().from("org_memberships").select("privy_user_id").eq("org_id", orgId).eq("status", "active"),
    db()
      .from("dues_payments")
      .select("privy_user_id, amount_cents")
      .eq("org_id", orgId)
      .eq("period", duesPeriod.id)
      .eq("status", "sent"),
    clubBalanceCents(org),
  ]);
  const rows = check<(SpendRow & PaidRow)[]>(requests, "insights requests");
  const flows = check<LedgerFlowRow[]>(ledger, "insights ledger");
  const active = check<{ privy_user_id: string }[]>(memberships, "insights memberships");
  const duesRows = check<{ privy_user_id: string; amount_cents: number | null }[]>(dues, "insights dues");
  const people = await loadPeople(active.map((m) => m.privy_user_id));

  const spent = spentInRange(rows, range);
  const spentCents = spent.reduce((s, r) => s + (r.total_cents ?? 0), 0);
  const budgetCents = categories.filter((c) => !c.archived).reduce((s, c) => s + budgetForRange(c, range, now), 0);
  const auto = spent.filter((r) => r.decided_by === "policy").length;
  const progress = duesProgress(duesRows, active.length, settings.duesAmountCents);
  const pace = paceRows(rows, range, categories, now);
  const paceBySlug = new Map(pace.map((p) => [p.slug, p.status]));
  const flow = cashflow(flows, range, balanceCents);
  const alert = topAlert(pace);

  return {
    range: {
      kind: range.kind,
      label: range.label,
      elapsedPercent: Math.round(range.elapsedShare * 100),
      months: range.months,
    },
    tiles: {
      balance: balanceCents === null ? null : money(balanceCents),
      runwayMonths: flow.runwayMonths,
      spent: money(spentCents),
      budget: money(budgetCents),
      spentPercent: budgetCents > 0 ? Math.round((spentCents / budgetCents) * 100) : null,
      dues: {
        collected: money(progress.collectedCents),
        expected: money(progress.expectedCents),
        paidCount: progress.paidCount,
        memberCount: progress.memberCount,
        periodLabel: duesPeriod.label,
      },
      autoApproved: { share: spent.length ? auto / spent.length : null, count: auto, total: spent.length },
    },
    spendingByMonth: spendingByMonth(rows, range).map((m) => ({
      key: m.key,
      label: m.label,
      partial: m.partial,
      total: money(m.totalCents),
    })),
    budgetPerMonth: money(monthlyBudgetCents(categories, now)),
    categories: categoryTotals(rows, range, categories).map((c) => ({
      slug: c.slug,
      name: c.name,
      total: money(c.totalCents),
      status: paceBySlug.get(c.slug) ?? null,
    })),
    pace: pace.map((p) => ({
      slug: p.slug,
      name: p.name,
      spent: money(p.spentCents),
      budget: money(p.budgetCents),
      percentUsed: p.percentUsed,
      elapsedPercent: p.elapsedPercent,
      status: p.status,
    })),
    cashflow: {
      months: flow.months.map((m) => ({
        key: m.key,
        label: m.label,
        partial: m.partial,
        in: money(m.inCents),
        out: money(m.outCents),
        net: money(m.netCents),
      })),
      totals: { in: money(flow.totals.inCents), out: money(flow.totals.outCents), net: money(flow.totals.netCents) },
    },
    members: spendingByMember(rows, range, people, new Set(duesRows.map((d) => d.privy_user_id))).map((m) => ({
      userId: m.userId,
      name: m.name,
      total: money(m.totalCents),
      requestCount: m.requestCount,
      share: m.share,
      duesPaid: m.duesPaid,
    })),
    vendors: topVendors(spent).map((v) => ({ name: v.name, total: money(v.totalCents), count: v.count })),
    alert: alert ? { text: alert.text, status: alert.status } : null,
    generatedAt: now.toISOString(),
  };
}

// ---- CSV export ----

/** "2026-11-17" for a moment, in Chicago. */
function chicagoDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const KIND_WORDS = { dues: "Dues", deposit: "Deposit", reimbursement: "Reimbursement" } as const;

export async function loadExport(org: Org, kind: RangeKind, type: ExportType, now: Date = new Date()): Promise<string> {
  const orgId = org.id;
  const range = rangeFor(kind, now);

  if (type === "activity") {
    const r = await db()
      .from("ledger_entries")
      .select("direction, kind, amount_cents, description, signature, created_at, privy_user_id")
      .eq("org_id", orgId)
      .gte("created_at", range.queryFrom)
      .order("created_at", { ascending: false });
    const entries = check<
      (LedgerFlowRow & { description: string; signature: string; privy_user_id: string | null })[]
    >(r, "export ledger").filter((e) => inRange(range, e.created_at));
    const people = await loadPeople([...new Set(entries.map((e) => e.privy_user_id).filter((x): x is string => !!x))]);
    const byId = new Map(people.map((p) => [p.privy_user_id, p]));
    return toCsv(
      ["Date", "Direction", "Type", "Amount", "Description", "Member", "Verify link"],
      entries.map((e) => [
        chicagoDate(e.created_at),
        e.direction === "in" ? "In" : "Out",
        KIND_WORDS[e.kind] ?? e.kind,
        formatCents(e.amount_cents),
        e.description,
        e.privy_user_id ? displayName(byId.get(e.privy_user_id)) : "",
        explorerTxUrl(e.signature),
      ]),
    );
  }

  const [requestsResult, allCategories] = await Promise.all([
    db()
      .from("reimbursement_requests")
      .select(
        "created_at, privy_user_id, vendor, receipt_date, total_cents, category, status, review_group, review_reasons, decision_reason, denial_note, paid_at",
      )
      .eq("org_id", orgId)
      .neq("status", "submitted")
      .order("created_at", { ascending: false }),
    loadOrgCategories(orgId, true),
  ]);
  type Req = {
    created_at: string;
    privy_user_id: string;
    vendor: string | null;
    receipt_date: string | null;
    total_cents: number | null;
    category: string | null;
    status: string;
    review_group: string | null;
    review_reasons: unknown;
    decision_reason: string | null;
    denial_note: string | null;
    paid_at: string | null;
  };
  const requests = check<Req[]>(requestsResult, "export requests");

  if (type === "requests") {
    const inRangeRows = requests.filter((q) => inRange(range, q.created_at));
    const people = await loadPeople([...new Set(inRangeRows.map((q) => q.privy_user_id))]);
    const byId = new Map(people.map((p) => [p.privy_user_id, p]));
    const catNames = new Map(allCategories.map((c) => [c.slug as string, c.name]));
    return toCsv(
      ["Date submitted", "Member", "Vendor", "Receipt date", "Amount", "Category", "Status", "Reason or note", "Date paid"],
      inRangeRows.map((q) => [
        chicagoDate(q.created_at),
        displayName(byId.get(q.privy_user_id)),
        q.vendor ?? "",
        q.receipt_date ?? "",
        q.total_cents === null ? "" : formatCents(q.total_cents),
        q.category ? (catNames.get(q.category) ?? q.category) : "",
        statusLabel(q.status, q.review_group),
        q.status === "rejected" ? (q.denial_note ?? "") : reasonMessages(q.review_reasons).join("; "),
        chicagoDate(q.paid_at),
      ]),
    );
  }

  // members
  const settings = await loadOrgSettings(orgId);
  const duesPeriod = currentPeriod(settings.duesPeriod, now);
  const [membershipsResult, duesResult] = await Promise.all([
    db()
      .from("org_memberships")
      .select("privy_user_id, role, requested_at, approved_at")
      .eq("org_id", orgId)
      .eq("status", "active"),
    db()
      .from("dues_payments")
      .select("privy_user_id")
      .eq("org_id", orgId)
      .eq("period", duesPeriod.id)
      .eq("status", "sent"),
  ]);
  const memberships = check<{ privy_user_id: string; role: string; requested_at: string; approved_at: string | null }[]>(
    membershipsResult,
    "export memberships",
  );
  const payers = new Set(check<{ privy_user_id: string }[]>(duesResult, "export dues").map((d) => d.privy_user_id));
  const people = await loadPeople(memberships.map((m) => m.privy_user_id));
  const byId = new Map(people.map((p) => [p.privy_user_id, p]));
  return toCsv(
    ["Name", "Email", "Role", "Joined", `Dues paid (${duesPeriod.label})`, "Total reimbursed in range", "Requests in range"],
    memberships.map((m) => {
      const mine = requests.filter((q) => q.privy_user_id === m.privy_user_id);
      const paid = mine.filter((q) => q.status === "paid" && inRange(range, q.paid_at));
      return [
        displayName(byId.get(m.privy_user_id)),
        byId.get(m.privy_user_id)?.email ?? "",
        m.role === "treasurer" ? "Treasurer" : "Member",
        chicagoDate(m.approved_at ?? m.requested_at),
        payers.has(m.privy_user_id),
        formatCents(paid.reduce((s, q) => s + (q.total_cents ?? 0), 0)),
        mine.filter((q) => inRange(range, q.created_at)).length,
      ];
    }),
  );
}
