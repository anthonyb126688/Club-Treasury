"use client";

import { useState } from "react";
import { ChartEmpty, DataTable, growStyle, Tooltip } from "./common";

export type Bar = { key: string; label: string; value: number; valueText: string; partial?: boolean };

const W = 320;
const H = 150;
const PAD_B = 22; // room for month labels
const PAD_T = 8;

// Black bars per month with an optional dashed gray budget line. The
// current, unfinished month is lighter. Tap or hover a bar for its value.
export function BarChart({
  bars,
  budget,
  ariaLabel,
  emptyText,
}: {
  bars: Bar[];
  budget?: { value: number; text: string } | null;
  ariaLabel: string;
  emptyText: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (bars.length === 0 || bars.every((b) => b.value === 0)) return <ChartEmpty text={emptyText} />;

  const max = Math.max(1, ...bars.map((b) => b.value), budget?.value ?? 0);
  const plotH = H - PAD_B - PAD_T;
  const slot = W / bars.length;
  const barW = Math.min(36, slot * 0.6);
  const y = (v: number) => PAD_T + plotH * (1 - v / max);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="block h-auto w-full overflow-visible"
        onPointerLeave={() => setActive(null)}
      >
        <line x1={0} x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="rgb(0 0 0 / 0.1)" />
        {bars.map((b, i) => {
          const x = i * slot + (slot - barW) / 2;
          return (
            <g
              key={b.key}
              tabIndex={0}
              onPointerEnter={() => setActive(i)}
              onClick={() => setActive(active === i ? null : i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="cursor-pointer outline-none"
            >
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              <rect
                x={x}
                y={PAD_T}
                width={barW}
                height={plotH}
                rx={5}
                fill={b.partial ? "#a1a1a6" : "#0a0a0a"}
                opacity={active === null || active === i ? 1 : 0.45}
                style={growStyle("y", b.value / max)}
              />
              <text x={i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#6e6e73">
                {b.label}
              </text>
            </g>
          );
        })}
        {budget && budget.value > 0 && (
          <line
            x1={0}
            x2={W}
            y1={y(budget.value)}
            y2={y(budget.value)}
            stroke="#8e8e93"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            style={{ transition: "all 300ms ease-out" }}
          />
        )}
      </svg>
      {active !== null && bars[active] && (
        <Tooltip leftPercent={((active + 0.5) / bars.length) * 100}>
          {bars[active].label} · {bars[active].valueText}
          {bars[active].partial ? " so far" : ""}
        </Tooltip>
      )}
      <DataTable
        caption={ariaLabel}
        head={["Month", "Spent", ...(budget ? ["Monthly budget"] : [])]}
        rows={bars.map((b) => [b.label, b.valueText, ...(budget ? [budget.text] : [])])}
      />
    </div>
  );
}
