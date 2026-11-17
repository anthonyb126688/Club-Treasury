"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useOrg } from "../../../../_components/OrgProvider";
import { memberPage, PageHeader } from "../../_components/PageHeader";

// Wraps every treasurer page: a friendly message for anyone who isn't this
// club's treasurer. Navigation lives in the app shell.
export function TreasurerArea({ children }: { children: ReactNode }) {
  const { orgId, isTreasurer } = useOrg();

  if (!isTreasurer) {
    return (
      <main className={memberPage}>
        <PageHeader title="Treasurers only" />
        <p className="text-zinc-600 dark:text-zinc-400">
          This part of the app is for the club&apos;s treasurer. You can still pay dues and get reimbursed from
          Home.
        </p>
        <Link
          href={`/c/${orgId}`}
          className="self-start rounded-xl bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700 dark:bg-brand-400 dark:text-brand-950 dark:hover:bg-brand-300"
        >
          Go home
        </Link>
      </main>
    );
  }

  return <>{children}</>;
}
