import { z } from "zod";
import { db } from "@/lib/db";
import { requireTreasurer } from "@/lib/orgs/access";
import { payOut } from "@/lib/reimburse/server";

// POST /api/orgs/:orgId/treasurer/decide: deny (with a note shown to the
// member) or retry a failed instant payout, in THIS club. Approving goes
// through .../treasurer/approve (the club's vault). Treasurer only.

// Denying needs a note (1–500 characters) so the member knows why.
const Body = z.discriminatedUnion("action", [
  z.object({ id: z.uuid(), action: z.literal("reject"), note: z.string().trim().min(1).max(500) }),
  z.object({ id: z.uuid(), action: z.literal("retry") }),
]);

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/treasurer/decide">) {
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const missingNote = parsed.error.issues.some((i) => i.path[0] === "note");
      return Response.json({ error: missingNote ? "note_required" : "bad_request" }, { status: 400 });
    }
    const { id } = parsed.data;

    if (parsed.data.action === "reject") {
      // Only a request that's still waiting can be denied, and only once.
      const { data, error } = await db()
        .from("reimbursement_requests")
        .update({
          status: "rejected",
          denial_note: parsed.data.note,
          decided_by: access.person.userId,
          decided_at: new Date().toISOString(),
        })
        .eq("org_id", orgId)
        .eq("id", id)
        .eq("status", "queued")
        .select("id");
      if (error) throw new Error(`decide: ${error.message}`);
      if (!data?.length) return Response.json({ error: "already_decided" }, { status: 409 });
      return Response.json({ status: "rejected" });
    }

    const result = await payOut(orgId, id);
    return Response.json({ status: result });
  } catch (err) {
    console.error("treasurer decide failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
