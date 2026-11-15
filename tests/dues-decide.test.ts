import { describe, expect, it } from "vitest";
import { DUES_STALE_AFTER_MS, decideDues, type DuesRow } from "@/lib/dues/decide";

const now = new Date("2026-11-15T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

function row(over: Partial<DuesRow> = {}): DuesRow {
  return {
    status: "pending",
    signature: "sig",
    pending_tx: "tx",
    claimed_at: ago(5_000),
    ...over,
  };
}

describe("decideDues: $25 once per term, never charged twice", () => {
  it("lets a member who hasn't paid this term start paying", () => {
    expect(decideDues(null, now, null)).toBe("claim_new");
  });

  it("never charges a member who already paid this term", () => {
    expect(decideDues(row({ status: "sent" }), now, null)).toBe("paid");
    expect(decideDues(row({ status: "sent" }), now, "not_found")).toBe("paid");
  });

  it("hands back the same prepared payment on a refresh or double tap", () => {
    expect(decideDues(row(), now, "not_found")).toBe("resume");
  });

  it("doesn't start a second payment while one is processing", () => {
    expect(decideDues(row(), now, "processing")).toBe("wait");
    expect(decideDues(row({ claimed_at: ago(DUES_STALE_AFTER_MS * 5) }), now, "processing")).toBe(
      "wait",
    );
    expect(decideDues(row({ pending_tx: null, signature: null }), now, null)).toBe("wait");
  });

  it("records a payment that landed instead of charging again", () => {
    expect(decideDues(row(), now, "confirmed")).toBe("mark_paid");
    expect(decideDues(row({ claimed_at: ago(DUES_STALE_AFTER_MS * 5) }), now, "confirmed")).toBe(
      "mark_paid",
    );
  });

  it("starts over when the earlier payment failed", () => {
    expect(decideDues(row(), now, "failed")).toBe("retry");
    expect(decideDues(row({ status: "failed" }), now, null)).toBe("retry");
  });

  it("starts over only once the earlier payment can no longer land", () => {
    expect(decideDues(row({ claimed_at: ago(DUES_STALE_AFTER_MS - 1) }), now, "not_found")).toBe(
      "resume",
    );
    expect(decideDues(row({ claimed_at: ago(DUES_STALE_AFTER_MS + 1) }), now, "not_found")).toBe(
      "retry",
    );
  });
});
