// Combine what the AI read with what the member confirmed, into the claim
// the policy engine checks. Pure and tested (tests/extract-schema.test.ts).
import type { Claim } from "@/lib/policy/decide";
import type { Category } from "@/lib/policy/rules";
import type { ReceiptReading } from "./schema";

/** What the member submits on the confirm screen. */
export type MemberConfirmation = { totalCents: number; category: Category };

export function buildClaim(
  ai: ReceiptReading,
  member: MemberConfirmation,
): { claim: Claim; memberEdited: { amount: boolean; category: boolean } } {
  return {
    claim: {
      isReceipt: ai.isReceipt,
      totalCents: member.totalCents,
      category: member.category,
      receiptDate: ai.date,
    },
    memberEdited: {
      amount: member.totalCents !== ai.totalCents,
      category: member.category !== ai.category,
    },
  };
}

/** Normalized store|date|total, to spot a new photo of an old receipt. */
export function dedupeKey(vendor: string | null, date: string | null, totalCents: number): string | null {
  if (!vendor || !date) return null;
  const store = vendor.toLowerCase().replace(/[^a-z0-9]/g, "");
  return store ? `${store}|${date}|${totalCents}` : null;
}
