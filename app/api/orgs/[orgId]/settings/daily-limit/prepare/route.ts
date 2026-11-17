import { DailyLimitBody } from "@/lib/budget/settings";
import { requireTreasurer } from "@/lib/orgs/access";
import { prepareVaultChange } from "@/lib/orgs/vault";

// POST /api/orgs/:orgId/settings/daily-limit/prepare { cents }: step 1 of
// changing the club's daily automatic payout limit. The limit lives in the
// club's vault on-chain, so the server opens the change and returns what the
// treasurer's own account approves silently (step 2 is .../submit).

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/settings/daily-limit/prepare">) {
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const parsed = DailyLimitBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

    const result = await prepareVaultChange(
      access.org,
      { kind: "set_daily_limit", cents: parsed.data.cents },
      access.person,
    );
    if (result.status === "not_ready") return Response.json(result, { status: 409 });
    if (result.status === "failed") return Response.json(result, { status: 502 });
    return Response.json(result);
  } catch (err) {
    console.error("daily limit prepare failed:", (err as Error).message);
    return Response.json({ status: "failed" }, { status: 502 });
  }
}
