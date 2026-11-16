import { describe, expect, it } from "vitest";
import { shortAddress, toLedgerItem, verifyUrl, type LedgerRow } from "@/lib/ledger/view";

const ADDRESS = "7xKpAbCdEfGhJkLmNpQrStUvWxYz123456789A3fQa";

const duesRow: LedgerRow = {
  id: "1",
  direction: "in",
  kind: "dues",
  amount_cents: 2500,
  description: "Dues for Fall 2026",
  signature: "5sig",
  created_at: "2026-11-16T12:00:00Z",
  member: { email: "member@example.com", solana_address: ADDRESS },
};

describe("toLedgerItem", () => {
  it("shows only a short address to the public, never the email", () => {
    const item = toLedgerItem(duesRow, false);
    expect(item.who).toBe("7xKp…3fQa");
    expect(JSON.stringify(item)).not.toContain("member@example.com");
  });

  it("shows the email to the treasurer", () => {
    expect(toLedgerItem(duesRow, true).who).toBe("member@example.com");
  });

  it("falls back to the short address if the treasurer views a member with no email", () => {
    const row = { ...duesRow, member: { email: null, solana_address: ADDRESS } };
    expect(toLedgerItem(row, true).who).toBe("7xKp…3fQa");
  });

  it("shows no one for club deposits", () => {
    const deposit: LedgerRow = { ...duesRow, kind: "deposit", member: null };
    expect(toLedgerItem(deposit, true).who).toBeNull();
  });

  it("formats the amount in dollars", () => {
    expect(toLedgerItem(duesRow, false).amount).toBe("$25.00");
  });
});

describe("shortAddress", () => {
  it("keeps the first and last 4 characters", () => {
    expect(shortAddress(ADDRESS)).toBe("7xKp…3fQa");
  });
});

describe("verifyUrl", () => {
  it("always points at devnet", () => {
    expect(verifyUrl("5sig")).toBe("https://explorer.solana.com/tx/5sig?cluster=devnet");
  });
});
