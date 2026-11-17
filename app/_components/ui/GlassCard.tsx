import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

// The one surface style: frosted glass, 16px corners.
export function GlassCard<T extends ElementType = "div">({
  as,
  padded = true,
  className = "",
  children,
  ...rest
}: {
  as?: T;
  padded?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={`glass rounded-[16px] ${padded ? "p-4 sm:p-5" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** A small grey heading above a group of cards or rows (iOS section label). */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-[13px] font-semibold tracking-normal text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}
