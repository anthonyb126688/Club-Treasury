"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ClubMenu } from "./ClubSwitcher";
import { Mark } from "./Mark";
import { useOrg } from "./OrgProvider";

// Header shown on every club page: the club's name (links to its home) and
// a menu with the club switcher (for people in several clubs), "Join or
// create another club", "Leave club", and Log out.
export function AppHeader() {
  const { logout } = usePrivy();
  const { orgId, club } = useOrg();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu on a tap outside it, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-[color-mix(in_oklab,var(--background)_85%,transparent)] backdrop-blur dark:border-zinc-800/70">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href={`/c/${orgId}`} className="flex min-w-0 items-center gap-2.5">
          <Mark />
          <span className="truncate font-display text-lg font-semibold">{club?.name ?? "Club Treasury"}</span>
        </Link>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="menu"
            className="flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm font-medium hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Menu
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_12px_40px_-12px_rgb(13_18_16/0.25)] dark:border-zinc-800 dark:bg-zinc-900"
            >
              <ClubMenu onNavigate={() => setOpen(false)} />
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
