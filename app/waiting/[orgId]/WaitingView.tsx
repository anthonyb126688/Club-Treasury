"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { OnboardingGate } from "../../_components/onboarding/OnboardingGate";
import { card, mutedText, primaryButton } from "../../_components/onboarding/styles";
import type { OnboardingMe } from "../../_components/onboarding/useMe";
import { useAuthFetch } from "../../_components/useAuthFetch";

const CHECK_EVERY_MS = 5000;

export function WaitingView() {
  const { orgId } = useParams<{ orgId: string }>();
  return <OnboardingGate>{(me, refresh) => <Waiting orgId={orgId} me={me} refresh={refresh} />}</OnboardingGate>;
}

function Waiting({
  orgId,
  me,
  refresh,
}: {
  orgId: string;
  me: OnboardingMe;
  refresh: () => Promise<OnboardingMe | null>;
}) {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const club = me.clubs.find((c) => c.id === orgId) ?? null;
  const status = club?.status ?? null;

  // Check every few seconds until the treasurer approves.
  useEffect(() => {
    if (status !== "pending") return;
    const timer = setInterval(() => void refresh(), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [status, refresh]);

  // Approved: remember this club and go to it.
  useEffect(() => {
    if (status !== "active") return;
    (async () => {
      await authFetch("/api/me", { method: "PATCH", body: JSON.stringify({ lastOrgId: orgId }) }).catch(() => {});
      router.replace(`/c/${orgId}`);
    })();
  }, [status, orgId, authFetch, router]);

  if (status === "active") return <p className={mutedText}>You&apos;re in! Opening your club…</p>;

  if (!club) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re not in this club</h1>
        <p className={mutedText}>
          The treasurer didn&apos;t approve this request, or it was never sent. If you think that&apos;s a mistake,
          ask your treasurer and try joining again.
        </p>
        <Link href="/start" className={primaryButton}>
          Join or create a club
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Waiting for approval</h1>
      {/* Club-provided text: plain text only. */}
      <div className={card}>
        <p className="text-lg font-semibold break-words">{club.name}</p>
        <p className={`break-words ${mutedText}`}>{club.school}</p>
      </div>
      <p className={mutedText}>
        We&apos;ve asked the treasurer of {club.name} to approve you. You can leave this page open: it&apos;ll take
        you to your club as soon as you&apos;re in.
      </p>
      <p className={`flex items-center gap-2 text-sm ${mutedText}`}>
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-400" aria-hidden />
        Checking for approval…
      </p>
      <Link href="/start" className={`text-sm underline ${mutedText}`}>
        Join or create another club
      </Link>
    </div>
  );
}
