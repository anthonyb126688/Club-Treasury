import { z } from "zod";
import { db } from "@/lib/db";
import { requireTreasurer } from "@/lib/orgs/access";
import { BAD_PERSON, checkTarget, refuse } from "@/lib/members/server";
import { parseUserIdParam } from "@/lib/members/rules";

// POST /api/orgs/:orgId/members/:userId { action }: in THIS club,
//   approve  a pending join request (→ active)
//   decline  a pending join request (→ declined)
//   remove   a regular member (→ removed). Treasurers are removed through
//            .../demote with then: "remove", since they're vault approvers.
// Treasurer only.

const Body = z.object({ action: z.enum(["approve", "decline", "remove"]) });

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/members/[userId]">) {
  const { orgId, userId: rawUserId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const userId = parseUserIdParam(rawUserId);
    if (!userId) return BAD_PERSON();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
    const { action } = parsed.data;

    const { check } = await checkTarget(orgId, access.person.userId, userId, action);
    if (!check.ok) return refuse(check);

    // Each update only applies if the person is still in the state we checked,
    // so two treasurers tapping at once can't both win.
    let update = db().from("org_memberships").update(
      action === "approve"
        ? { status: "active", approved_at: new Date().toISOString(), approved_by: access.person.userId }
        : action === "decline"
          ? { status: "declined" }
          : { status: "removed", role: "member" },
    );
    update = update.eq("org_id", orgId).eq("privy_user_id", userId);
    update = action === "remove" ? update.eq("status", "active").eq("role", "member") : update.eq("status", "pending");
    const { data, error } = await update.select("status");
    if (error) throw new Error(`membership update: ${error.message}`);
    if (!data?.length) {
      return Response.json(
        { error: "already_handled", message: "That changed while you were looking. Refresh to see the latest." },
        { status: 409 },
      );
    }
    return Response.json({ status: data[0].status });
  } catch (err) {
    console.error("member action failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
