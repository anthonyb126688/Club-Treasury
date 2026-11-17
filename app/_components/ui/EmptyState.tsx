import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Nothing here yet: what will show up, and (optionally) what to do.
export function EmptyState({
  title,
  children,
  icon: Icon,
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center gap-2 rounded-[16px] px-5 py-8 text-center">
      {Icon && (
        <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-black/[0.06] text-zinc-600">
          <Icon size={22} strokeWidth={1.75} />
        </span>
      )}
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <div className="max-w-sm text-[13px] text-muted">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Something went wrong: what happened, then what to do. */
export function ErrorState({ what, todo, onRetry }: { what: string; todo: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="glass flex flex-col gap-1 rounded-[16px] border-alert/30 px-4 py-3 text-[13px]">
      <p className="font-semibold text-alert">{what}</p>
      <p className="text-zinc-700">
        {todo}
        {onRetry && (
          <>
            {" "}
            <button type="button" onClick={onRetry} className="font-semibold text-ink underline underline-offset-4">
              Try again
            </button>
          </>
        )}
      </p>
    </div>
  );
}

/** Gray placeholder blocks while something loads. */
export function LoadingBlocks({ rows = 3, height = "h-16", label = "Loading" }: { rows?: number; height?: string; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className={`block ${height} animate-pulse rounded-[16px] bg-white/50`} />
      ))}
    </div>
  );
}
