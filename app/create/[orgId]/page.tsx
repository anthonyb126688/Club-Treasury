import { Suspense } from "react";
import { OnboardingShell } from "../../_components/onboarding/OnboardingGate";
import { SetupSteps } from "./SetupSteps";

// New club setup, right after "Create a club": dues, spending rules, then
// the invite + budget. The view reads the club id from the URL, so it sits
// inside <Suspense> (required with cacheComponents).
export default function ClubSetupPage() {
  return (
    <OnboardingShell>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <SetupSteps />
      </Suspense>
    </OnboardingShell>
  );
}
