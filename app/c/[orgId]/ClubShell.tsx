"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppHeader } from "../../_components/AppHeader";
import { OrgProvider, useOrg } from "../../_components/OrgProvider";

// Every page inside a club (/c/[orgId]/...): must be logged in and an active
// member. The server checks this again on every request; this is just so
// people see a friendly screen instead of errors.
export function ClubShell({ children }: { children: ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>();
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return <p className="mx-auto max-w-md px-4 py-12 text-zinc-600 dark:text-zinc-400">Loading…</p>;
  }

  return (
    <OrgProvider orgId={orgId}>
      <AppHeader />
      <MembersOnly>{children}</MembersOnly>
    </OrgProvider>
  );
}

function MembersOnly({ children }: { children: ReactNode }) {
  const { club, loading } = useOrg();
  if (loading) return <p className="mx-auto max-w-md px-4 py-12 text-zinc-600 dark:text-zinc-400">Loading…</p>;
  if (!club) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
        <p>You&apos;re not a member of this club (or the treasurer hasn&apos;t approved you yet).</p>
        <Link href="/" className="underline">
          Go to my clubs
        </Link>
      </main>
    );
  }
  return <>{children}</>;
}
