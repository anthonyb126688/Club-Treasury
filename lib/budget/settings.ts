// Club settings rules: allowed values and the plain-English preview the
// treasurer sees. Pure, tested in tests/settings.test.ts.
import { z } from "zod";
import { formatCents } from "@/lib/money";
import { perPeriod } from "@/lib/dues/period";
import type { BudgetPeriod } from "@/lib/policy/rules";

export const MAX_DUES_CENTS = 1_000_000; // $10,000
export const MAX_AUTO_APPROVE_CAP_CENTS = 1_000_000; // $10,000 per receipt
export const MAX_DAILY_LIMIT_CENTS = 10_000_000; // $100,000 a day
export const MAX_RECEIPT_AGE_DAYS = 365;

/** PATCH /settings body. The daily limit is NOT here: it changes on-chain (daily-limit/prepare). */
export const SettingsPatchBody = z
  .object({
    duesAmountCents: z.number().int().min(1).max(MAX_DUES_CENTS).optional(),
    duesPeriod: z.enum(["semester", "month"]).optional(),
    autoApproveCapCents: z.number().int().min(0).max(MAX_AUTO_APPROVE_CAP_CENTS).optional(),
    maxReceiptAgeDays: z.number().int().min(1).max(MAX_RECEIPT_AGE_DAYS).optional(),
  })
  .strict();
export type SettingsPatch = z.infer<typeof SettingsPatchBody>;

export const DailyLimitBody = z.object({ cents: z.number().int().min(0).max(MAX_DAILY_LIMIT_CENTS) });

/** The org_settings columns to write for a patch (only what was sent). */
export function settingsColumns(patch: SettingsPatch): Record<string, number | string> {
  const cols: Record<string, number | string> = {};
  if (patch.duesAmountCents !== undefined) cols.dues_amount_cents = patch.duesAmountCents;
  if (patch.duesPeriod !== undefined) cols.dues_period = patch.duesPeriod;
  if (patch.autoApproveCapCents !== undefined) cols.auto_approve_cap_cents = patch.autoApproveCapCents;
  if (patch.maxReceiptAgeDays !== undefined) cols.max_receipt_age_days = patch.maxReceiptAgeDays;
  return cols;
}

export type PreviewSettings = {
  duesAmountCents: number;
  duesPeriod: BudgetPeriod;
  autoApproveCapCents: number;
  dailyAutoApproveLimitCents: number;
  maxReceiptAgeDays: number;
};

/** "What these settings mean", one sentence per rule. */
export function settingsPreview(s: PreviewSettings): string[] {
  const days = s.maxReceiptAgeDays === 1 ? "1 day" : `${s.maxReceiptAgeDays} days`;
  return [
    s.autoApproveCapCents > 0
      ? `Receipts up to ${formatCents(s.autoApproveCapCents)} are paid instantly.`
      : "No receipt is paid instantly: the treasurer reviews every one.",
    s.dailyAutoApproveLimitCents > 0
      ? `The club pays out at most ${formatCents(s.dailyAutoApproveLimitCents)} a day automatically.`
      : "The club never pays out automatically.",
    `Receipts older than ${days} go to the treasurer.`,
    `Dues are ${formatCents(s.duesAmountCents)} ${perPeriod(s.duesPeriod)}.`,
  ];
}

/**
 * Turn what someone typed ("25", "$1,250.5") into whole cents, or null if it
 * isn't a dollar amount. Used by the settings and budget forms.
 */
export function parseDollars(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Cents → "25" or "12.50", for filling an input box. */
export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
