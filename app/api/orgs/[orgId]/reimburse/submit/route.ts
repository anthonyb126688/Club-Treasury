import { z } from "zod";
import { db } from "@/lib/db";
import { buildClaim, dedupeKey } from "@/lib/extract/claim";
import { requireMember } from "@/lib/orgs/access";
import { loadOrgRules } from "@/lib/orgs/settings";
import { decideReimbursement } from "@/lib/policy/decide";
import { OTHER_CATEGORY } from "@/lib/policy/rules";
import { ensureProposal, loadPolicyContext, payOut, todayUtc } from "@/lib/reimburse/server";

// POST /api/orgs/:orgId/reimburse/submit: the member confirms (or edits)
// what the AI read. Code decides with THIS club's rules: pay now, or send to
// the treasurer. The AI is not involved in this step at all.

const Body = z.object({
  id: z.uuid(),
  totalCents: z.number().int().positive().max(10_000_000),
  category: z.string().regex(/^[a-z0-9-]{1,40}$/),
});

type DraftRow = {
  id: string;
  receipt_image_hash: string;
  ai_is_receipt: boolean;
  vendor: string | null;
  receipt_date: string | null;
  ai_total_cents: number | null;
  ai_category: string | null;
};

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/reimburse/submit">) {
  const { orgId } = await ctx.params;
  const access = await requireMember(request, orgId);
  if (access instanceof Response) return access;
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
    const input = parsed.data;

    const { data: row, error } = await db()
      .from("reimbursement_requests")
      .select("id, receipt_image_hash, ai_is_receipt, vendor, receipt_date, ai_total_cents, ai_category")
      .eq("org_id", orgId)
      .eq("id", input.id)
      .eq("privy_user_id", access.person.userId)
      .eq("status", "submitted")
      .maybeSingle<DraftRow>();
    if (error) throw new Error(`draft lookup: ${error.message}`);
    if (!row) return Response.json({ error: "not_found" }, { status: 404 });

    const { rules } = await loadOrgRules(orgId);
    if (!rules.categories[input.category]) {
      return Response.json({ error: "bad_category" }, { status: 400 });
    }

    const { claim, memberEdited } = buildClaim(
      {
        isReceipt: row.ai_is_receipt,
        vendor: row.vendor,
        date: row.receipt_date,
        totalCents: row.ai_total_cents,
        category: row.ai_category ?? OTHER_CATEGORY,
        lineItems: [],
        summary: "",
      },
      { totalCents: input.totalCents, category: input.category },
    );

    const today = todayUtc();
    const key = dedupeKey(row.vendor, row.receipt_date, input.totalCents);
    const context = await loadPolicyContext({
      orgId,
      requestId: row.id,
      category: rules.categories[input.category] ?? null,
      imageHash: row.receipt_image_hash,
      dedupeKey: key,
      today,
      memberEdited,
    });
    const result = decideReimbursement(claim, rules, context);
    const auto = result.decision === "auto_approve";

    // Only a draft can be submitted, and only once.
    const { data: updated, error: updateError } = await db()
      .from("reimbursement_requests")
      .update({
        total_cents: input.totalCents,
        category: input.category,
        member_edited: memberEdited.amount || memberEdited.category,
        dedupe_key: key,
        duplicate_of: context.duplicateOf,
        review_reasons: result.reasons,
        review_group: auto ? null : result.reasons[0].code,
        decision_reason: auto ? "Within policy" : result.reasons.map((r) => r.message).join(" "),
        status: auto ? "auto_approved" : "queued",
        decided_by: auto ? "policy" : null,
        decided_at: auto ? new Date().toISOString() : null,
      })
      .eq("org_id", orgId)
      .eq("id", row.id)
      .eq("status", "submitted")
      .select("id");
    if (updateError) throw new Error(`submit: ${updateError.message}`);
    if (!updated?.length) return Response.json({ error: "already_submitted" }, { status: 409 });

    if (!auto) {
      // Open the Squads proposal the treasurer will approve (best effort:
      // it's created again on the treasurer's Approve tap if this fails).
      await ensureProposal(orgId, row.id).catch((e) => console.error("proposal:", (e as Error).message));
      return Response.json({ status: "pending" });
    }

    const payout = await payOut(orgId, row.id);
    return Response.json({
      status:
        payout === "paid"
          ? "reimbursed"
          : payout === "queued"
            ? "pending"
            : payout === "failed"
              ? "delayed"
              : "paying",
    });
  } catch (err) {
    console.error("reimburse submit failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
