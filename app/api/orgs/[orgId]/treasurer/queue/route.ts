import { connection } from "next/server";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import type { ReviewReason } from "@/lib/policy/decide";
import { requireTreasurer } from "@/lib/orgs/access";
import { loadOrgCategories } from "@/lib/orgs/settings";
import { categoryName, rulesFrom, DEFAULT_SETTINGS, type Category } from "@/lib/policy/rules";
import { GROUP_ORDER, GROUP_TITLES, groupFor, type GroupCode } from "@/lib/reimburse/groups";
import { photoLinks } from "@/lib/reimburse/server";
import { squadsConfigFor } from "@/lib/solana/squads";

// GET /api/orgs/:orgId/treasurer/queue: everything in THIS club waiting on
// the treasurer, grouped by reason, with receipt photos. Treasurer only.

type Row = {
  id: string;
  status: string;
  review_group: string | null;
  review_reasons: ReviewReason[];
  receipt_path: string;
  vendor: string | null;
  receipt_date: string | null;
  ai_summary: string | null;
  line_items: { description: string; amountCents: number }[];
  ai_total_cents: number | null;
  ai_category: Category | null;
  total_cents: number | null;
  category: Category | null;
  member_edited: boolean;
  duplicate_of: string | null;
  payout_error: string | null;
  created_at: string;
  member: { email: string | null } | null;
};

const SELECT =
  "id, status, review_group, review_reasons, receipt_path, vendor, receipt_date, ai_summary, line_items, ai_total_cents, ai_category, total_cents, category, member_edited, duplicate_of, payout_error, created_at, member:members(email)";

const money = (cents: number | null) => (cents === null ? "Not read" : formatCents(cents));
export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/treasurer/queue">) {
  await connection();
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const names = rulesFrom(DEFAULT_SETTINGS, await loadOrgCategories(orgId, true));
    const label = (c: Category | null) => categoryName(names, c);

    const { data, error } = await db()
      .from("reimbursement_requests")
      .select(SELECT)
      .eq("org_id", orgId)
      .in("status", ["queued", "payment_failed"])
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(`queue: ${error.message}`);
    const rows = (data ?? []) as unknown as Row[];

    // The earlier requests these might duplicate, for side-by-side photos.
    const dupeIds = [...new Set(rows.map((r) => r.duplicate_of).filter((id): id is string => !!id))];
    const originals = new Map<string, Row>();
    if (dupeIds.length) {
      const { data: d, error: dError } = await db()
        .from("reimbursement_requests")
        .select(SELECT)
        .eq("org_id", orgId)
        .in("id", dupeIds);
      if (dError) throw new Error(`originals: ${dError.message}`);
      for (const o of (d ?? []) as unknown as Row[]) originals.set(o.id, o);
    }

    const links = await photoLinks([
      ...rows.map((r) => r.receipt_path),
      ...[...originals.values()].map((o) => o.receipt_path),
    ]);

    const groups = new Map<GroupCode, unknown[]>();
    let pendingCents = 0;
    for (const r of rows) {
      pendingCents += r.total_cents ?? 0;
      const original = r.duplicate_of ? originals.get(r.duplicate_of) : undefined;
      const item = {
        id: r.id,
        status: r.status,
        memberEmail: r.member?.email ?? null,
        submittedAt: r.created_at,
        photoUrl: links.get(r.receipt_path) ?? null,
        vendor: r.vendor,
        date: r.receipt_date,
        summary: r.ai_summary,
        lineItems: r.line_items.slice(0, 15).map((li) => ({
          description: li.description,
          amount: formatCents(li.amountCents),
        })),
        amount: money(r.total_cents),
        category: label(r.category),
        ai: { amount: money(r.ai_total_cents), category: label(r.ai_category) },
        edited: {
          amount: r.member_edited && r.ai_total_cents !== r.total_cents,
          category: r.member_edited && r.ai_category !== r.category,
        },
        reasons: r.review_reasons.map((reason) => reason.message),
        payoutError: r.payout_error,
        duplicateOf: original
          ? {
              photoUrl: links.get(original.receipt_path) ?? null,
              vendor: original.vendor,
              date: original.receipt_date,
              amount: money(original.total_cents),
              status: original.status,
              memberEmail: original.member?.email ?? null,
              submittedAt: original.created_at,
            }
          : null,
      };
      const group = groupFor(r.status, r.review_group);
      groups.set(group, [...(groups.get(group) ?? []), item]);
    }

    return Response.json({
      // Approvals go through the Squads vault (the treasurer's own account
      // approves each payment) once it's set up.
      onChain: squadsConfigFor(access.org) !== null,
      pendingCount: rows.length,
      pendingTotal: formatCents(pendingCents),
      groups: GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({
        code: g,
        ...GROUP_TITLES[g],
        items: groups.get(g),
      })),
    });
  } catch (err) {
    console.error("treasurer queue failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
