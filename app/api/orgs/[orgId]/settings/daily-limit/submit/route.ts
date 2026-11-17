import { z } from "zod";
import { requireTreasurer } from "@/lib/orgs/access";
import { finishVaultChange } from "@/lib/orgs/vault";

// POST /api/orgs/:orgId/settings/daily-limit/submit { changeId, transaction }:
// step 2. The treasurer's account approved the change; check it's exactly
// what we prepared, send it, and (once confirmed) save the new limit.

const Body = z.object({
  changeId: z.uuid(),
  transaction: z.string().min(1).max(8_000).regex(/^[A-Za-z0-9+/=]+$/),
});

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/settings/daily-limit/submit">) {
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

    const status = await finishVaultChange(access.org, parsed.data.changeId, access.person, parsed.data.transaction);
    return Response.json({ status }, { status: status === "conflict" ? 409 : 200 });
  } catch (err) {
    console.error("daily limit submit failed:", (err as Error).message);
    return Response.json({ status: "failed" }, { status: 502 });
  }
}
