import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from "@/lib/policy/rules";
import { makeJoinCode } from "./join-code";
import type { Person } from "./orgs";
import { createClubVault } from "./vault";

/**
 * Create a club: the creator becomes its treasurer, it gets default
 * settings and categories, and its own Squads vault. Returns the club's id
 * and whether the vault is ready (it can be retried with createClubVault).
 */
export async function createClub(
  creator: Person,
  input: { name: string; school: string },
): Promise<{ orgId: string; vault: "ready" | "failed" }> {
  const name = input.name.trim().slice(0, 80);
  const school = input.school.trim().slice(0, 80);

  // A fresh join code; retry on the rare clash with an existing one.
  let orgId: string | null = null;
  for (let attempt = 0; attempt < 5 && !orgId; attempt++) {
    const { data, error } = await db()
      .from("orgs")
      .insert({ name, school, join_code: makeJoinCode(name), created_by: creator.userId })
      .select("id")
      .single();
    if (!error) orgId = data.id;
    else if (!error.message.includes("join_code")) throw new Error(`club insert: ${error.message}`);
  }
  if (!orgId) throw new Error("Couldn't pick a unique join code");

  const settings = await db().from("org_settings").insert({
    org_id: orgId,
    dues_amount_cents: DEFAULT_SETTINGS.duesAmountCents,
    dues_period: DEFAULT_SETTINGS.duesPeriod,
    auto_approve_cap_cents: DEFAULT_SETTINGS.autoApproveCapCents,
    daily_auto_approve_limit_cents: DEFAULT_SETTINGS.dailyAutoApproveLimitCents,
    max_receipt_age_days: DEFAULT_SETTINGS.maxReceiptAgeDays,
  });
  if (settings.error) throw new Error(`settings insert: ${settings.error.message}`);

  const categories = await db()
    .from("org_categories")
    .insert(
      DEFAULT_CATEGORIES.map((c) => ({
        org_id: orgId,
        name: c.name,
        slug: c.slug,
        budget_cents: c.budgetCents,
        period: c.period,
      })),
    );
  if (categories.error) throw new Error(`categories insert: ${categories.error.message}`);

  const membership = await db().from("org_memberships").insert({
    org_id: orgId,
    privy_user_id: creator.userId,
    role: "treasurer",
    status: "active",
    approved_at: new Date().toISOString(),
  });
  if (membership.error) throw new Error(`membership insert: ${membership.error.message}`);
  await db().from("members").update({ last_org_id: orgId }).eq("privy_user_id", creator.userId);

  const vault = await createClubVault(orgId, creator.solanaAddress, DEFAULT_SETTINGS.dailyAutoApproveLimitCents);
  return { orgId, vault };
}
