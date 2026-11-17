import { requireTreasurer } from "@/lib/orgs/access";
import { submitMemberChange } from "@/lib/members/vault-flow";

// POST /api/orgs/:orgId/members/:userId/promote/submit { changeId, transaction }:
// make this person a co-treasurer (they become an approver of the club's vault), step 2. Checks it's exactly the change we prepared, sends it, and updates the membership once it's confirmed.
// Treasurer only; the person must be an active member of THIS club.
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/members/[userId]/promote/submit">) {
  const { orgId, userId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    return await submitMemberChange(access, userId, "promote", request);
  } catch (err) {
    console.error("member promote submit failed:", (err as Error).message);
    return Response.json({ error: "unavailable", message: "That didn't work. Try again." }, { status: 502 });
  }
}
