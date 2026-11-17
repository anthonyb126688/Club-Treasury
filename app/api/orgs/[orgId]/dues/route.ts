import { connection } from "next/server";
import { loadDuesContext } from "@/lib/dues/load";
import { recordDuesPaid } from "@/lib/dues/record";
import { centsToUnits, formatUsd } from "@/lib/money";
import { requireMember } from "@/lib/orgs/access";
import { getDollarBalance } from "@/lib/solana/balance";
import { ClubNotReadyError, clubHolderAddress } from "@/lib/solana/squads";

// GET /api/orgs/:orgId/dues: this period's dues status for the logged-in
// member of this club, plus the club's balance.
export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/dues">) {
  await connection(); // always run per request; never pre-build this response
  const { orgId } = await ctx.params;
  const access = await requireMember(request, orgId);
  if (access instanceof Response) return access;
  try {
    const dues = await loadDuesContext(access);

    let status: "unpaid" | "pending" | "paid";
    if (dues.decision === "paid") status = "paid";
    else if (dues.decision === "mark_paid") {
      await recordDuesPaid({ ...dues.row!, signature: dues.row!.signature! }, dues.period.label);
      status = "paid";
    } else if (dues.decision === "wait") status = "pending";
    else status = "unpaid"; // claim_new, retry, resume: the button is available

    let clubBalance: string | null = null;
    try {
      clubBalance = formatUsd(await getDollarBalance(clubHolderAddress(access.org)));
    } catch (err) {
      if (!(err instanceof ClubNotReadyError)) throw err;
    }

    return Response.json({
      term: dues.period.label,
      amount: formatUsd(centsToUnits(dues.settings.duesAmountCents)),
      status,
      clubBalance,
    });
  } catch (err) {
    console.error("dues status failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
