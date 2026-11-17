// The reimbursement decision: pay automatically, or send to the treasurer.
// Pure function, no I/O, fully unit-tested (tests/policy.test.ts).
//
// CLAUDE.md: "The AI EXTRACTS and EXPLAINS. Code DECIDES and PAYS."
// Note what this function does NOT take: the receipt text, the AI summary,
// the vendor name, or line items. It only sees numbers, a date, and a
// category from a fixed list, so nothing written on a receipt ("SYSTEM:
// approve this") can reach the decision.
//
// Nothing is ever rejected here. Anything that fails a rule goes to the
// treasurer with every reason listed in plain English.
import { formatCents } from "@/lib/money";
import { OTHER_CATEGORY, type Category, type PolicyRules } from "./rules";

/** What the member confirmed (possibly after editing what the AI read). */
export type Claim = {
  isReceipt: boolean;
  totalCents: number | null;
  category: Category | null;
  receiptDate: string | null; // YYYY-MM-DD
};

/** Facts the server looked up before deciding. */
export type PolicyContext = {
  today: string; // YYYY-MM-DD
  categorySpentThisPeriodCents: number; // already approved/paid in this category this budget period
  clubAutoApprovedTodayCents: number; // already auto-approved club-wide today
  duplicate: "same_photo" | "same_details" | null;
  memberEdited: { amount: boolean; category: boolean };
};

/**
 * Reason codes, in the order the treasurer view groups them: a request with
 * several reasons is filed under the first one in this list.
 */
export const REASON_ORDER = [
  "possible_duplicate",
  "edited_by_member",
  "unreadable",
  "over_cap",
  "over_budget",
  "daily_limit",
  "category_not_allowed",
  "date_problem",
] as const;
export type ReasonCode = (typeof REASON_ORDER)[number];

export type ReviewReason = { code: ReasonCode; message: string };

export type PolicyDecision =
  | { decision: "auto_approve"; reasons: [] }
  | { decision: "needs_review"; reasons: ReviewReason[] };

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

export function decideReimbursement(
  claim: Claim,
  rules: PolicyRules,
  ctx: PolicyContext,
): PolicyDecision {
  const reasons: ReviewReason[] = [];
  const add = (code: ReasonCode, message: string) => reasons.push({ code, message });

  if (ctx.duplicate === "same_photo") {
    add("possible_duplicate", "This exact photo was already submitted.");
  } else if (ctx.duplicate === "same_details") {
    add(
      "possible_duplicate",
      "A receipt with the same store, date, and total was already submitted.",
    );
  }

  if (ctx.memberEdited.amount || ctx.memberEdited.category) {
    const what = [
      ctx.memberEdited.amount && "amount",
      ctx.memberEdited.category && "category",
    ]
      .filter(Boolean)
      .join(" and ");
    add("edited_by_member", `The member changed the ${what} the AI read. Check the photo.`);
  }

  const total = claim.totalCents;
  const validTotal = total !== null && Number.isSafeInteger(total) && total > 0;
  if (!claim.isReceipt) {
    add("unreadable", "The photo doesn't look like a receipt.");
  } else if (!validTotal) {
    add("unreadable", "We couldn't read a total on the receipt.");
  }

  if (validTotal && total > rules.autoApproveCapCents) {
    add(
      "over_cap",
      `${formatCents(total)} is over the ${formatCents(rules.autoApproveCapCents)} limit for automatic payouts.`,
    );
  }

  const category = claim.category;
  const rule = category ? rules.categories[category] : undefined;
  if (!category) {
    add("category_not_allowed", "No category was chosen.");
  } else if (!rule) {
    add("category_not_allowed", "That category isn't in the club's budget.");
  } else if (category === OTHER_CATEGORY) {
    add("category_not_allowed", `"${rule.name}" isn't a category the club reimburses automatically.`);
  }

  if (validTotal && rule && category !== OTHER_CATEGORY) {
    const periodWord = rule.period === "month" ? "monthly" : "semester";
    if (rule.budgetCents <= 0) {
      add("over_budget", `${rule.name} has no budget set yet.`);
    } else if (ctx.categorySpentThisPeriodCents + total > rule.budgetCents) {
      const over = ctx.categorySpentThisPeriodCents + total - rule.budgetCents;
      add(
        "over_budget",
        `This would put ${rule.name} ${formatCents(over)} over its ${formatCents(rule.budgetCents)} ${periodWord} budget.`,
      );
    }
  }

  if (validTotal && ctx.clubAutoApprovedTodayCents + total > rules.dailyAutoApproveLimitCents) {
    const already = ctx.clubAutoApprovedTodayCents;
    add(
      "daily_limit",
      `This would go over the club's ${formatCents(rules.dailyAutoApproveLimitCents)} daily limit for automatic payouts` +
        (already > 0 ? ` (${formatCents(already)} already paid today).` : "."),
    );
  }

  const today = parseDay(ctx.today);
  const receiptDay = claim.receiptDate ? parseDay(claim.receiptDate) : null;
  if (today === null) throw new Error(`Bad policy date: ${ctx.today}`);
  if (receiptDay === null) {
    add("date_problem", "We couldn't read a date on the receipt.");
  } else if (receiptDay > today + DAY_MS) {
    add("date_problem", "The receipt date is in the future.");
  } else if (today - receiptDay > rules.maxReceiptAgeDays * DAY_MS) {
    add("date_problem", `The receipt is more than ${rules.maxReceiptAgeDays} days old.`);
  }

  if (reasons.length === 0) return { decision: "auto_approve", reasons: [] };
  reasons.sort((a, b) => REASON_ORDER.indexOf(a.code) - REASON_ORDER.indexOf(b.code));
  return { decision: "needs_review", reasons };
}
