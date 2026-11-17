"use client";

import Link from "next/link";
import { OnboardingGate, OnboardingShell } from "../_components/onboarding/OnboardingGate";
import { mutedText, primaryButton, secondaryButton } from "../_components/onboarding/styles";

// "Create a club" or "Join a club": where people with no club start.
export default function StartPage() {
  return (
    <OnboardingShell>
      <OnboardingGate>
        {(me) => {
          const active = me.clubs.filter((c) => c.status === "active");
          const pending = me.clubs.filter((c) => c.status === "pending");
          return (
            <>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Hi {me.firstName}!</h1>
                <p className={`mt-1 ${mutedText}`}>Start a club or join the one you&apos;re in.</p>
              </div>
              <div className="flex flex-col gap-3">
                <Link href="/join" className={primaryButton}>
                  Join a club
                </Link>
                <Link href="/create" className={secondaryButton}>
                  Create a club
                </Link>
              </div>
              {pending.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {pending.map((c) => (
                    <li key={c.id}>
                      <Link href={`/waiting/${c.id}`} className="underline decoration-zinc-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500 dark:decoration-zinc-600 dark:hover:text-brand-300">
                        Waiting to join {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {active.length > 0 && (
                <Link href={`/c/${active.find((c) => c.id === me.lastOrgId)?.id ?? active[0].id}`} className={`text-sm underline ${mutedText}`}>
                  Back to my club
                </Link>
              )}
            </>
          );
        }}
      </OnboardingGate>
    </OnboardingShell>
  );
}
