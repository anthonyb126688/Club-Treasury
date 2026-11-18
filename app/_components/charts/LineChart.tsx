"use client";

import { useState } from "react";
import { ChartEmpty, DataTable, Tooltip, useChartWidth } from "./common";

export type Point = { key: string; label: string; value: number; valueText: string };

// A small black line (e.g. spending per month on the Home Insights card).
export function LineChart({
  points,
  ariaLabel,
  emptyText,
  height = 56,
}: {
  points: Point[];
  ariaLabel: string;
  emptyText: string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [ref, W] = useChartWidth(200);
  if (points.length === 0 || points.every((p) => p.value === 0)) return <ChartEmpty text={emptyText} />;

  const H = height;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  const xy = points.map((p, i) => [points.length > 1 ? i * step : W / 2, 4 + (H - 8) * (1 - p.value / max)] as const);
  const path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <div ref={ref} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="block h-auto w-full overflow-visible"
        onPointerLeave={() => setActive(null)}
      >
        <path d={path} fill="none" stroke="#0a0a0a" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {xy.map(([x, y], i) => (
          <g
            key={points[i].key}
            tabIndex={0}
            onPointerEnter={() => setActive(i)}
            onClick={() => setActive(active === i ? null : i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="cursor-pointer outline-none"
          >
            <rect x={x - step / 2} y={0} width={Math.max(step, 20)} height={H} fill="transparent" />
            <circle cx={x} cy={y} r={active === i ? 4 : 2.5} fill="#0a0a0a" />
          </g>
        ))}
      </svg>
      {active !== null && (
        <Tooltip leftPercent={points.length > 1 ? (active / (points.length - 1)) * 100 : 50}>
          {points[active].label} · {points[active].valueText}
        </Tooltip>
      )}
      <DataTable caption={ariaLabel} head={["Month", "Spent"]} rows={points.map((p) => [p.label, p.valueText])} />
    </div>
  );
}
