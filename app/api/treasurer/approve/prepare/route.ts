import { z } from "zod";
import { currentMember, startTreasurerApproval } from "@/lib/reimburse/server";

// POST /api/treasurer/approve/prepare { id }: step 1 of the treasurer's
// Approve tap. Builds "approve + pay" for the request's Squads proposal; the
// treasurer's own account approves it silently in the browser (step 2 is
// /api/treasurer/approve/submit). Treasurer only.

const Body = z.object({ id: z.uuid() });

export async function POST(request: Request) {
  try {
    const viewer = await currentMember(request);
    if (!viewer) return Response.json({ error: "not_logged_in" }, { status: 401 });
    if (viewer.role !== "treasurer") return Response.json({ error: "not_treasurer" }, { status: 403 });

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

    const result = await startTreasurerApproval(parsed.data.id, viewer);
    if (result.status === "not_approver") return Response.json(result, { status: 403 });
    if (result.status === "not_found") return Response.json(result, { status: 409 });
    return Response.json(result);
  } catch (err) {
    console.error("approve prepare failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
