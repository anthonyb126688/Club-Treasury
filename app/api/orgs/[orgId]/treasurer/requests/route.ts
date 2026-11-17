import { connection } from "next/server";
import { db } from "@/lib/db";
import { moneyOrNotRead } from "@/lib/dashboard/format";
import { isTab, statusLabel, TAB_FILTERS, TAB_LIMIT, TABS, type TabCode } from "@/lib/dashboard/tabs";
import type { RequestList, RequestRow } from "@/lib/dashboard/types";
import { requireTreasurer } from "@/lib/orgs/access";
import { displayName } from "@/lib/orgs/orgs";
import { loadOrgCategories } from "@/lib/orgs/settings";
import { categoryName, DEFAULT_SETTINGS, rulesFrom } from "@/lib/policy/rules";

// GET /api/orgs/:orgId/treasurer/requests?tab=needs_approval|paid|blocked|denied
// The requests in one tab of THIS club's dashboard (most recent 50), plus
// how many are in every tab. Treasurer only.

type Row = {
  id: string;
  status: string;
  review_group: string | null;
  vendor: string | null;
  total_cents: number | null;
  category: string | null;
  created_at: string;
  decided_at: string | null;
  paid_at: string | null;
  member: { email: string | null; first_name: string | null; last_name: string | null } | null;
};

const SELECT =
  "id, status, review_group, vendor, total_cents, category, created_at, decided_at, paid_at, member:members(email, first_name, last_name)";

function rowDate(tab: TabCode, r: Row): string {
  if (tab === "paid") return r.paid_at ?? r.decided_at ?? r.created_at;
  if (tab === "denied") return r.decided_at ?? r.created_at;
  return r.created_at;
}

export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/treasurer/requests">) {
  await connection();
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const asked = new URL(request.url).searchParams.get("tab");
    const tab: TabCode = isTab(asked) ? asked : "needs_approval";
    const requests = () => db().from("reimbursement_requests");

    let list = requests().select(SELECT).eq("org_id", orgId).or(TAB_FILTERS[tab]);
    list =
      tab === "paid"
        ? list.order("paid_at", { ascending: false, nullsFirst: true })
        : tab === "denied"
          ? list.order("decided_at", { ascending: false })
          : list.order("created_at", { ascending: false });

    const [names, rowsResult, ...countResults] = await Promise.all([
      loadOrgCategories(orgId, true).then((c) => rulesFrom(DEFAULT_SETTINGS, c)),
      list.limit(TAB_LIMIT),
      ...TABS.map((t) =>
        requests().select("id", { count: "exact", head: true }).eq("org_id", orgId).or(TAB_FILTERS[t]),
      ),
    ]);
    if (rowsResult.error) throw new Error(`requests: ${rowsResult.error.message}`);
    const counts = {} as Record<TabCode, number>;
    TABS.forEach((t, i) => {
      const r = countResults[i];
      if (r.error) throw new Error(`request counts: ${r.error.message}`);
      counts[t] = r.count ?? 0;
    });

    const rows: RequestRow[] = ((rowsResult.data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      status: r.status,
      statusLabel: statusLabel(r.status, r.review_group),
      memberName: displayName({
        firstName: r.member?.first_name,
        lastName: r.member?.last_name,
        email: r.member?.email,
      }),
      amount: moneyOrNotRead(r.total_cents),
      category: categoryName(names, r.category),
      vendor: r.vendor,
      date: rowDate(tab, r),
    }));

    const body: RequestList = { tab, counts, rows, limit: TAB_LIMIT };
    return Response.json(body);
  } catch (err) {
    console.error("treasurer requests failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
