"use client";

import type { ReactNode } from "react";

// iOS-style pill segmented control. Acts as a tab list.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-black/[0.06] p-0.5 [scrollbar-width:none] ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
              active ? "bg-white text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-zinc-600 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
