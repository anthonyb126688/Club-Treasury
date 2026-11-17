import { describe, expect, it } from "vitest";
import { csvCell, slugify, toCsv } from "@/lib/insights/csv";

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(true)).toBe("Yes");
  });

  it("stops spreadsheet formulas from untrusted vendor names", () => {
    expect(csvCell('=HYPERLINK("http://evil.example","Click me")')).toBe(
      '"\'=HYPERLINK(""http://evil.example"",""Click me"")"',
    );
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("\rcmd")).toBe('"\'\rcmd"');
  });

  it("leaves dollar amounts and dates alone", () => {
    expect(csvCell("$18.00")).toBe("$18.00");
    expect(csvCell("2026-11-17")).toBe("2026-11-17");
  });
});

describe("toCsv", () => {
  it("starts with a UTF-8 BOM and uses CRLF", () => {
    const csv = toCsv(["Vendor", "Amount"], [["=HYPERLINK(1)", "$5.00"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿Vendor,Amount\r\n'=HYPERLINK(1),$5.00\r\n");
  });
});

describe("slugify", () => {
  it("makes file-name-safe club names", () => {
    expect(slugify("Chess Club @ UBC!")).toBe("chess-club-ubc");
    expect(slugify("!!!")).toBe("club");
  });
});
