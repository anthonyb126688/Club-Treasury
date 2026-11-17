import { requireTreasurer } from "@/lib/orgs/access";
import { regenerateJoinCode } from "@/lib/orgs/settings-write";

// POST /api/orgs/:orgId/join-code/regenerate: give the club a new join code.
// The old code (and invite link) stops working. Treasurer only.

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/join-code/regenerate">) {
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    return Response.json({ joinCode: await regenerateJoinCode(access.org) });
  } catch (err) {
    console.error("join code regenerate failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
