import { connection } from "next/server";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { earliestPeriodStart, SPENT_STATUSES, summarizeBudgets, type SpentRow } from "@/lib/member/budget";
import { requireMember } from "@/lib/orgs/access";
import { loadOrgCategories } from "@/lib/orgs/settings";

// GET /api/orgs/:orgId/budget: the club's budget per category for any
// member: budgeted, spent and left this period. Club totals only (no names,
// no individual requests).
export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/budget">) {
  await connection(); // always run per request
  const { orgId } = await ctx.params;
  const access = await requireMember(request, orgId);
  if (access instanceof Response) return access;
  try {
    const now = new Date();
    const categories = await loadOrgCategories(orgId);

    const { data, error } = await db()
      .from("reimbursement_requests")
      .select("category, total_cents, status, decided_at")
      .eq("org_id", orgId)
      .in("status", [...SPENT_STATUSES])
      .gte("decided_at", earliestPeriodStart(categories, now));
    if (error) throw new Error(`budget spent: ${error.message}`);

    const lines = summarizeBudgets(categories, (data ?? []) as SpentRow[], now);
    return Response.json({
      categories: lines.map((l) => ({
        slug: l.slug,
        name: l.name,
        periodPhrase: l.periodPhrase,
        periodLabel: l.periodLabel,
        budget: formatCents(l.budgetCents),
        spent: formatCents(l.spentCents),
        remaining: formatCents(l.remainingCents),
        overBy: l.overByCents > 0 ? formatCents(l.overByCents) : null,
        hasBudget: l.budgetCents > 0,
        percentUsed: l.percentUsed,
      })),
    });
  } catch (err) {
    console.error("budget failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
