"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

// A modal sheet: slides up from the bottom on phones, slides in from the
// right as a side panel on wide screens (lg+). Escape or the backdrop closes it.
export function Sheet({
  title,
  onClose,
  children,
  side = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  side?: boolean; // false = always a bottom sheet (e.g. the phone More sheet)
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/25 active:transform-none"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[22px] outline-none sheet-up ${
          side
            ? "lg:sheet-side lg:inset-y-3 lg:right-3 lg:left-auto lg:max-h-none lg:w-[28rem] lg:rounded-[22px]"
            : ""
        }`}
        style={{ background: "rgb(250 250 252 / 0.92)" }}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <span aria-hidden className={`absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-black/15 ${side ? "lg:hidden" : ""}`} />
          <p className="mt-2 truncate text-[17px] font-semibold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mt-2 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/[0.06] text-zinc-600 hover:text-ink"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
