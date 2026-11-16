// Reimbursement policy settings (decided Nov 16). The treasurer will be able
// to edit these in a settings page later; monthly budgets live in the
// category_budgets table so that page has somewhere to save them.

export const CATEGORIES = ["food", "travel", "supplies", "events", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories the club reimburses. "other" always goes to the treasurer. */
export const ALLOWED_CATEGORIES: readonly Category[] = ["food", "travel", "supplies", "events"];

export type PolicyRules = {
  autoApproveCapCents: number; // per receipt
  dailyAutoApproveLimitCents: number; // whole club, per day
  maxReceiptAgeDays: number;
  allowedCategories: readonly Category[];
  monthlyBudgetCents: Partial<Record<Category, number>>;
};

export const DEFAULT_RULES: PolicyRules = {
  autoApproveCapCents: 5_000, // $50
  dailyAutoApproveLimitCents: 15_000, // $150
  maxReceiptAgeDays: 60,
  allowedCategories: ALLOWED_CATEGORIES,
  monthlyBudgetCents: {
    food: 20_000, // $200
    travel: 30_000, // $300
    supplies: 15_000, // $150
    events: 50_000, // $500
  },
};

export const CATEGORY_LABELS: Record<Category, string> = {
  food: "Food",
  travel: "Travel",
  supplies: "Supplies",
  events: "Events",
  other: "Other",
};
