import { connection } from "next/server";
import { NewCategoryBody } from "@/lib/budget/categories";
import { createCategory, listCategoryBudgets } from "@/lib/budget/server";
import { requireTreasurer } from "@/lib/orgs/access";

// GET /api/orgs/:orgId/categories: the club's budget categories (archived
// ones flagged) with what's been spent this period. POST adds one
// { name, budgetCents, period }. Treasurer only. Queries filter by org_id
// inside lib/budget/server.ts.

export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/categories">) {
  await connection();
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    return Response.json({ categories: await listCategoryBudgets(orgId) });
  } catch (err) {
    console.error("categories load failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/categories">) {
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const parsed = NewCategoryBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
    const result = await createCategory(orgId, parsed.data);
    if (result.status !== "ok") return Response.json({ error: result.status }, { status: 409 });
    return Response.json(result, { status: 201 });
  } catch (err) {
    console.error("category create failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
