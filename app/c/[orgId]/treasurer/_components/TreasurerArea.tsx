"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useOrg } from "../../../../_components/OrgProvider";

// The treasurer-area nav, shown above every treasurer page. Pages render
// below it and set their own width.
export function TreasurerArea({ children }: { children: ReactNode }) {
  const { orgId, isTreasurer } = useOrg();
  const pathname = usePathname();
  const base = `/c/${orgId}/treasurer`;

  if (!isTreasurer) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Treasurers only</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          This part of the app is for the club&apos;s treasurer. You can still pay dues and get reimbursed from
          the member view.
        </p>
        <Link
          href={`/c/${orgId}`}
          className="self-start rounded-xl bg-zinc-900 px-4 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Go to member view
        </Link>
      </main>
    );
  }

  const links = [
    { href: base, label: "Dashboard", exact: true },
    { href: `${base}/members`, label: "Members" },
    { href: `${base}/budget`, label: "Budget" },
    { href: `${base}/settings`, label: "Settings" },
  ];
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <nav aria-label="Treasurer" className="mx-auto w-full max-w-5xl px-4 pb-4">
        <div className="flex items-center gap-1 overflow-x-auto rounded-2xl bg-zinc-100 p-1 text-sm dark:bg-zinc-900">
          {links.map((l) => {
            const active = isActive(l.href, l.exact);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-xl px-3 py-2 font-medium ${
                  active
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <Link
            href={`/c/${orgId}`}
            className="ml-auto shrink-0 rounded-xl px-3 py-2 text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Member view
          </Link>
        </div>
      </nav>
      {children}
    </>
  );
}
