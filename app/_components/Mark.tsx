// The Club Treasury mark: a pine pennant with a gold stripe.
export function Mark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="9" className="fill-brand-600 dark:fill-brand-400" />
      <path d="M10 8v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white dark:text-brand-950" />
      <path d="M11 8.5 24 13l-13 4.5z" className="fill-white dark:fill-brand-950" />
      <path d="M11 11.6 19.6 13 11 14.4z" className="fill-gold-400" />
    </svg>
  );
}

/** Mark + "Club Treasury", for screens outside a club (login, onboarding). */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark className="h-9 w-9" />
      <span className="font-display text-xl font-semibold">Club Treasury</span>
    </span>
  );
}

/** Full-screen loading state: the mark, gently pulsing. */
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-24">
      <Mark className="h-10 w-10 animate-pulse" />
      <p className="text-sm text-zinc-500">{label}</p>
    </div>
  );
}
