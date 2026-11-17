import { z } from "zod";
import { requireTreasurer } from "@/lib/orgs/access";
import { startTreasurerApproval } from "@/lib/reimburse/server";

// POST /api/orgs/:orgId/treasurer/approve/prepare { id }: step 1 of the
// treasurer's Approve tap. Builds "approve + pay" for the request's Squads
// proposal in THIS club's vault; the treasurer's own account approves it
// silently in the browser (step 2 is .../approve/submit). Treasurer only.

const Body = z.object({ id: z.uuid() });

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/treasurer/approve/prepare">) {
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

    const result = await startTreasurerApproval(access.org, parsed.data.id, access.person);
    if (result.status === "not_approver") return Response.json(result, { status: 403 });
    if (result.status === "not_found") return Response.json(result, { status: 409 });
    return Response.json(result);
  } catch (err) {
    console.error("approve prepare failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
