import { db } from "@/lib/db";
import { loadDuesContext } from "@/lib/dues/load";
import { recordDuesPaid } from "@/lib/dues/record";
import { checkApprovedDuesPayment } from "@/lib/solana/dues";
import { submit, waitForConfirmation } from "@/lib/solana/treasury";

// POST /api/dues/submit { transaction }: the member approved the payment in
// the browser. Check it's exactly the one we prepared, send it, and record it.
//
// Responses: { status: "paid" | "pending" | "failed" }
export async function POST(request: Request) {
  try {
    const ctx = await loadDuesContext(request);
    if (ctx instanceof Response) return ctx;
    const { member, row, decision } = ctx;

    if (decision === "paid") return Response.json({ status: "paid" });
    if (decision === "mark_paid") {
      await recordDuesPaid({ ...row!, signature: row!.signature! });
      return Response.json({ status: "paid" });
    }
    if (decision !== "resume" || !row?.signature) {
      return Response.json({ status: "failed" }, { status: 409 });
    }

    const body = (await request.json().catch(() => null)) as { transaction?: unknown } | null;
    if (typeof body?.transaction !== "string") {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }

    let wire: string;
    try {
      wire = checkApprovedDuesPayment(body.transaction, row.signature, member.solanaAddress);
    } catch {
      return Response.json({ error: "bad_payment" }, { status: 400 });
    }

    await submit({ wire });
    const result = await waitForConfirmation(row.signature);
    if (result === "confirmed") {
      await recordDuesPaid({ ...row, signature: row.signature });
      return Response.json({ status: "paid" });
    }
    if (result === "failed") {
      await db().from("dues_payments").update({ status: "failed" }).eq("id", row.id);
      return Response.json({ status: "failed" });
    }
    return Response.json({ status: "pending" });
  } catch (err) {
    console.error("dues submit failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
