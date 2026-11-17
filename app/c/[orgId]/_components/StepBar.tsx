import { STEP_LABELS, STEPS, type Step } from "@/lib/member/status";

// Submitted → Approved → Paid, with the current step highlighted in black.
// Used on the home screen ("My requests") and the reimburse result.
export function StepBar({ current, inverted = false }: { current: Step; inverted?: boolean }) {
  const currentIndex = STEPS.indexOf(current);
  return (
    <ol className="flex items-center gap-1" aria-label={`Status: ${STEP_LABELS[current]}`}>
      {STEPS.map((step, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <li key={step} className="flex flex-1 flex-col gap-1.5" aria-current={isCurrent ? "step" : undefined}>
            <span
              className={`h-1 rounded-full transition-colors duration-300 ${
                reached ? (inverted ? "bg-white" : "bg-ink") : inverted ? "bg-white/25" : "bg-black/[0.1]"
              }`}
            />
            <span
              className={`text-[12px] ${
                isCurrent
                  ? `font-semibold ${inverted ? "text-white" : "text-ink"}`
                  : inverted
                    ? "text-white/60"
                    : "text-muted"
              }`}
            >
              {STEP_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
