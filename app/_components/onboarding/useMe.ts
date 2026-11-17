"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClubSummary, Me } from "../OrgProvider";
import { useAccountSetup } from "../useAccountSetup";
import { useAuthFetch } from "../useAuthFetch";

/** /api/me, plus the join code on clubs where you're the treasurer. */
export type OnboardingMe = Omit<Me, "clubs"> & { clubs: (ClubSummary & { joinCode?: string })[] };

export type MeState =
  | { state: "loading"; me: null }
  | { state: "failed"; me: null }
  | { state: "ready"; me: OnboardingMe };

/**
 * The logged-in person, once their account is fully set up (the $50
 * welcome creates their row, so /api/me 404s until then: we wait).
 * Only use this after login.
 */
export function useMe(): MeState & { refresh: () => Promise<OnboardingMe | null> } {
  const setup = useAccountSetup();
  const authFetch = useAuthFetch();
  const [me, setMe] = useState<OnboardingMe | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/api/me");
      if (!res.ok) return null;
      const body = (await res.json()) as OnboardingMe;
      setMe(body);
      return body;
    } catch {
      return null;
    }
  }, [authFetch]);

  useEffect(() => {
    if (setup !== "ready") return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 10 && !cancelled; i++) {
        try {
          const res = await authFetch("/api/me");
          if (res.ok) {
            const body = (await res.json()) as OnboardingMe;
            if (!cancelled) setMe(body);
            return;
          }
          if (res.status !== 404) break; // 404 = account still being set up
        } catch {
          // network hiccup: try again
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [setup, authFetch]);

  if (me) return { state: "ready", me, refresh };
  if (setup === "failed" || failed) return { state: "failed", me: null, refresh };
  return { state: "loading", me: null, refresh };
}
