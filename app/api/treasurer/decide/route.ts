import { z } from "zod";
import { db } from "@/lib/db";
import { currentMember, payOut } from "@/lib/reimburse/server";

// POST /api/treasurer/decide: approve (pays out immediately), reject, or
// retry a failed payout. Treasurer only.

const Body = z.object({
  id: z.uuid(),
  action: z.enum(["approve", "reject", "retry"]),
});

export async function POST(request: Request) {
  try {
    const viewer = await currentMember(request);
    if (!viewer) return Response.json({ error: "not_logged_in" }, { status: 401 });
    if (viewer.role !== "treasurer") return Response.json({ error: "not_treasurer" }, { status: 403 });

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
    const { id, action } = parsed.data;

    if (action === "approve" || action === "reject") {
      // Only a request that's still waiting can be decided, and only once.
      const { data, error } = await db()
        .from("reimbursement_requests")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          decided_by: viewer.userId,
          decided_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "queued")
        .select("id");
      if (error) throw new Error(`decide: ${error.message}`);
      if (!data?.length) return Response.json({ error: "already_decided" }, { status: 409 });
      if (action === "reject") return Response.json({ status: "rejected" });
    }

    const result = await payOut(id);
    return Response.json({ status: result });
  } catch (err) {
    console.error("treasurer decide failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
