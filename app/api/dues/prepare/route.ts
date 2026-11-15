import { db } from "@/lib/db";
import { CURRENT_TERM, DUES_AMOUNT_CENTS } from "@/lib/dues/config";
import { loadDuesContext } from "@/lib/dues/load";
import { recordDuesPaid } from "@/lib/dues/record";
import { NotEnoughMoneyError, prepareDuesPayment } from "@/lib/solana/dues";

// POST /api/dues/prepare: start (or resume) this term's $25 dues payment.
// Claims the member's row for this term BEFORE building the payment, so a
// double tap can't create two. Returns the payment for the member to approve.
//
// Responses: { status: "paid" } | { status: "pending" }
//          | { status: "ready", transaction }  | 402 { error: "not_enough" }
export async function POST(request: Request) {
  try {
    const ctx = await loadDuesContext(request);
    if (ctx instanceof Response) return ctx;
    const { userId, member, row, decision } = ctx;
    const dues = db().from("dues_payments");

    if (decision === "paid") return Response.json({ status: "paid" });
    if (decision === "mark_paid") {
      await recordDuesPaid({ ...row!, signature: row!.signature! });
      return Response.json({ status: "paid" });
    }
    if (decision === "wait") return Response.json({ status: "pending" });
    if (decision === "resume") return Response.json({ status: "ready", transaction: row!.pending_tx });

    // claim_new or retry: claim the row first.
    let rowId: string | null = null;
    if (decision === "claim_new") {
      const { data, error } = await dues
        .upsert(
          { privy_user_id: userId, amount_cents: DUES_AMOUNT_CENTS, period: CURRENT_TERM.id },
          { onConflict: "privy_user_id,period", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw new Error(`dues insert: ${error.message}`);
      rowId = data?.[0]?.id ?? null;
    } else {
      const { data, error } = await dues
        .update({
          status: "pending",
          signature: null,
          pending_tx: null,
          amount_cents: DUES_AMOUNT_CENTS,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", row!.id)
        .eq("status", row!.status)
        .eq("claimed_at", row!.claimed_at)
        .select("id");
      if (error) throw new Error(`dues claim: ${error.message}`);
      rowId = data?.[0]?.id ?? null;
    }
    if (!rowId) return Response.json({ status: "pending" }); // someone else got there first

    let payment;
    try {
      payment = await prepareDuesPayment(
        member.solanaAddress,
        DUES_AMOUNT_CENTS,
        `club-treasury:dues:${CURRENT_TERM.id}`,
      );
    } catch (err) {
      await dues.update({ status: "failed" }).eq("id", rowId);
      if (err instanceof NotEnoughMoneyError) {
        return Response.json({ error: "not_enough" }, { status: 402 });
      }
      throw err;
    }

    // Save the payment's signature before handing it out.
    const { error } = await dues
      .update({ signature: payment.signature, pending_tx: payment.wire })
      .eq("id", rowId);
    if (error) throw new Error(`dues save: ${error.message}`);

    return Response.json({ status: "ready", transaction: payment.wire });
  } catch (err) {
    console.error("dues prepare failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
