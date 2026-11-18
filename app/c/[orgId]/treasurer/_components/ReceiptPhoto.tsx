"use client";

import { useEffect, useState } from "react";

// A receipt photo (short-lived private link). Tap to see it full screen.
export function ReceiptPhoto({ url, label }: { url: string | null; label: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!url) {
    return (
      <div className="flex h-24 w-full items-center justify-center rounded-xl bg-black/[0.05] text-sm text-zinc-500">
        No photo
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private link */}
        <img
          src={url}
          alt={label}
          className="aspect-[3/4] w-full rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
        />
        <span className="mt-1 block text-center text-xs text-zinc-500">{label} · tap to enlarge</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private link */}
          <img src={url} alt={label} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
          <button type="button" className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-900">
            Close
          </button>
        </div>
      )}
    </>
  );
}
