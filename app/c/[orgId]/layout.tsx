import { Suspense, type ReactNode } from "react";
import { ClubShell } from "./ClubShell";

// This page waits for the login (and, in a club, the membership check)
// before showing anything, so there's no instant preview to build. Opt out
// of Next.js's instant-navigation check (a dev-only warning otherwise).
export const instant = false;

// Every page inside a club. The shell reads the club id from the URL, so it
// sits inside <Suspense> (required with cacheComponents).
export default function ClubLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-md px-4 py-12 text-zinc-600 dark:text-zinc-400">Loading…</p>}>
      <ClubShell>{children}</ClubShell>
    </Suspense>
  );
}
