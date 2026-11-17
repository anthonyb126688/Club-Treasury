import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "dark" | "alert" | "warn" | "income";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-black/[0.06] text-zinc-700",
  dark: "bg-ink text-white",
  alert: "bg-alert text-white",
  warn: "bg-warn/15 text-warn-text",
  income: "bg-income/12 text-income",
};

// A small pill: a status word or a count. Red only for counts that need action.
export function Badge({ tone = "neutral", children, className = "" }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap tabular-nums ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** A red count bubble for nav items (e.g. Approvals). Hidden at zero. */
export function CountBadge({ count, className = "" }: { count: number | null | undefined; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={`grid h-[18px] min-w-[18px] place-items-center rounded-full bg-alert px-1 text-[11px] leading-none font-bold text-white tabular-nums ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
