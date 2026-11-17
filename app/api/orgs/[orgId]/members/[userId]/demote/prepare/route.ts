import { requireTreasurer } from "@/lib/orgs/access";
import { prepareMemberChange } from "@/lib/members/vault-flow";

// POST /api/orgs/:orgId/members/:userId/demote/prepare { then: "demote" | "remove" }:
// stop this person being a treasurer, and with then: "remove" also remove them from the club, step 1. Opens the vault change and returns what the treasurer's own account approves silently in the browser.
// Treasurer only; the person must be an active member of THIS club.
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/members/[userId]/demote/prepare">) {
  const { orgId, userId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    return await prepareMemberChange(access, userId, "demote", request);
  } catch (err) {
    console.error("member demote prepare failed:", (err as Error).message);
    return Response.json({ error: "unavailable", message: "That didn't work. Try again." }, { status: 502 });
  }
}
