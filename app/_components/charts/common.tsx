"use client";

import type { ReactNode } from "react";
import { EmptyState } from "../ui/EmptyState";

// Shared bits for the hand-made SVG charts: black and grays only; orange
// and red mark something that needs attention.

export const GRAYS = [
  "#0a0a0a",
  "#48484a",
  "#7c7c80",
  "#aeaeb2",
  "#d1d1d6",
  "#5e5e62",
];
export const TONE_COLOR = {
  normal: "",
  warn: "#FF9500",
  alert: "#FF3B30",
} as const;
export type Tone = keyof typeof TONE_COLOR;

/** Bars grow from the bottom (or left) and ease to new values; reduced motion turns it off (globals.css). */
export const growStyle = (axis: "y" | "x", scale: number) =>
  ({
    transform: axis === "y" ? `scaleY(${scale})` : `scaleX(${scale})`,
    transformBox: "fill-box",
    transformOrigin: axis === "y" ? "bottom" : "left",
    transition: "transform 300ms ease-out",
  }) as const;

/** The same numbers as a table, for screen readers. */
export function DataTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    // The wrapper hides it: tables ignore sr-only's 1px width and would widen the page.
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={j}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The small bubble with the exact value of the bar you're touching. */
export function Tooltip({
  leftPercent,
  children,
}: {
  leftPercent: number;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-[10px] bg-ink px-2.5 py-1.5 text-[12px] font-semibold whitespace-nowrap text-white shadow-lg tabular-nums"
      style={{ left: `${Math.max(12, Math.min(88, leftPercent))}%` }}
    >
      {children}
    </div>
  );
}

/** "No spending yet this semester" when there's nothing to draw. */
export function ChartEmpty({ text }: { text: string }) {
  return <EmptyState title={text} />;
}
