import { requireTreasurer } from "@/lib/orgs/access";
import { submitMemberChange } from "@/lib/members/vault-flow";

// POST /api/orgs/:orgId/members/:userId/demote/submit { changeId, transaction }:
// stop this person being a treasurer, and with then: "remove" also remove them from the club, step 2. Checks it's exactly the change we prepared, sends it, and updates the membership once it's confirmed.
// Treasurer only; the person must be an active member of THIS club.
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/members/[userId]/demote/submit">) {
  const { orgId, userId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    return await submitMemberChange(access, userId, "demote", request);
  } catch (err) {
    console.error("member demote submit failed:", (err as Error).message);
    return Response.json({ error: "unavailable", message: "That didn't work. Try again." }, { status: 502 });
  }
}
