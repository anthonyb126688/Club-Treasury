"use client";

import { useState } from "react";
import { ChartEmpty, DataTable, GRAYS, TONE_COLOR, type Tone } from "./common";

export type Slice = { key: string; label: string; value: number; valueText: string; tone?: Tone; note?: string };

// A donut in black and grays with the total in the middle and a legend.
// A slice that needs attention is orange (ahead of pace) or red (over budget).
export function Donut({
  slices,
  totalText,
  totalLabel = "Total",
  ariaLabel,
  emptyText,
}: {
  slices: Slice[];
  totalText: string;
  totalLabel?: string;
  ariaLabel: string;
  emptyText: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <ChartEmpty text={emptyText} />;

  const size = 160;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Where each slice starts along the ring.
  const lengths = slices.map((s) => (s.value / total) * c);
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  const color = (s: Slice, i: number) => (s.tone && s.tone !== "normal" ? TONE_COLOR[s.tone] : GRAYS[i % GRAYS.length]);
  const shown = active !== null ? slices[active] : null;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} className="-rotate-90">
          {slices.map((s, i) => {
            const len = lengths[i];
            return (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={color(s, i)}
                strokeWidth={active === i ? stroke + 4 : stroke}
                strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
                strokeDashoffset={-starts[i]}
                tabIndex={0}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onClick={() => setActive(active === i ? null : i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="cursor-pointer outline-none"
                style={{ transition: "stroke-dasharray 300ms ease-out, stroke-dashoffset 300ms ease-out" }}
              />
            );
          })}
        </svg>
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[12px] text-muted">{shown ? shown.label : totalLabel}</p>
            <p className="text-[17px] font-bold tabular-nums">{shown ? shown.valueText : totalText}</p>
          </div>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-1.5">
        {slices.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 text-[13px]">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color(s, i) }} />
            <span className="min-w-0 flex-1 truncate">
              {s.label}
              {s.note && (
                <span className={s.tone === "alert" ? "text-alert" : s.tone === "warn" ? "text-warn-text" : "text-muted"}>
                  {" "}
                  · {s.note}
                </span>
              )}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{s.valueText}</span>
          </li>
        ))}
      </ul>
      <DataTable caption={ariaLabel} head={["Category", "Spent"]} rows={slices.map((s) => [s.label, s.valueText])} />
    </div>
  );
}
