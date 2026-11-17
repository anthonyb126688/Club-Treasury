import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export const ICON_STROKE = 1.75;

/** An icon in a small rounded gray tile, like iOS Settings rows. */
export function IconTile({ icon: Icon, dark = false }: { icon: LucideIcon; dark?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] ${dark ? "bg-ink text-white" : "bg-black/[0.06] text-ink"}`}
    >
      <Icon size={18} strokeWidth={ICON_STROKE} />
    </span>
  );
}

// One row in a grouped list: icon tile, title, subtitle, trailing value,
// and a chevron when it's tappable (href or onClick).
export function ListRow({
  icon,
  title,
  subtitle,
  trailing,
  trailingSub,
  href,
  onClick,
  selected,
  className = "",
}: {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  trailingSub?: ReactNode;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) {
  const tappable = !!(href || onClick);
  const inner = (
    <>
      {icon && <IconTile icon={icon} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{title}</span>
        {subtitle && <span className="block truncate text-[13px] text-muted">{subtitle}</span>}
      </span>
      {(trailing || trailingSub) && (
        <span className="shrink-0 text-right">
          {trailing && <span className="block text-[15px] font-semibold tabular-nums">{trailing}</span>}
          {trailingSub && <span className="block text-[12px] text-muted">{trailingSub}</span>}
        </span>
      )}
      {tappable && <ChevronRight size={18} strokeWidth={ICON_STROKE} aria-hidden className="shrink-0 text-zinc-400" />}
    </>
  );
  const cls = `flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left ${
    tappable ? "hover:bg-black/[0.03]" : ""
  } ${selected ? "bg-black/[0.05]" : ""} ${className}`;

  if (href) {
    return (
      <Link href={href} className={cls} aria-current={selected ? "true" : undefined}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-current={selected ? "true" : undefined}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/** A glass group of rows with hairline dividers. */
export function ListGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="glass divide-y divide-black/[0.06] overflow-hidden rounded-[16px]">
      {children}
    </ul>
  );
}
