import { z } from "zod";
import { requireTreasurer } from "@/lib/orgs/access";
import { wouldLeaveNoTreasurer } from "@/lib/orgs/decide-access";
import { activeTreasurers } from "@/lib/orgs/orgs";
import { finishVaultChange } from "@/lib/orgs/vault";

const Body = z.object({ changeId: z.uuid(), transaction: z.string().min(1).max(20_000) });

// POST /api/orgs/:orgId/leave/submit { changeId, transaction }: a treasurer
// leaving, step 2. Their account approved removing themselves from the
// vault; check it, send it, and mark them removed from the club.
//   → { status: "done" | "processing" | "failed" | "conflict" }
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/leave/submit">) {
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    // Check again: another treasurer may have left in the meantime.
    if (wouldLeaveNoTreasurer(await activeTreasurers(orgId), access.person.userId)) {
      return Response.json({ error: "only_treasurer" }, { status: 409 });
    }
    const status = await finishVaultChange(
      access.org,
      parsed.data.changeId,
      { userId: access.person.userId, solanaAddress: access.person.solanaAddress },
      parsed.data.transaction,
    );
    return Response.json({ status });
  } catch (err) {
    console.error("leave club submit failed:", (err as Error).message);
    return Response.json({ status: "failed" }, { status: 502 });
  }
}
