"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppHeader } from "../../_components/AppHeader";
import { LoadingScreen } from "../../_components/Mark";
import { OrgProvider, useOrg } from "../../_components/OrgProvider";
import { useAuthFetch } from "../../_components/useAuthFetch";

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
    return <LoadingScreen />;
  }

  return (
    <OrgProvider orgId={orgId}>
      <AppHeader />
      <div className="flex flex-1 flex-col pt-5">
        <MembersOnly>{children}</MembersOnly>
      </div>
    </OrgProvider>
  );
}

function MembersOnly({ children }: { children: ReactNode }) {
  const { club, me, loading } = useOrg();
  const authFetch = useAuthFetch();

  // Remember this as the club to open next time (best effort).
  const clubId = club?.id;
  useEffect(() => {
    if (!clubId || me?.lastOrgId === clubId) return;
    authFetch("/api/me", { method: "PATCH", body: JSON.stringify({ lastOrgId: clubId }) }).catch(() => {});
  }, [clubId, me?.lastOrgId, authFetch]);
  if (loading) return <LoadingScreen />;
  if (!club) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
        <p>You&apos;re not a member of this club (or the treasurer hasn&apos;t approved you yet).</p>
        <Link href="/" className="underline decoration-zinc-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500 dark:decoration-zinc-600 dark:hover:text-brand-300">
          Go to my clubs
        </Link>
      </main>
    );
  }
  return <>{children}</>;
}
