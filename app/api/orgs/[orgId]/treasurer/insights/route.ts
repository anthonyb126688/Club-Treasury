import { connection } from "next/server";
import { loadInsights } from "@/lib/insights/load";
import { parseRange } from "@/lib/insights/ranges";
import { requireTreasurer } from "@/lib/orgs/access";

// GET /api/orgs/:orgId/treasurer/insights?range=month|semester|year
// Everything the Insights page shows for THIS club, in one response.
// Treasurer only. Every query is filtered by org_id (lib/insights/load.ts).
export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/treasurer/insights">) {
  await connection();
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const range = parseRange(new URL(request.url).searchParams.get("range"));
    return Response.json(await loadInsights(access.org, range));
  } catch (err) {
    console.error("insights failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
