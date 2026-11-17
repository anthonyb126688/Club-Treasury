import { describe, expect, it } from "vitest";
import { compareAiToMember } from "@/lib/dashboard/differences";
import { formatLineItems, moneyOrNotRead, reasonMessages } from "@/lib/dashboard/format";

const label = (slug: string | null) => (slug ? slug.toUpperCase() : "None");

describe("compareAiToMember", () => {
  it("flags nothing when the member kept what the AI read", () => {
    const rows = compareAiToMember(
      { aiTotalCents: 1800, totalCents: 1800, aiCategory: "food", category: "food" },
      moneyOrNotRead,
      label,
    );
    expect(rows.map((r) => r.changed)).toEqual([false, false]);
    expect(rows[0]).toMatchObject({ ai: "$18.00", member: "$18.00" });
  });

  it("flags a changed amount and category", () => {
    const [amount, category] = compareAiToMember(
      { aiTotalCents: 1800, totalCents: 4500, aiCategory: "food", category: "events" },
      moneyOrNotRead,
      label,
    );
    expect(amount).toMatchObject({ changed: true, ai: "$18.00", member: "$45.00" });
    expect(category).toMatchObject({ changed: true, ai: "FOOD", member: "EVENTS" });
  });

  it("flags an amount the AI couldn't read but the member typed", () => {
    const [amount, category] = compareAiToMember(
      { aiTotalCents: null, totalCents: 2000, aiCategory: null, category: null },
      moneyOrNotRead,
      label,
    );
    expect(amount).toMatchObject({ changed: true, ai: "Not read", member: "$20.00" });
    expect(category.changed).toBe(false);
  });
});

describe("format helpers", () => {
  it("formats money safely", () => {
    expect(moneyOrNotRead(40_000)).toBe("$400.00");
    expect(moneyOrNotRead(null)).toBe("Not read");
    expect(moneyOrNotRead(1.5)).toBe("Not read");
  });

  it("keeps line item text as-is (shown as plain text) and caps the list", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ description: `<b>item ${i}</b>`, amountCents: 100 }));
    const out = formatLineItems(items);
    expect(out).toHaveLength(15);
    expect(out[0]).toEqual({ description: "<b>item 0</b>", amount: "$1.00" });
    expect(formatLineItems("nope")).toEqual([]);
  });

  it("reads rule messages and skips junk", () => {
    expect(reasonMessages([{ code: "over_cap", message: "Over $50." }, { code: "x" }, null])).toEqual(["Over $50."]);
    expect(reasonMessages(null)).toEqual([]);
  });
});
