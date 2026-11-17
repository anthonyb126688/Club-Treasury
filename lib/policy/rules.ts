// Reimbursement policy settings. Each club has its own (org_settings +
// org_categories, loaded by lib/orgs/settings.ts). DEFAULT_RULES is what a
// new club starts with, and what tests use.

/** A category's id within its club (e.g. "food"). Clubs can add their own. */
export type Category = string;

export type BudgetPeriod = "month" | "semester";

export type CategoryRule = {
  slug: Category;
  name: string; // shown to people, e.g. "Food"
  budgetCents: number; // per period
  period: BudgetPeriod;
};

/** The catch-all category: always allowed to submit, never paid automatically. */
export const OTHER_CATEGORY = "other";

export type PolicyRules = {
  autoApproveCapCents: number; // per receipt
  dailyAutoApproveLimitCents: number; // whole club, per day
  maxReceiptAgeDays: number;
  /** The club's active categories, by slug. Anything not listed can't be auto-paid. */
  categories: Record<Category, CategoryRule>;
};

export const DEFAULT_CATEGORIES: CategoryRule[] = [
  { slug: "food", name: "Food", budgetCents: 20_000, period: "month" },
  { slug: "travel", name: "Travel", budgetCents: 30_000, period: "month" },
  { slug: "supplies", name: "Supplies", budgetCents: 15_000, period: "month" },
  { slug: "events", name: "Events", budgetCents: 50_000, period: "month" },
  { slug: OTHER_CATEGORY, name: "Other", budgetCents: 0, period: "month" },
];

export const DEFAULT_SETTINGS = {
  duesAmountCents: 2_500, // $25
  duesPeriod: "semester" as BudgetPeriod,
  autoApproveCapCents: 5_000, // $50
  dailyAutoApproveLimitCents: 15_000, // $150
  maxReceiptAgeDays: 60,
};

export function rulesFrom(
  settings: Pick<typeof DEFAULT_SETTINGS, "autoApproveCapCents" | "dailyAutoApproveLimitCents" | "maxReceiptAgeDays">,
  categories: CategoryRule[],
): PolicyRules {
  return {
    autoApproveCapCents: settings.autoApproveCapCents,
    dailyAutoApproveLimitCents: settings.dailyAutoApproveLimitCents,
    maxReceiptAgeDays: settings.maxReceiptAgeDays,
    categories: Object.fromEntries(categories.map((c) => [c.slug, c])),
  };
}

export const DEFAULT_RULES: PolicyRules = rulesFrom(DEFAULT_SETTINGS, DEFAULT_CATEGORIES);

/** "Food", or a readable fallback for a category the club no longer has. */
export function categoryName(rules: Pick<PolicyRules, "categories">, slug: Category | null): string {
  if (!slug) return "None";
  return rules.categories[slug]?.name ?? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

/** Turn a category name into a slug: "Club T-shirts" → "club-t-shirts". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
