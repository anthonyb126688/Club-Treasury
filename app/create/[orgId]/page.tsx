import { Suspense } from "react";
import { OnboardingShell } from "../../_components/onboarding/OnboardingGate";
import { SetupSteps } from "./SetupSteps";

// This page waits for the login (and, in a club, the membership check)
// before showing anything, so there's no instant preview to build. Opt out
// of Next.js's instant-navigation check (a dev-only warning otherwise).
export const instant = false;

// New club setup, right after "Create a club": dues, spending rules, then
// the invite + budget. The view reads the club id from the URL, so it sits
// inside <Suspense> (required with cacheComponents).
export default function ClubSetupPage() {
  return (
    <OnboardingShell>
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Loading…</p>}>
        <SetupSteps />
      </Suspense>
    </OnboardingShell>
  );
}
