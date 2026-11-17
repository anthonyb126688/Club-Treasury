import { Suspense } from "react";
import { OnboardingShell } from "../../_components/onboarding/OnboardingGate";
import { WaitingView } from "./WaitingView";

// This page waits for the login (and, in a club, the membership check)
// before showing anything, so there's no instant preview to build. Opt out
// of Next.js's instant-navigation check (a dev-only warning otherwise).
export const instant = false;

// "Waiting for approval" after asking to join a club. The view reads the
// club id from the URL, so it sits inside <Suspense> (cacheComponents).
export default function WaitingPage() {
  return (
    <OnboardingShell>
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Loading…</p>}>
        <WaitingView />
      </Suspense>
    </OnboardingShell>
  );
}
