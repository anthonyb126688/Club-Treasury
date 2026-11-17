import { describe, expect, it } from "vitest";
import {
  centsToInput,
  DailyLimitBody,
  parseDollars,
  settingsColumns,
  SettingsPatchBody,
  settingsPreview,
} from "@/lib/budget/settings";
import { DEFAULT_SETTINGS } from "@/lib/policy/rules";

describe("settingsPreview", () => {
  it("describes the default settings in plain English", () => {
    expect(settingsPreview(DEFAULT_SETTINGS)).toEqual([
      "Receipts up to $50.00 are paid instantly.",
      "The club pays out at most $150.00 a day automatically.",
      "Receipts older than 60 days go to the treasurer.",
      "Dues are $25.00 per semester.",
    ]);
  });

  it("updates for new values, including zeros", () => {
    const lines = settingsPreview({
      duesAmountCents: 1_050,
      duesPeriod: "month",
      autoApproveCapCents: 0,
      dailyAutoApproveLimitCents: 0,
      maxReceiptAgeDays: 1,
    });
    expect(lines).toEqual([
      "No receipt is paid instantly: the treasurer reviews every one.",
      "The club never pays out automatically.",
      "Receipts older than 1 day go to the treasurer.",
      "Dues are $10.50 per month.",
    ]);
  });

  it("never uses crypto words", () => {
    const text = settingsPreview(DEFAULT_SETTINGS).join(" ");
    expect(text).not.toMatch(/wallet|\bSOL\b|gas|sign|transaction|USDC/i);
  });
});

describe("SettingsPatchBody", () => {
  it("accepts any subset of the editable settings", () => {
    expect(SettingsPatchBody.parse({})).toEqual({});
    expect(SettingsPatchBody.parse({ autoApproveCapCents: 2_000 })).toEqual({ autoApproveCapCents: 2_000 });
    expect(
      SettingsPatchBody.parse({ duesAmountCents: 2_500, duesPeriod: "month", autoApproveCapCents: 0, maxReceiptAgeDays: 365 }),
    ).toBeTruthy();
  });

  it("does not let the daily limit be changed here (it's on-chain)", () => {
    expect(SettingsPatchBody.safeParse({ dailyAutoApproveLimitCents: 100 }).success).toBe(false);
  });

  it("rejects bad values", () => {
    const bad = [
      { duesAmountCents: 0 },
      { duesAmountCents: 12.5 },
      { duesAmountCents: 1_000_001 },
      { duesPeriod: "year" },
      { autoApproveCapCents: -1 },
      { autoApproveCapCents: "50" },
      { maxReceiptAgeDays: 0 },
      { maxReceiptAgeDays: 366 },
    ];
    for (const b of bad) expect(SettingsPatchBody.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });

  it("maps to org_settings columns, only what was sent", () => {
    expect(settingsColumns({ autoApproveCapCents: 2_000, duesPeriod: "month" })).toEqual({
      auto_approve_cap_cents: 2_000,
      dues_period: "month",
    });
    expect(settingsColumns({})).toEqual({});
  });
});

describe("DailyLimitBody", () => {
  it("takes whole cents from $0 to $100,000", () => {
    expect(DailyLimitBody.safeParse({ cents: 15_000 }).success).toBe(true);
    expect(DailyLimitBody.safeParse({ cents: 0 }).success).toBe(true);
    expect(DailyLimitBody.safeParse({ cents: 10_000_001 }).success).toBe(false);
    expect(DailyLimitBody.safeParse({ cents: 1.5 }).success).toBe(false);
    expect(DailyLimitBody.safeParse({ cents: -100 }).success).toBe(false);
  });
});

describe("parseDollars / centsToInput", () => {
  it("reads what people type", () => {
    expect(parseDollars("25")).toBe(2_500);
    expect(parseDollars("$1,250.5")).toBe(125_050);
    expect(parseDollars(" 0.99 ")).toBe(99);
    expect(parseDollars("20.")).toBe(2_000);
    expect(parseDollars("0")).toBe(0);
  });

  it("rejects anything that isn't a dollar amount", () => {
    for (const s of ["", "abc", "-5", "1.234", "1e3", "$", "12.5.0"]) expect(parseDollars(s), s).toBeNull();
  });

  it("round-trips for the input box", () => {
    expect(centsToInput(5_000)).toBe("50");
    expect(centsToInput(1_050)).toBe("10.50");
    expect(parseDollars(centsToInput(123_456))).toBe(123_456);
  });
});
