import { connection } from "next/server";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { memberStatus, type RequestStatus } from "@/lib/reimburse/decide";
import { currentMember, payOut } from "@/lib/reimburse/server";

// GET /api/reimburse: the logged-in member's reimbursement history.
// Also nudges along any payout that's still in progress.

type Row = {
  id: string;
  status: RequestStatus;
  vendor: string | null;
  total_cents: number | null;
  created_at: string;
};

export async function GET(request: Request) {
  await connection(); // always run per request
  try {
    const member = await currentMember(request);
    if (!member) return Response.json({ error: "not_logged_in" }, { status: 401 });

    const { data, error } = await db()
      .from("reimbursement_requests")
      .select("id, status, vendor, total_cents, created_at")
      .eq("privy_user_id", member.userId)
      .neq("status", "submitted")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(`history: ${error.message}`);
    const rows = (data ?? []) as Row[];

    // Finish any payout that was interrupted (at most a couple per load).
    const inFlight = rows.filter((r) => r.status === "auto_approved" || r.status === "approved");
    for (const r of inFlight.slice(0, 2)) {
      const result = await payOut(r.id);
      if (result === "paid") r.status = "paid";
      if (result === "failed") r.status = "payment_failed";
    }

    return Response.json({
      requests: rows.map((r) => ({
        id: r.id,
        vendor: r.vendor,
        amount: r.total_cents ? formatCents(r.total_cents) : null,
        status: memberStatus(r.status),
        date: r.created_at,
      })),
    });
  } catch (err) {
    console.error("reimburse history failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
