"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Me } from "./OrgProvider";
import { useAccountSetup } from "./useAccountSetup";
import { useAuthFetch } from "./useAuthFetch";

/**
 * Where a logged-in person goes: their last club (or their first active
 * one). People with no club yet see the "create or join" start (Phase 2
 * builds the full onboarding; this is the hand-off point).
 */
export function HomeRouter() {
  const router = useRouter();
  const { logout } = usePrivy();
  const authFetch = useAuthFetch();
  const setup = useAccountSetup();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (setup !== "ready") return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 10 && !cancelled; i++) {
        const res = await authFetch("/api/me");
        if (res.ok) {
          const body = (await res.json()) as Me;
          if (cancelled) return;
          setMe(body);
          const active = body.clubs.filter((c) => c.status === "active");
          const target = active.find((c) => c.id === body.lastOrgId) ?? active[0];
          if (target) router.replace(`/c/${target.id}`);
          return;
        }
        if (res.status !== 404) break; // 404 = account still being set up
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [setup, authFetch, router]);

  if (setup === "failed" || failed) {
    return (
      <p role="alert" className="text-sm text-red-600">
        We couldn&apos;t finish setting up your account. Refresh to try again.
      </p>
    );
  }

  const waiting = me?.clubs.find((c) => c.status === "pending");
  if (me && !me.clubs.some((c) => c.status === "active")) {
    return (
      <div className="flex flex-col gap-4">
        {waiting ? (
          <p className="rounded-xl bg-zinc-100 px-4 py-6 text-center dark:bg-zinc-900">
            Waiting for the treasurer of <strong>{waiting.name}</strong> to approve you.
          </p>
        ) : (
          <p className="rounded-xl bg-zinc-100 px-4 py-6 text-center dark:bg-zinc-900">
            You&apos;re not in a club yet.
          </p>
        )}
        <button type="button" onClick={logout} className="self-start text-sm text-zinc-600 underline dark:text-zinc-400">
          Log out
        </button>
      </div>
    );
  }

  return <p className="text-zinc-600 dark:text-zinc-400">Setting up your account…</p>;
}
