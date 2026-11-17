import type { ReactNode } from "react";

// The title at the top of every club page, with an optional subtitle and
// one optional action (a link or button) on the right.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm break-words text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A quiet pill link/button for PageHeader's action slot. */
export const headerAction =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50";

/** Content widths inside the shell: member pages stay phone-width, treasurer pages use the whole area. */
export const memberPage = "mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-5 px-4 pb-12 sm:px-6";
export const treasurerPage = "flex w-full flex-1 flex-col gap-6 px-4 pb-12 sm:px-6 lg:px-8";
