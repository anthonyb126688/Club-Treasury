import { db } from "@/lib/db";
import { loadDuesContext } from "@/lib/dues/load";
import { recordDuesPaid } from "@/lib/dues/record";
import { requireMember } from "@/lib/orgs/access";
import { NotEnoughMoneyError, prepareDuesPayment } from "@/lib/solana/dues";
import { ClubNotReadyError, clubHolderAddress } from "@/lib/solana/squads";

// POST /api/orgs/:orgId/dues/prepare: start (or resume) this period's dues
// payment to this club. Claims the member's row for this period BEFORE
// building the payment, so a double tap can't create two.
//
// Responses: { status: "paid" } | { status: "pending" }
//          | { status: "ready", transaction }  | 402 { error: "not_enough" }
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/dues/prepare">) {
  const { orgId } = await ctx.params;
  const access = await requireMember(request, orgId);
  if (access instanceof Response) return access;
  try {
    const { settings, period, row, decision } = await loadDuesContext(access);
    const dues = db().from("dues_payments");
    const userId = access.person.userId;

    if (decision === "paid") return Response.json({ status: "paid" });
    if (decision === "mark_paid") {
      await recordDuesPaid({ ...row!, signature: row!.signature! }, period.label);
      return Response.json({ status: "paid" });
    }
    if (decision === "wait") return Response.json({ status: "pending" });
    if (decision === "resume") return Response.json({ status: "ready", transaction: row!.pending_tx });

    let clubAddress: string;
    try {
      clubAddress = clubHolderAddress(access.org);
    } catch (err) {
      if (err instanceof ClubNotReadyError) return Response.json({ error: "club_not_ready" }, { status: 409 });
      throw err;
    }

    // claim_new or retry: claim the row first.
    let rowId: string | null = null;
    if (decision === "claim_new") {
      const { data, error } = await dues
        .upsert(
          { org_id: orgId, privy_user_id: userId, amount_cents: settings.duesAmountCents, period: period.id },
          { onConflict: "org_id,privy_user_id,period", ignoreDuplicates: true },
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
          amount_cents: settings.duesAmountCents,
          claimed_at: new Date().toISOString(),
        })
        .eq("org_id", orgId)
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
        clubAddress,
        access.person.solanaAddress,
        settings.duesAmountCents,
        `club-treasury:dues:${orgId}:${period.id}`,
      );
    } catch (err) {
      await db().from("dues_payments").update({ status: "failed" }).eq("org_id", orgId).eq("id", rowId);
      if (err instanceof NotEnoughMoneyError) {
        return Response.json({ error: "not_enough" }, { status: 402 });
      }
      throw err;
    }

    // Save the payment's signature before handing it out.
    const { error } = await db()
      .from("dues_payments")
      .update({ signature: payment.signature, pending_tx: payment.wire })
      .eq("org_id", orgId)
      .eq("id", rowId);
    if (error) throw new Error(`dues save: ${error.message}`);

    return Response.json({ status: "ready", transaction: payment.wire });
  } catch (err) {
    console.error("dues prepare failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
