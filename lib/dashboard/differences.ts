// What the AI read off a receipt vs what the member confirmed, for the
// treasurer's detail panel. Pure, tested in tests/dashboard-differences.test.ts.

export type Comparison = {
  field: "amount" | "category";
  label: string;
  ai: string;
  member: string;
  changed: boolean;
};

export type ReadVsConfirmed = {
  aiTotalCents: number | null;
  totalCents: number | null;
  aiCategory: string | null;
  category: string | null;
};

/**
 * One row per field. `changed` compares the actual values (not just the
 * member_edited flag), so a member who edited and then put it back isn't
 * flagged, and an AI that read nothing is.
 */
export function compareAiToMember(
  r: ReadVsConfirmed,
  money: (cents: number | null) => string,
  categoryLabel: (slug: string | null) => string,
): Comparison[] {
  return [
    {
      field: "amount",
      label: "Amount",
      ai: money(r.aiTotalCents),
      member: money(r.totalCents),
      changed: r.aiTotalCents !== r.totalCents,
    },
    {
      field: "category",
      label: "Category",
      ai: categoryLabel(r.aiCategory),
      member: categoryLabel(r.category),
      changed: (r.aiCategory ?? null) !== (r.category ?? null),
    },
  ];
}
