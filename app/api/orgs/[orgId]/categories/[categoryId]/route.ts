import { z } from "zod";
import { CategoryPatchBody } from "@/lib/budget/categories";
import { archiveCategory, updateCategory, type CategoryWriteResult } from "@/lib/budget/server";
import { requireTreasurer } from "@/lib/orgs/access";

// PATCH /api/orgs/:orgId/categories/:categoryId { name?, budgetCents?, period? }:
// rename (the slug stays, so past requests stay linked) or change the budget.
// DELETE archives it (never deleted; "Other" can't be archived). Treasurer only.

const Id = z.uuid();

function reply(result: CategoryWriteResult) {
  if (result.status === "ok") return Response.json(result);
  return Response.json({ error: result.status }, { status: result.status === "not_found" ? 404 : 409 });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/categories/[categoryId]">) {
  const { orgId, categoryId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const parsed = CategoryPatchBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !Id.safeParse(categoryId).success) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    return reply(await updateCategory(orgId, categoryId, parsed.data));
  } catch (err) {
    console.error("category update failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/categories/[categoryId]">) {
  const { orgId, categoryId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    if (!Id.safeParse(categoryId).success) return Response.json({ error: "bad_request" }, { status: 400 });
    return reply(await archiveCategory(orgId, categoryId));
  } catch (err) {
    console.error("category archive failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
