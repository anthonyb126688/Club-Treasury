"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ClubMenu } from "./ClubSwitcher";
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
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4">
      <Link href={`/c/${orgId}`} className="min-w-0 truncate text-lg font-semibold tracking-tight">
        {club?.name ?? "Club Treasury"}
      </Link>
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="rounded-xl border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Menu
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
          >
            <ClubMenu onNavigate={() => setOpen(false)} />
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
