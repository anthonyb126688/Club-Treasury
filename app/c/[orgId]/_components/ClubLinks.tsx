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
    <nav className="flex flex-col divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="flex items-center justify-between gap-3 px-4 py-4 active:bg-zinc-50 dark:active:bg-zinc-900">
          <span className="min-w-0">
            <span className="block font-medium">{l.title}</span>
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">{l.hint}</span>
          </span>
          <span aria-hidden className="text-zinc-400">
            ›
          </span>
        </Link>
      ))}
    </nav>
  );
}
