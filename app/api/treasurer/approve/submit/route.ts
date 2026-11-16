import { z } from "zod";
import { currentMember, finishTreasurerApproval } from "@/lib/reimburse/server";

// POST /api/treasurer/approve/submit { id, transaction }: step 2. The
// treasurer's account approved it; check it's exactly what we prepared, send
// it (the vault pays the member), and record it on the ledger.

const Body = z.object({ id: z.uuid(), transaction: z.string().min(1).max(10_000) });

export async function POST(request: Request) {
  try {
    const viewer = await currentMember(request);
    if (!viewer) return Response.json({ error: "not_logged_in" }, { status: 401 });
    if (viewer.role !== "treasurer") return Response.json({ error: "not_treasurer" }, { status: 403 });

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

    const status = await finishTreasurerApproval(parsed.data.id, viewer, parsed.data.transaction);
    if (status === "conflict") return Response.json({ status }, { status: 409 });
    return Response.json({ status });
  } catch (err) {
    console.error("approve submit failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
