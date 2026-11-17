import { describe, expect, it } from "vitest";
import { displayName, spendingByMember, type PaidRow, type Person } from "@/lib/insights/byMember";
import { rangeFor } from "@/lib/insights/ranges";

const NOW = new Date("2026-11-17T18:00:00Z");

const people: Person[] = [
  { privy_user_id: "a", first_name: "Ana", last_name: "Lee", email: "ana@x.edu" },
  { privy_user_id: "b", first_name: null, last_name: null, email: "bo@x.edu" },
  { privy_user_id: "c", first_name: "Cy", last_name: null, email: null },
];

const rows: PaidRow[] = [
  { privy_user_id: "a", total_cents: 1800, status: "paid", paid_at: "2026-11-10T18:00:00Z" },
  { privy_user_id: "a", total_cents: 1200, status: "paid", paid_at: "2026-11-11T18:00:00Z" },
  { privy_user_id: "b", total_cents: 7000, status: "paid", paid_at: "2026-11-12T18:00:00Z" },
  { privy_user_id: "b", total_cents: 9999, status: "approved", paid_at: null }, // not paid yet
  { privy_user_id: "c", total_cents: 500, status: "paid", paid_at: "2026-09-01T18:00:00Z" }, // outside the month
];

describe("displayName", () => {
  it("uses first + last name, then email", () => {
    expect(displayName(people[0])).toBe("Ana Lee");
    expect(displayName(people[1])).toBe("bo@x.edu");
    expect(displayName(people[2])).toBe("Cy");
    expect(displayName(undefined)).toBe("Member");
  });
});

describe("spendingByMember", () => {
  it("totals paid reimbursements in the range, high to low, with dues status", () => {
    const result = spendingByMember(rows, rangeFor("month", NOW), people, new Set(["a"]));
    expect(result.map((r) => [r.name, r.totalCents, r.requestCount, r.duesPaid])).toEqual([
      ["bo@x.edu", 7000, 1, false],
      ["Ana Lee", 3000, 2, true],
      ["Cy", 0, 0, false],
    ]);
    expect(result[0].share).toBeCloseTo(0.7);
    expect(result[2].share).toBe(0);
  });
});
