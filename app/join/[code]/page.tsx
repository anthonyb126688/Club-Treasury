import { Suspense } from "react";
import { OnboardingShell } from "../../_components/onboarding/OnboardingGate";
import { JoinClubView } from "./JoinClubView";

// This page waits for the login (and, in a club, the membership check)
// before showing anything, so there's no instant preview to build. Opt out
// of Next.js's instant-navigation check (a dev-only warning otherwise).
export const instant = false;

// Invite link: /join/KUBI-4821. Logged-out visitors log in right here, then
// carry on joining. The view reads the code from the URL, so it sits inside
// <Suspense> (required with cacheComponents).
export default function JoinCodePage() {
  return (
    <OnboardingShell>
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Loading…</p>}>
        <JoinClubView />
      </Suspense>
    </OnboardingShell>
  );
}
