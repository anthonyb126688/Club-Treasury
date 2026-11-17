"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeDestination } from "@/lib/orgs/onboarding";
import { NameForm } from "./onboarding/NameForm";
import { useMe } from "./onboarding/useMe";

/**
 * Where a logged-in person goes (lib/orgs/onboarding.ts homeDestination):
 * no name yet → "What's your name?" right here; in a club → their last
 * club (or first active one); only asked to join → the waiting screen;
 * otherwise → create or join a club.
 */
export function HomeRouter() {
  const router = useRouter();
  const { state, me, refresh } = useMe();
  const destination = me ? homeDestination(me) : null;

  // A plain string, so the effect only re-runs when the place changes.
  const path =
    !destination || destination.to === "name"
      ? null
      : destination.to === "club"
        ? `/c/${destination.orgId}`
        : destination.to === "waiting"
          ? `/waiting/${destination.orgId}`
          : "/start";

  useEffect(() => {
    if (path) router.replace(path);
  }, [path, router]);

  if (state === "failed") {
    return (
      <p role="alert" className="text-[13px] font-medium text-alert">
        We couldn&apos;t finish setting up your account. Refresh to try again.
      </p>
    );
  }
  if (destination?.to === "name") return <NameForm onSaved={refresh} />;
  return (
    <p className="text-muted">{state === "loading" ? "Setting up your account…" : "Loading…"}</p>
  );
}
