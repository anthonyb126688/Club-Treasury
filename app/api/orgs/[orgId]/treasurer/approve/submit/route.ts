import { z } from "zod";
import { requireTreasurer } from "@/lib/orgs/access";
import { finishTreasurerApproval } from "@/lib/reimburse/server";

// POST /api/orgs/:orgId/treasurer/approve/submit { id, transaction }: step 2.
// The treasurer's account approved it; check it's exactly what we prepared,
// send it (the club's vault pays the member), and record it on the ledger.

const Body = z.object({ id: z.uuid(), transaction: z.string().min(1).max(10_000) });

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/treasurer/approve/submit">) {
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

    const status = await finishTreasurerApproval(access.org, parsed.data.id, access.person, parsed.data.transaction);
    if (status === "conflict") return Response.json({ status }, { status: 409 });
    return Response.json({ status });
  } catch (err) {
    console.error("approve submit failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
