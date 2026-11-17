// A thin bar: black fill, red when over, orange when ahead of pace.
// `pace` (0-100) draws a tick at "where you should be today".
export function ProgressBar({
  percent,
  pace,
  tone = "normal",
  label,
}: {
  percent: number;
  pace?: number | null;
  tone?: "normal" | "warn" | "alert";
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fill = tone === "alert" ? "bg-alert" : tone === "warn" ? "bg-warn" : "bg-ink";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className="relative h-2 rounded-full bg-black/[0.08]"
    >
      <div
        className={`h-full rounded-full ${fill} transition-[width] duration-300 ease-out`}
        style={{ width: `${clamped}%` }}
      />
      {pace != null && (
        <span
          aria-hidden
          title="Where spending should be today"
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-zinc-500"
          style={{ left: `calc(${Math.max(0, Math.min(100, pace))}% - 1px)` }}
        />
      )}
    </div>
  );
}
