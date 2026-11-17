"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useOrg } from "./OrgProvider";

// Header shown on every club page: the club's name (links to its home) and
// Log out. Phase 2 adds the club switcher for people in several clubs here.
export function AppHeader() {
  const { logout } = usePrivy();
  const { orgId, club } = useOrg();

  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4">
      <Link href={`/c/${orgId}`} className="min-w-0 truncate text-lg font-semibold tracking-tight">
        {club?.name ?? "Club Treasury"}
      </Link>
      <button type="button" onClick={logout} className="shrink-0 text-sm text-zinc-600 underline dark:text-zinc-400">
        Log out
      </button>
    </header>
  );
}
