import "server-only";
import { db } from "@/lib/db";
import { rulesFrom, type BudgetPeriod, type CategoryRule, type PolicyRules } from "@/lib/policy/rules";

// A club's settings and categories, and the policy rules built from them.

export type OrgSettings = {
  duesAmountCents: number;
  duesPeriod: BudgetPeriod;
  autoApproveCapCents: number;
  dailyAutoApproveLimitCents: number;
  maxReceiptAgeDays: number;
};

export type OrgCategory = CategoryRule & { id: string; archived: boolean };

export async function loadOrgSettings(orgId: string): Promise<OrgSettings> {
  const { data, error } = await db()
    .from("org_settings")
    .select("dues_amount_cents, dues_period, auto_approve_cap_cents, daily_auto_approve_limit_cents, max_receipt_age_days")
    .eq("org_id", orgId)
    .single();
  if (error) throw new Error(`settings lookup: ${error.message}`);
  return {
    duesAmountCents: data.dues_amount_cents,
    duesPeriod: data.dues_period,
    autoApproveCapCents: data.auto_approve_cap_cents,
    dailyAutoApproveLimitCents: data.daily_auto_approve_limit_cents,
    maxReceiptAgeDays: data.max_receipt_age_days,
  };
}

/** The club's categories (active ones only, unless includeArchived). */
export async function loadOrgCategories(orgId: string, includeArchived = false): Promise<OrgCategory[]> {
  let query = db()
    .from("org_categories")
    .select("id, name, slug, budget_cents, period, archived_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(`categories lookup: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    budgetCents: c.budget_cents,
    period: c.period,
    archived: c.archived_at !== null,
  }));
}

/** Everything the policy engine needs for this club. */
export async function loadOrgRules(
  orgId: string,
): Promise<{ rules: PolicyRules; settings: OrgSettings; categories: OrgCategory[] }> {
  const [settings, categories] = await Promise.all([loadOrgSettings(orgId), loadOrgCategories(orgId)]);
  return { rules: rulesFrom(settings, categories), settings, categories };
}
