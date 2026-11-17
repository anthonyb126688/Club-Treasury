import { connection } from "next/server";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { requireMember } from "@/lib/orgs/access";
import { statusLine } from "@/lib/member/status";
import { memberStatus, type RequestStatus } from "@/lib/reimburse/decide";
import { payOut } from "@/lib/reimburse/server";

// GET /api/orgs/:orgId/reimburse: the logged-in member's reimbursement
// history in this club. Also nudges along any payout still in progress.
// Each request carries a member-friendly status line (lib/member/status.ts).

type Row = {
  id: string;
  status: RequestStatus;
  vendor: string | null;
  total_cents: number | null;
  receipt_date: string | null;
  created_at: string;
  review_group: string | null;
  review_reasons: unknown;
  denial_note: string | null;
  decision_reason: string | null;
};

export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/reimburse">) {
  await connection(); // always run per request
  const { orgId } = await ctx.params;
  const access = await requireMember(request, orgId);
  if (access instanceof Response) return access;
  try {
    const { data, error } = await db()
      .from("reimbursement_requests")
      .select("id, status, vendor, total_cents, receipt_date, created_at, denial_note, decision_reason, review_group, review_reasons")
      .eq("org_id", orgId)
      .eq("privy_user_id", access.person.userId)
      .neq("status", "submitted")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(`history: ${error.message}`);
    const rows = (data ?? []) as Row[];

    // Finish any payout that was interrupted (at most a couple per load).
    const inFlight = rows.filter((r) => r.status === "auto_approved" || r.status === "approved");
    for (const r of inFlight.slice(0, 2)) {
      const result = await payOut(orgId, r.id);
      if (result === "paid") r.status = "paid";
      if (result === "failed") r.status = "payment_failed";
      if (result === "queued") r.status = "queued";
    }

    return Response.json({
      requests: rows.map((r) => ({
        id: r.id,
        vendor: r.vendor,
        amount: r.total_cents ? formatCents(r.total_cents) : null,
        status: memberStatus(r.status),
        date: r.created_at,
        receiptDate: r.receipt_date,
        note: r.status === "rejected" ? r.denial_note : null,
        line: statusLine({
          status: r.status,
          reviewGroup: r.review_group,
          reviewReasons: r.review_reasons,
          denialNote: r.denial_note,
        }),
      })),
    });
  } catch (err) {
    console.error("reimburse history failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
