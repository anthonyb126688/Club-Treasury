"use client";

import { useState } from "react";
import { ChartEmpty, DataTable, growStyle, Tooltip, useChartWidth } from "./common";

export type Pair = { key: string; label: string; inValue: number; outValue: number; inText: string; outText: string };

const H = 170;
const PAD_B = 22;
const PAD_T = 8;
const GREEN = "#248A3D";

// Money in (green outline) vs money out (black) per month.
export function PairedBars({ pairs, ariaLabel, emptyText }: { pairs: Pair[]; ariaLabel: string; emptyText: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [ref, W] = useChartWidth();
  if (pairs.length === 0 || pairs.every((p) => p.inValue === 0 && p.outValue === 0)) return <ChartEmpty text={emptyText} />;

  const max = Math.max(1, ...pairs.flatMap((p) => [p.inValue, p.outValue]));
  const plotH = H - PAD_B - PAD_T;
  const slot = W / pairs.length;
  const barW = Math.min(28, slot * 0.3);

  return (
    <div ref={ref} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="block h-auto w-full overflow-visible"
        onPointerLeave={() => setActive(null)}
      >
        <line x1={0} x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="rgb(0 0 0 / 0.1)" />
        {pairs.map((p, i) => {
          const mid = i * slot + slot / 2;
          const dim = active === null || active === i ? 1 : 0.45;
          return (
            <g
              key={p.key}
              tabIndex={0}
              onPointerEnter={() => setActive(i)}
              onClick={() => setActive(active === i ? null : i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="cursor-pointer outline-none"
            >
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              <rect
                x={mid - barW - 1.5}
                y={PAD_T}
                width={barW}
                height={plotH}
                rx={4}
                fill="rgb(36 138 61 / 0.15)"
                stroke={GREEN}
                strokeWidth={1.5}
                opacity={dim}
                style={growStyle("y", p.inValue / max)}
              />
              <rect
                x={mid + 1.5}
                y={PAD_T}
                width={barW}
                height={plotH}
                rx={4}
                fill="#0a0a0a"
                opacity={dim}
                style={growStyle("y", p.outValue / max)}
              />
              <text x={mid} y={H - 6} textAnchor="middle" fontSize={11} fill="#6e6e73">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <Tooltip leftPercent={((active + 0.5) / pairs.length) * 100}>
          {pairs[active].label} · in {pairs[active].inText} · out {pairs[active].outText}
        </Tooltip>
      )}
      <div aria-hidden className="mt-2 flex gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px]" style={{ borderColor: GREEN, background: "rgb(36 138 61 / 0.15)" }} />
          Money in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-ink" />
          Money out
        </span>
      </div>
      <DataTable
        caption={ariaLabel}
        head={["Month", "Money in", "Money out"]}
        rows={pairs.map((p) => [p.label, p.inText, p.outText])}
      />
    </div>
  );
}
