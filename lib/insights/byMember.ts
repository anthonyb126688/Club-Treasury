// Reimbursements per member for the range, with each member's dues status.
// Pure, tested in tests/insights-by-member.test.ts.
import { inRange, type InsightRange } from "./ranges";

export type PaidRow = { privy_user_id: string; total_cents: number | null; status: string; paid_at: string | null };

export type Person = {
  privy_user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type MemberSpend = {
  userId: string;
  name: string;
  totalCents: number;
  requestCount: number;
  share: number; // 0–1 of everyone's total in the range
  duesPaid: boolean;
};

/** First + last name, falling back to email, then "Member". */
export function displayName(p: Pick<Person, "first_name" | "last_name" | "email"> | undefined): string {
  if (!p) return "Member";
  const name = [p.first_name, p.last_name].filter((s) => s && s.trim()).join(" ").trim();
  return name || p.email || "Member";
}

/**
 * Paid reimbursements per active member (counted by paid_at), biggest first.
 * Every active member is listed, so the dues marker shows for everyone.
 */
export function spendingByMember(
  rows: PaidRow[],
  range: InsightRange,
  members: Person[],
  duesPayers: Set<string>,
): MemberSpend[] {
  const totals = new Map<string, { cents: number; count: number }>();
  for (const r of rows) {
    if (r.status !== "paid" || !inRange(range, r.paid_at)) continue;
    const t = totals.get(r.privy_user_id) ?? { cents: 0, count: 0 };
    t.cents += r.total_cents ?? 0;
    t.count += 1;
    totals.set(r.privy_user_id, t);
  }
  const everyone = [...totals.values()].reduce((s, t) => s + t.cents, 0);
  return members
    .map((m) => {
      const t = totals.get(m.privy_user_id) ?? { cents: 0, count: 0 };
      return {
        userId: m.privy_user_id,
        name: displayName(m),
        totalCents: t.cents,
        requestCount: t.count,
        share: everyone > 0 ? t.cents / everyone : 0,
        duesPaid: duesPayers.has(m.privy_user_id),
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name));
}
