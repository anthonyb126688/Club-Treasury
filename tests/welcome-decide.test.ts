import { describe, expect, it } from "vitest";
import { STALE_AFTER_MS, decideWelcome, type WelcomeRow } from "@/lib/welcome/decide";

const now = new Date("2026-11-15T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

function row(over: Partial<WelcomeRow> = {}): WelcomeRow {
  return {
    welcome_status: "pending",
    welcome_signature: null,
    welcome_claimed_at: ago(5_000),
    ...over,
  };
}

describe("decideWelcome: the $50 is paid exactly once", () => {
  it("pays a brand-new member", () => {
    expect(decideWelcome(null, now, null)).toBe("claim_new");
  });

  it("never pays a member who was already paid", () => {
    expect(decideWelcome(row({ welcome_status: "sent" }), now, null)).toBe("done");
    expect(decideWelcome(row({ welcome_status: "sent" }), now, "not_found")).toBe("done");
  });

  it("does not pay again while another attempt is in flight", () => {
    expect(decideWelcome(row(), now, null)).toBe("wait");
    expect(decideWelcome(row({ welcome_signature: "sig" }), now, "not_found")).toBe("wait");
  });

  it("does not pay again while the earlier payment is still processing, even if old", () => {
    const old = row({ welcome_signature: "sig", welcome_claimed_at: ago(STALE_AFTER_MS * 5) });
    expect(decideWelcome(old, now, "processing")).toBe("wait");
  });

  it("records an earlier payment that landed instead of paying twice", () => {
    expect(decideWelcome(row({ welcome_signature: "sig" }), now, "confirmed")).toBe("mark_sent");
    const old = row({ welcome_signature: "sig", welcome_claimed_at: ago(STALE_AFTER_MS * 5) });
    expect(decideWelcome(old, now, "confirmed")).toBe("mark_sent");
  });

  it("retries when the earlier payment failed on-chain", () => {
    expect(decideWelcome(row({ welcome_signature: "sig" }), now, "failed")).toBe("retry");
    expect(decideWelcome(row({ welcome_status: "failed" }), now, null)).toBe("retry");
  });

  it("retries a stuck attempt only after its payment can no longer land", () => {
    const fresh = row({ welcome_claimed_at: ago(STALE_AFTER_MS - 1) });
    const stale = row({ welcome_claimed_at: ago(STALE_AFTER_MS + 1) });
    expect(decideWelcome(fresh, now, "not_found")).toBe("wait");
    expect(decideWelcome(stale, now, "not_found")).toBe("retry");
    expect(decideWelcome(stale, now, null)).toBe("retry");
  });
});
