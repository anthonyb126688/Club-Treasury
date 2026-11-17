import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "plain";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] px-4 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-zinc-800",
  secondary: "glass text-ink hover:bg-white/80",
  destructive: "bg-alert text-white hover:brightness-95",
  plain: "text-ink hover:bg-black/5",
};

/** Class names for a button look, for elements that aren't <Button> (e.g. a <label>). */
export function buttonClass(variant: ButtonVariant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`;
}

/** Primary = solid black. Secondary = glass with a hairline border. Destructive = red. */
export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: { variant?: ButtonVariant; children: ReactNode } & ComponentPropsWithoutRef<"button">) {
  return (
    <button type="button" className={buttonClass(variant, className)} {...rest}>
      {children}
    </button>
  );
}

/** A link that looks like a button. */
export function ButtonLink({
  variant = "primary",
  className = "",
  children,
  ...rest
}: { variant?: ButtonVariant; children: ReactNode } & ComponentPropsWithoutRef<typeof Link>) {
  return (
    <Link className={buttonClass(variant, className)} {...rest}>
      {children}
    </Link>
  );
}
