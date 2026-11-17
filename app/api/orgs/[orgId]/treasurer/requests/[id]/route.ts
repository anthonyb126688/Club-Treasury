import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { compareAiToMember } from "@/lib/dashboard/differences";
import { formatLineItems, moneyOrNotRead, reasonMessages } from "@/lib/dashboard/format";
import { actionsFor, statusLabel } from "@/lib/dashboard/tabs";
import type { RequestDetail } from "@/lib/dashboard/types";
import { requireTreasurer } from "@/lib/orgs/access";
import { displayName } from "@/lib/orgs/orgs";
import { loadOrgCategories } from "@/lib/orgs/settings";
import { categoryName, DEFAULT_SETTINGS, rulesFrom } from "@/lib/policy/rules";
import { photoLinks } from "@/lib/reimburse/server";
import { explorerTxUrl } from "@/lib/solana/memo";

// GET /api/orgs/:orgId/treasurer/requests/:id: everything about one request
// in THIS club for the detail panel: receipt photo, what the AI read vs what
// the member confirmed, every rule it tripped, and the earlier request it
// might duplicate. Treasurer only.

type Member = { email: string | null; first_name: string | null; last_name: string | null } | null;

type Row = {
  id: string;
  status: string;
  review_group: string | null;
  review_reasons: unknown;
  receipt_path: string | null;
  vendor: string | null;
  receipt_date: string | null;
  ai_summary: string | null;
  line_items: unknown;
  ai_is_receipt: boolean | null;
  ai_total_cents: number | null;
  ai_category: string | null;
  total_cents: number | null;
  category: string | null;
  member_edited: boolean | null;
  duplicate_of: string | null;
  payout_error: string | null;
  payout_signature: string | null;
  paid_at: string | null;
  decided_at: string | null;
  denial_note: string | null;
  created_at: string;
  member: Member;
};

const SELECT =
  "id, status, review_group, review_reasons, receipt_path, vendor, receipt_date, ai_summary, line_items, ai_is_receipt, ai_total_cents, ai_category, total_cents, category, member_edited, duplicate_of, payout_error, payout_signature, paid_at, decided_at, denial_note, created_at, member:members(email, first_name, last_name)";

const Id = z.uuid();

const nameOf = (m: Member) => displayName({ firstName: m?.first_name, lastName: m?.last_name, email: m?.email });

export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/treasurer/requests/[id]">) {
  await connection();
  const { orgId, id } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    if (!Id.safeParse(id).success) return Response.json({ error: "bad_request" }, { status: 400 });
    const requests = () => db().from("reimbursement_requests");

    const [names, found] = await Promise.all([
      loadOrgCategories(orgId, true).then((c) => rulesFrom(DEFAULT_SETTINGS, c)),
      requests().select(SELECT).eq("org_id", orgId).eq("id", id).neq("status", "submitted").maybeSingle(),
    ]);
    if (found.error) throw new Error(`request: ${found.error.message}`);
    const r = found.data as unknown as Row | null;
    if (!r) return Response.json({ error: "not_found" }, { status: 404 });

    let original: Row | null = null;
    if (r.duplicate_of) {
      const { data, error } = await requests()
        .select(SELECT)
        .eq("org_id", orgId)
        .eq("id", r.duplicate_of)
        .maybeSingle();
      if (error) throw new Error(`original: ${error.message}`);
      original = data as unknown as Row | null;
    }

    const paths = [r.receipt_path, original?.receipt_path].filter((p): p is string => !!p);
    let links = new Map<string, string>();
    try {
      links = await photoLinks(paths);
    } catch (err) {
      console.error("photo links failed:", (err as Error).message);
    }
    const photo = (p: string | null | undefined) => (p ? (links.get(p) ?? null) : null);
    const label = (slug: string | null) => categoryName(names, slug);

    const body: RequestDetail = {
      id: r.id,
      status: r.status,
      statusLabel: statusLabel(r.status, r.review_group),
      memberName: nameOf(r.member),
      memberEmail: r.member?.email ?? null,
      submittedAt: r.created_at,
      photoUrl: photo(r.receipt_path),
      vendor: r.vendor,
      receiptDate: r.receipt_date,
      summary: r.ai_summary,
      lineItems: formatLineItems(r.line_items),
      looksLikeReceipt: r.ai_is_receipt,
      amount: moneyOrNotRead(r.total_cents),
      category: label(r.category),
      comparison: compareAiToMember(
        { aiTotalCents: r.ai_total_cents, totalCents: r.total_cents, aiCategory: r.ai_category, category: r.category },
        moneyOrNotRead,
        label,
      ),
      memberEdited: !!r.member_edited,
      reasons: reasonMessages(r.review_reasons),
      payoutError: r.status === "payment_failed" ? r.payout_error : null,
      denialNote: r.denial_note,
      decidedAt: r.decided_at,
      paidAt: r.paid_at,
      verifyUrl: r.status === "paid" && r.payout_signature ? explorerTxUrl(r.payout_signature) : null,
      duplicateOf: original
        ? {
            id: original.id,
            photoUrl: photo(original.receipt_path),
            vendor: original.vendor,
            date: original.receipt_date,
            amount: moneyOrNotRead(original.total_cents),
            statusLabel: statusLabel(original.status, original.review_group),
            memberName: nameOf(original.member),
            submittedAt: original.created_at,
          }
        : null,
      actions: actionsFor(r.status),
    };
    return Response.json(body);
  } catch (err) {
    console.error("treasurer request detail failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
