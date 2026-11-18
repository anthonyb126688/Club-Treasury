// Small formatting helpers shared by the dashboard API routes. Pure.
import { formatCents } from "@/lib/money";

/** "$18.00", or "Not read" when there's no amount (or it isn't whole cents). */
export function moneyOrNotRead(cents: number | null | undefined): string {
  return typeof cents === "number" && Number.isSafeInteger(cents) ? formatCents(cents) : "Not read";
}

/** Line items from the AI read (untrusted text), capped and formatted. */
export function formatLineItems(
  items: unknown,
  max = 15,
): { description: string; amount: string }[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, max).map((li) => {
    const item = (li ?? {}) as { description?: unknown; amountCents?: unknown };
    return {
      description: typeof item.description === "string" ? item.description : "",
      amount: moneyOrNotRead(typeof item.amountCents === "number" ? item.amountCents : null),
    };
  });
}

/** Plain-English rule messages from review_reasons (jsonb). */
export function reasonMessages(reasons: unknown): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .map((r) => (r && typeof r === "object" && "message" in r ? (r as { message: unknown }).message : null))
    .filter((m): m is string => typeof m === "string" && m.length > 0);
}

/** A receipt's "2026-11-17" as "Nov 17, 2026" (no time-zone shift); anything else is returned as-is. */
export function receiptDay(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
