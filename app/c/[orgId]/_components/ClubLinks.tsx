import Link from "next/link";

// Links at the bottom of the club home: budget, public ledger, and the
// treasurer area (treasurers only).
export function ClubLinks({ orgId, isTreasurer }: { orgId: string; isTreasurer: boolean }) {
  const links = [
    { href: `/c/${orgId}/budget`, title: "Club budget", hint: "How much is left in each category" },
    { href: `/ledger/${orgId}`, title: "See where the money goes", hint: "Every payment in and out" },
    ...(isTreasurer
      ? [{ href: `/c/${orgId}/treasurer`, title: "Treasurer dashboard", hint: "Approve requests and manage the club" }]
      : []),
  ];
  return (
    <nav className="flex flex-col divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
          <span className="min-w-0">
            <span className="block font-medium">{l.title}</span>
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">{l.hint}</span>
          </span>
          <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0 text-zinc-400">
            <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ))}
    </nav>
  );
}
