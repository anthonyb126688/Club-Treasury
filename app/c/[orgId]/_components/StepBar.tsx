import { STEP_LABELS, STEPS, type Step } from "@/lib/member/status";

// Submitted → Approved → Paid, with the current step highlighted.
// Used on the home screen ("My requests") and the reimburse result.
export function StepBar({ current }: { current: Step }) {
  const currentIndex = STEPS.indexOf(current);
  const done = current === "paid";
  return (
    <ol className="flex items-center gap-1" aria-label={`Status: ${STEP_LABELS[current]}`}>
      {STEPS.map((step, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <li key={step} className="flex flex-1 flex-col gap-1" aria-current={isCurrent ? "step" : undefined}>
            <span
              className={`h-1.5 rounded-full ${
                reached
                  ? done
                    ? "bg-green-600 dark:bg-green-500"
                    : "bg-zinc-900 dark:bg-zinc-100"
                  : "bg-zinc-200 dark:bg-zinc-800"
              }`}
            />
            <span
              className={`text-xs ${
                isCurrent
                  ? done
                    ? "font-semibold text-green-700 dark:text-green-400"
                    : "font-semibold text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500"
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
