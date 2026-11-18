import type { ReactNode } from "react";

export type Emphasis = "alert" | "warn" | "income";

const emphasisText: Record<Emphasis, string> = {
  alert: "text-alert",
  warn: "text-warn-text",
  income: "text-income",
};

// A glass tile with a label, a big number, and a small note under it.
// Color only when the number needs attention.
export function StatTile({
  label,
  value,
  note,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  emphasis?: Emphasis;
}) {
  // Long numbers (e.g. "$12,345.67") step down a size so they fit a half-width phone tile.
  const long = typeof value === "string" && value.length > 9;
  const size = long ? "text-[19px] sm:text-[24px]" : "text-[22px] sm:text-[26px]";
  return (
    <div className="glass flex min-w-0 flex-col rounded-[16px] p-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p
        className={`mt-1 truncate ${size} leading-tight font-bold tracking-[-0.02em] tabular-nums ${
          emphasis ? emphasisText[emphasis] : ""
        }`}
      >
        {value}
      </p>
      {note && (
        <p className={`mt-1 text-[13px] ${emphasis === "alert" || emphasis === "warn" ? emphasisText[emphasis] : "text-muted"}`}>
          {note}
        </p>
      )}
    </div>
  );
}
