import { describe, expect, it } from "vitest";
import { actionsFor, isTab, statusLabel, TAB_FILTERS, tabFor, TABS } from "@/lib/dashboard/tabs";

describe("tabFor", () => {
  it("puts waiting requests under Needs approval", () => {
    expect(tabFor("queued", "over_cap")).toBe("needs_approval");
    expect(tabFor("queued", "edited_by_member")).toBe("needs_approval");
    expect(tabFor("queued", null)).toBe("needs_approval");
  });

  it("puts possible duplicates and failed payouts under Blocked", () => {
    expect(tabFor("queued", "possible_duplicate")).toBe("blocked");
    expect(tabFor("payment_failed", null)).toBe("blocked");
    expect(tabFor("payment_failed", "possible_duplicate")).toBe("blocked");
  });

  it("puts paid and in-flight payouts under Paid", () => {
    expect(tabFor("paid", null)).toBe("paid");
    expect(tabFor("approved", "over_cap")).toBe("paid");
    expect(tabFor("auto_approved", null)).toBe("paid");
  });

  it("puts rejected requests under Denied", () => {
    expect(tabFor("rejected", "over_cap")).toBe("denied");
  });

  it("hides drafts and unknown statuses", () => {
    expect(tabFor("submitted", null)).toBeNull();
    expect(tabFor("something_else", null)).toBeNull();
  });
});

describe("TAB_FILTERS", () => {
  it("has a database filter for every tab", () => {
    for (const t of TABS) expect(TAB_FILTERS[t]).toBeTruthy();
  });

  it("only Needs approval and Blocked look at queued rows, split by duplicate group", () => {
    expect(TAB_FILTERS.needs_approval).toContain("review_group.neq.possible_duplicate");
    expect(TAB_FILTERS.needs_approval).toContain("review_group.is.null");
    expect(TAB_FILTERS.blocked).toContain("review_group.eq.possible_duplicate");
    expect(TAB_FILTERS.blocked).toContain("status.eq.payment_failed");
    expect(TAB_FILTERS.paid).not.toContain("queued");
    expect(TAB_FILTERS.denied).toBe("status.eq.rejected");
  });
});

describe("statusLabel / actionsFor / isTab", () => {
  it("labels rows in plain English", () => {
    expect(statusLabel("queued", "over_cap")).toBe("Waiting for you");
    expect(statusLabel("queued", "possible_duplicate")).toBe("Possible duplicate");
    expect(statusLabel("payment_failed", null)).toBe("Payout didn't go through");
    expect(statusLabel("approved", null)).toBe("On its way");
    expect(statusLabel("rejected", null)).toBe("Denied");
  });

  it("only offers approve/deny on waiting requests, retry on failed payouts", () => {
    expect(actionsFor("queued")).toEqual({ approve: true, deny: true, retry: false });
    expect(actionsFor("payment_failed")).toEqual({ approve: false, deny: false, retry: true });
    for (const s of ["paid", "rejected", "approved", "auto_approved", "submitted"]) {
      expect(actionsFor(s)).toEqual({ approve: false, deny: false, retry: false });
    }
  });

  it("only accepts known tabs", () => {
    expect(isTab("paid")).toBe(true);
    expect(isTab("everything")).toBe(false);
    expect(isTab(null)).toBe(false);
  });
});
