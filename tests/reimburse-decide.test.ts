import { describe, expect, it } from "vitest";
import {
  decidePayout,
  memberStatus,
  parseDollarsToCents,
  type PayoutRow,
} from "@/lib/reimburse/decide";

const now = new Date("2026-11-16T12:00:00Z");
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000).toISOString();

const fresh: PayoutRow = { status: "auto_approved", payout_signature: null, payout_claimed_at: null };

describe("decidePayout", () => {
  it("sends a newly approved request", () => {
    expect(decidePayout(fresh, now, null)).toBe("send");
    expect(decidePayout({ ...fresh, status: "approved" }, now, null)).toBe("send");
  });

  it.each(["submitted", "queued", "rejected"] as const)("never pays a %s request", (status) => {
    expect(decidePayout({ ...fresh, status }, now, null)).toBe("not_payable");
  });

  it("never pays twice", () => {
    expect(decidePayout({ ...fresh, status: "paid" }, now, "confirmed")).toBe("done");
  });

  it("records a payout that landed", () => {
    const row = { ...fresh, payout_signature: "sig", payout_claimed_at: secondsAgo(10) };
    expect(decidePayout(row, now, "confirmed")).toBe("mark_paid");
  });

  it("records a payout that landed even after it was marked failed", () => {
    const row: PayoutRow = { status: "payment_failed", payout_signature: "sig", payout_claimed_at: secondsAgo(500) };
    expect(decidePayout(row, now, "confirmed")).toBe("mark_paid");
  });

  it("waits while a payout is in flight", () => {
    const row = { ...fresh, payout_signature: "sig", payout_claimed_at: secondsAgo(10) };
    expect(decidePayout(row, now, "processing")).toBe("wait");
    expect(decidePayout(row, now, "not_found")).toBe("wait");
  });

  it("waits while another request is preparing the payout", () => {
    expect(decidePayout({ ...fresh, payout_claimed_at: secondsAgo(5) }, now, null)).toBe("wait");
  });

  it("retries once an unsent payout has expired", () => {
    const row = { ...fresh, payout_signature: "sig", payout_claimed_at: secondsAgo(180) };
    expect(decidePayout(row, now, "not_found")).toBe("send");
    expect(decidePayout({ ...fresh, payout_claimed_at: secondsAgo(180) }, now, null)).toBe("send");
  });

  it("retries a payout that failed on-chain", () => {
    const row = { ...fresh, payout_signature: "sig", payout_claimed_at: secondsAgo(10) };
    expect(decidePayout(row, now, "failed")).toBe("send");
  });
});

describe("memberStatus", () => {
  it("hides drafts and maps the rest", () => {
    expect(memberStatus("submitted")).toBeNull();
    expect(memberStatus("queued")).toBe("pending");
    expect(memberStatus("paid")).toBe("reimbursed");
    expect(memberStatus("approved")).toBe("paying");
    expect(memberStatus("rejected")).toBe("not_approved");
  });
});

describe("parseDollarsToCents", () => {
  it.each([
    ["18", 1800],
    ["18.5", 1850],
    ["$17.91", 1791],
    ["1,234.56", 123_456],
    [" 0.99 ", 99],
  ])("%j → %d", (input, cents) => {
    expect(parseDollarsToCents(input)).toBe(cents);
  });

  it.each(["", "0", "abc", "-5", "1.999", "1e5", "12.3.4", "9999999"])("rejects %j", (input) => {
    expect(parseDollarsToCents(input)).toBeNull();
  });
});
