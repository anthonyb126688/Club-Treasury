import { db } from "@/lib/db";
import { requireMember } from "@/lib/orgs/access";
import { wouldLeaveNoTreasurer } from "@/lib/orgs/decide-access";
import { activeTreasurers } from "@/lib/orgs/orgs";
import { prepareVaultChange } from "@/lib/orgs/vault";

// POST /api/orgs/:orgId/leave: leave this club.
//   Member → { status: "left" } (membership set to "removed").
//   Treasurer → they're also an approver on the club's vault, so leaving is
//   a vault change their own account approves silently:
//     { status: "ready", changeId, transaction } → approve, then
//     POST /api/orgs/:orgId/leave/submit { changeId, transaction }.
//   409 { error: "only_treasurer" }: the last treasurer can't leave.
//   409 { error: "club_not_ready" } | 502 { error: "failed" }
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/leave">) {
  const { orgId } = await ctx.params;
  const access = await requireMember(request, orgId);
  if (access instanceof Response) return access;
  const { person, membership, org } = access;
  try {
    if (membership.role !== "treasurer") {
      const { error } = await db()
        .from("org_memberships")
        .update({ status: "removed" })
        .eq("org_id", orgId)
        .eq("privy_user_id", person.userId)
        .eq("status", "active");
      if (error) throw new Error(`leave: ${error.message}`);
      return Response.json({ status: "left" });
    }

    if (wouldLeaveNoTreasurer(await activeTreasurers(orgId), person.userId)) {
      return Response.json({ error: "only_treasurer" }, { status: 409 });
    }
    const start = await prepareVaultChange(
      org,
      { kind: "remove_approver", userId: person.userId, address: person.solanaAddress, then: "remove" },
      { userId: person.userId, solanaAddress: person.solanaAddress },
    );
    if (start.status === "not_ready") return Response.json({ error: "club_not_ready" }, { status: 409 });
    if (start.status === "failed") return Response.json({ error: "failed" }, { status: 502 });
    return Response.json(start);
  } catch (err) {
    console.error("leave club failed:", (err as Error).message);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
