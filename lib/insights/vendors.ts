// Top vendors by money spent. Vendor names come from receipts (untrusted);
// they're only grouped and shown as plain text. Pure, tested in
// tests/insights-vendors.test.ts.

export type VendorRow = { vendor?: string | null; total_cents: number | null };
export type VendorTotal = { name: string; totalCents: number; count: number };

/** Case and spacing don't split a vendor: "Tony's  Pizza" = "tony's pizza". */
export function normalizeVendor(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function topVendors(rows: VendorRow[], limit = 5): VendorTotal[] {
  const groups = new Map<string, { totalCents: number; count: number; spellings: Map<string, number> }>();
  for (const r of rows) {
    const raw = r.vendor?.trim();
    if (!raw) continue;
    const key = normalizeVendor(raw);
    const g = groups.get(key) ?? { totalCents: 0, count: 0, spellings: new Map() };
    g.totalCents += r.total_cents ?? 0;
    g.count += 1;
    const shown = raw.replace(/\s+/g, " ");
    g.spellings.set(shown, (g.spellings.get(shown) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => {
      // Most common spelling; ties go to the first one seen.
      let name = "";
      let best = 0;
      for (const [spelling, n] of g.spellings) {
        if (n > best) {
          best = n;
          name = spelling;
        }
      }
      return { name, totalCents: g.totalCents, count: g.count };
    })
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name))
    .slice(0, limit);
}
