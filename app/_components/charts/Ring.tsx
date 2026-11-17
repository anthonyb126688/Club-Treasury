import type { ReactNode } from "react";

// A progress ring: black arc on a light gray track (red when over).
// The arc eases to new values (disabled with reduced motion via globals.css).
export function Ring({
  percent,
  size = 88,
  stroke = 9,
  tone = "normal",
  label,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  tone?: "normal" | "warn" | "alert";
  label: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  const color = tone === "alert" ? "var(--color-alert)" : tone === "warn" ? "var(--color-warn)" : "var(--color-ink)";
  return (
    <div role="img" aria-label={label} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(0 0 0 / 0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          style={{ transition: "stroke-dashoffset 300ms ease-out" }}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}
