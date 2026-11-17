import { connection } from "next/server";
import { formatCents } from "@/lib/money";
import { requireTreasurer } from "@/lib/orgs/access";
import { settleVaultChanges } from "@/lib/orgs/vault";
import { loadMemberList } from "@/lib/members/server";

// GET /api/orgs/:orgId/members: everyone waiting to join THIS club (first),
// then its active members, each with dues status for the current period and
// total reimbursed. Plus the join code for the empty state. Treasurer only.
export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/members">) {
  await connection(); // always run per request; never pre-build this response
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    // Finish any co-treasurer change whose confirmation was slow, so roles are current.
    await settleVaultChanges(orgId).catch((e) => console.error("settle vault changes:", (e as Error).message));
    const { people, period } = await loadMemberList(access.org.id, access.person.userId);
    return Response.json({
      joinCode: access.org.join_code,
      period: { id: period.id, label: period.label },
      people: people.map(({ totalReimbursedCents, ...p }) => ({
        ...p,
        totalReimbursed: formatCents(totalReimbursedCents),
      })),
    });
  } catch (err) {
    console.error("members list failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
