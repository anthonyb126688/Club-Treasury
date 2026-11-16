// The shape of a receipt reading, and the checks it passes before anything
// else in the app sees it. Pure, no I/O, tested in tests/extract-schema.test.ts.
//
// Everything the AI returns is UNTRUSTED DATA: it was read off a photo that
// anyone could have written on. This file makes sure it's the right shape
// and size. It never decides anything; lib/policy/ does that.
import { z } from "zod";
import { CATEGORIES, type Category } from "@/lib/policy/rules";

/** What we ask the AI for (sent to the API as a JSON schema). */
export const AiReceiptSchema = z.object({
  is_receipt: z.boolean().describe("true only if the image is a purchase receipt or invoice"),
  vendor: z.string().nullable().describe("store or business name, as printed"),
  date: z.string().nullable().describe("purchase date as YYYY-MM-DD, or null if not visible"),
  total_cents: z
    .number()
    .int()
    .nullable()
    .describe("final amount paid, in cents (e.g. $18.40 → 1840), or null if not visible"),
  category: z.enum(CATEGORIES).describe("best fit for a student club expense"),
  line_items: z
    .array(z.object({ description: z.string(), amount_cents: z.number().int() }))
    .describe("items as printed; empty if unreadable"),
  summary: z
    .string()
    .describe("one plain sentence describing the purchase, e.g. 'Two pizzas from Domino's on Nov 14.'"),
});
export type AiReceipt = z.infer<typeof AiReceiptSchema>;

/** A checked receipt reading, safe to store and show (as plain text). */
export type ReceiptReading = {
  isReceipt: boolean;
  vendor: string | null;
  date: string | null; // YYYY-MM-DD
  totalCents: number | null;
  category: Category;
  lineItems: { description: string; amountCents: number }[];
  summary: string;
};

export const LIMITS = {
  vendor: 80,
  summary: 240,
  lineItemText: 80,
  lineItems: 40,
  maxTotalCents: 10_000_000, // $100,000: anything bigger is a misread
} as const;

/** Remove control characters and extra spaces, then cut to `max` characters. */
export function cleanText(text: string, max: number): string {
  const cleaned = text
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function cleanDate(date: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  // Reject impossible dates like 2026-02-31 (Date.parse rolls them over).
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === date ? date : null;
}

function cleanCents(cents: number | null): number | null {
  if (cents === null || !Number.isSafeInteger(cents)) return null;
  return cents > 0 && cents <= LIMITS.maxTotalCents ? cents : null;
}

/**
 * Validate whatever came back from the AI. Throws if the shape is wrong;
 * otherwise returns a cleaned, size-limited reading.
 */
export function validateReading(raw: unknown): ReceiptReading {
  const ai = AiReceiptSchema.parse(raw);
  const vendor = ai.vendor ? cleanText(ai.vendor, LIMITS.vendor) : "";
  return {
    isReceipt: ai.is_receipt,
    vendor: vendor || null,
    date: cleanDate(ai.date),
    totalCents: cleanCents(ai.total_cents),
    category: ai.category,
    lineItems: ai.line_items.slice(0, LIMITS.lineItems).map((item) => ({
      description: cleanText(item.description, LIMITS.lineItemText),
      amountCents: Number.isSafeInteger(item.amount_cents) ? item.amount_cents : 0,
    })),
    summary: cleanText(ai.summary, LIMITS.summary) || "Receipt",
  };
}
