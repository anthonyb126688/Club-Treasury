import "server-only";
import { db } from "@/lib/db";
import { loadOrgCategories } from "@/lib/orgs/settings";
import { OTHER_CATEGORY, type BudgetPeriod } from "@/lib/policy/rules";
import {
  budgetUse,
  earliestPeriodStart,
  planNewCategory,
  renameAllowed,
  spentThisPeriod,
  SPENT_STATUSES,
  type SpentRow,
} from "./categories";

// The budget builder's database side. Every query is filtered by the club's
// id; callers have already checked the person is its treasurer.

export type CategoryView = {
  id: string;
  name: string;
  slug: string;
  budgetCents: number;
  period: BudgetPeriod;
  archived: boolean;
  spentCents: number;
  remainingCents: number;
  overCents: number;
  percentUsed: number;
  alwaysReviewed: boolean; // "Other": never paid automatically
};

/** Every category (active first, then archived), with spending this period. */
export async function listCategoryBudgets(orgId: string, now: Date = new Date()): Promise<CategoryView[]> {
  const [categories, spent] = await Promise.all([
    loadOrgCategories(orgId, true),
    db()
      .from("reimbursement_requests")
      .select("category, total_cents, decided_at")
      .eq("org_id", orgId)
      .in("status", [...SPENT_STATUSES])
      .gte("decided_at", earliestPeriodStart(now)),
  ]);
  if (spent.error) throw new Error(`budget spending: ${spent.error.message}`);
  const rows = (spent.data ?? []) as SpentRow[];

  const views = categories.map((c) => {
    const use = budgetUse(c.budgetCents, spentThisPeriod(c.slug, c.period, rows, now));
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      budgetCents: c.budgetCents,
      period: c.period,
      archived: c.archived,
      ...use,
      alwaysReviewed: c.slug === OTHER_CATEGORY,
    };
  });
  return [...views.filter((v) => !v.archived), ...views.filter((v) => v.archived)];
}

export type CategoryWriteResult =
  | { status: "ok"; id: string; restored?: boolean }
  | { status: "bad_name" | "reserved" | "name_taken" | "not_found" | "cant_archive_other" };

export async function createCategory(
  orgId: string,
  input: { name: string; budgetCents: number; period: BudgetPeriod },
): Promise<CategoryWriteResult> {
  const existing = await loadOrgCategories(orgId, true);
  const plan = planNewCategory(input.name, existing);
  if (plan.kind === "error") return { status: plan.error };

  if (plan.kind === "restore") {
    const { error } = await db()
      .from("org_categories")
      .update({ name: input.name, budget_cents: input.budgetCents, period: input.period, archived_at: null })
      .eq("org_id", orgId)
      .eq("id", plan.id);
    if (error) throw new Error(`category restore: ${error.message}`);
    return { status: "ok", id: plan.id, restored: true };
  }

  const { data, error } = await db()
    .from("org_categories")
    .insert({ org_id: orgId, name: input.name, slug: plan.slug, budget_cents: input.budgetCents, period: input.period })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { status: "name_taken" }; // someone added it at the same moment
    throw new Error(`category create: ${error.message}`);
  }
  return { status: "ok", id: data.id };
}

/** Rename / change amount / change period. The slug never changes, so past requests stay linked. */
export async function updateCategory(
  orgId: string,
  id: string,
  patch: { name?: string; budgetCents?: number; period?: BudgetPeriod },
): Promise<CategoryWriteResult> {
  const existing = await loadOrgCategories(orgId, true);
  const target = existing.find((c) => c.id === id);
  if (!target || target.archived) return { status: "not_found" };
  if (patch.name !== undefined && !renameAllowed(id, patch.name, existing)) return { status: "name_taken" };

  const cols: Record<string, unknown> = {};
  if (patch.name !== undefined) cols.name = patch.name;
  if (patch.budgetCents !== undefined) cols.budget_cents = patch.budgetCents;
  if (patch.period !== undefined) cols.period = patch.period;
  const { error } = await db().from("org_categories").update(cols).eq("org_id", orgId).eq("id", id);
  if (error) throw new Error(`category update: ${error.message}`);
  return { status: "ok", id };
}

/** Archive (never delete): past requests keep their category. "Other" stays. */
export async function archiveCategory(orgId: string, id: string): Promise<CategoryWriteResult> {
  const { data: target, error: findError } = await db()
    .from("org_categories")
    .select("id, slug, archived_at")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (findError) throw new Error(`category lookup: ${findError.message}`);
  if (!target) return { status: "not_found" };
  if (target.slug === OTHER_CATEGORY) return { status: "cant_archive_other" };
  if (target.archived_at) return { status: "ok", id };

  const { error } = await db()
    .from("org_categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw new Error(`category archive: ${error.message}`);
  return { status: "ok", id };
}
