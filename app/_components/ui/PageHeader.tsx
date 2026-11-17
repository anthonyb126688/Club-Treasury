import type { ReactNode } from "react";

// The large bold title at the top of every page, an optional subtitle, and
// one optional action on the right.
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
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em] break-words sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] break-words text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
