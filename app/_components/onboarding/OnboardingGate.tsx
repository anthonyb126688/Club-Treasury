"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import type { ReactNode } from "react";
import { LoginForm } from "../LoginForm";
import { Wordmark } from "../Mark";
import { NameForm } from "./NameForm";
import { mutedText } from "./styles";
import { useMe, type OnboardingMe } from "./useMe";

/**
 * The page frame for onboarding screens (start, create, join, waiting):
 * a narrow phone-first column with the app name and Log out.
 */
export function OnboardingShell({ children }: { children: ReactNode }) {
  const { authenticated, logout } = usePrivy();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="Club Treasury home">
          <Wordmark />
        </Link>
        {authenticated && (
          <button type="button" onClick={logout} className={`text-sm underline ${mutedText}`}>
            Log out
          </button>
        )}
      </header>
      <div className="flex flex-1 flex-col gap-6">{children}</div>
    </main>
  );
}

/**
 * Everything an onboarding screen needs before it can show: logged in
 * (shows the login form right here, so invite links continue after login),
 * account set up, and a name on file. Then renders `children(me, refresh)`.
 */
export function OnboardingGate({
  children,
  loginHint,
}: {
  children: (me: OnboardingMe, refresh: () => Promise<OnboardingMe | null>) => ReactNode;
  loginHint?: string;
}) {
  const { ready, authenticated } = usePrivy();
  if (!ready) return <p className={mutedText}>Loading…</p>;
  if (!authenticated) {
    return (
      <div className="flex flex-col gap-4">
        {loginHint && <p className={mutedText}>{loginHint}</p>}
        <LoginForm />
      </div>
    );
  }
  return <LoggedIn>{children}</LoggedIn>;
}

function LoggedIn({
  children,
}: {
  children: (me: OnboardingMe, refresh: () => Promise<OnboardingMe | null>) => ReactNode;
}) {
  const { state, me, refresh } = useMe();
  if (state === "failed") {
    return (
      <p role="alert" className="text-sm text-red-600">
        We couldn&apos;t finish setting up your account. Refresh to try again.
      </p>
    );
  }
  if (state === "loading") return <p className={mutedText}>Setting up your account…</p>;
  if (!me.firstName?.trim() || !me.lastName?.trim()) return <NameForm onSaved={refresh} />;
  return <>{children(me, refresh)}</>;
}
