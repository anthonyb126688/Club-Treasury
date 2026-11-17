// CSV files for the Insights export. Pure, tested in tests/insights-csv.test.ts.
//
// Vendor names and descriptions come from receipts and are UNTRUSTED: a cell
// starting with = + - @ (or a tab / carriage return) could run as a formula
// when opened in a spreadsheet, so it gets a leading apostrophe.

export type Cell = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell: formula-safe and quoted when needed. */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** A whole file: header row first, Windows line endings, and a UTF-8 BOM so Excel reads it right. */
export function toCsv(header: string[], rows: Cell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** "Chess Club @ UBC!" → "chess-club-ubc", for file names. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "club";
}
