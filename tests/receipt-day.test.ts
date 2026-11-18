import { describe, expect, it } from "vitest";
import { receiptDay } from "@/lib/dashboard/format";

describe("receiptDay", () => {
  it("shows a receipt date like Nov 17, 2026", () => {
    expect(receiptDay("2026-11-17")).toBe("Nov 17, 2026");
    expect(receiptDay("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("leaves anything that isn't YYYY-MM-DD alone", () => {
    expect(receiptDay("yesterday")).toBe("yesterday");
    expect(receiptDay("2026-13-45")).toBe("2026-13-45");
  });
});
