import { connection } from "next/server";
import { CURRENT_TERM, DUES_AMOUNT_CENTS } from "@/lib/dues/config";
import { loadDuesContext } from "@/lib/dues/load";
import { recordDuesPaid } from "@/lib/dues/record";
import { formatUsd, centsToUnits } from "@/lib/money";
import { getDollarBalance } from "@/lib/solana/balance";
import { clubHolderAddress } from "@/lib/solana/squads";

// GET /api/dues: this term's dues status for the logged-in member, plus the
// club's balance for the home screen.
export async function GET(request: Request) {
  await connection(); // always run per request; never pre-build this response
  try {
    const ctx = await loadDuesContext(request);
    if (ctx instanceof Response) return ctx;

    let status: "unpaid" | "pending" | "paid";
    if (ctx.decision === "paid") status = "paid";
    else if (ctx.decision === "mark_paid") {
      await recordDuesPaid({ ...ctx.row!, signature: ctx.row!.signature! });
      status = "paid";
    } else if (ctx.decision === "wait") status = "pending";
    else status = "unpaid"; // claim_new, retry, resume: the button is available

    return Response.json({
      term: CURRENT_TERM.label,
      amount: formatUsd(centsToUnits(DUES_AMOUNT_CENTS)),
      status,
      clubBalance: formatUsd(await getDollarBalance(await clubHolderAddress())),
    });
  } catch (err) {
    console.error("dues status failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
