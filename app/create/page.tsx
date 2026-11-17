"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { cleanClubText, CLUB_TEXT_MAX } from "@/lib/orgs/onboarding";
import { OnboardingGate, OnboardingShell } from "../_components/onboarding/OnboardingGate";
import {
  errorText,
  inputClass,
  labelClass,
  mutedText,
  primaryButton,
} from "../_components/onboarding/styles";
import { useAuthFetch } from "../_components/useAuthFetch";

// Create a club: name + school. Setting it up takes several seconds; if the
// last part fails, a plain "Try again" finishes it. Then the setup steps
// at /create/[orgId].
export default function CreatePage() {
  return (
    <OnboardingShell>
      <OnboardingGate loginHint="Log in to create your club.">{() => <CreateClubForm />}</OnboardingGate>
    </OnboardingShell>
  );
}

type Created = { orgId: string; joinCode: string; vault: "ready" | "failed" };

function CreateClubForm() {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState<null | "creating" | "retrying">(null);
  const [error, setError] = useState<string | null>(null);
  const [needsRetry, setNeedsRetry] = useState<string | null>(null); // orgId

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanName = cleanClubText(name);
    const cleanSchool = cleanClubText(school);
    if (!cleanName) return setError("Enter your club's name.");
    if (!cleanSchool) return setError("Enter your school.");
    setBusy("creating");
    setError(null);
    try {
      const res = await authFetch("/api/orgs", {
        method: "POST",
        body: JSON.stringify({ name: cleanName, school: cleanSchool }),
      });
      if (!res.ok) {
        setError("We couldn't create your club. Try again.");
        return;
      }
      const created = (await res.json()) as Created;
      if (created.vault === "ready") router.replace(`/create/${created.orgId}`);
      else setNeedsRetry(created.orgId);
    } catch {
      setError("We couldn't create your club. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function retry(orgId: string) {
    setBusy("retrying");
    setError(null);
    try {
      const res = await authFetch(`/api/orgs/${orgId}/vault/retry`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { vault?: string };
      if (body.vault === "ready") router.replace(`/create/${orgId}`);
      else setError("That didn't work either. Wait a minute and try again.");
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  if (busy === "creating") {
    return (
      <div className="flex flex-col gap-3 py-8 text-center" role="status">
        <p className="text-xl font-semibold">Setting up your club…</p>
        <p className={mutedText}>This takes a few seconds. Please keep this page open.</p>
      </div>
    );
  }

  if (needsRetry) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Almost there</h1>
        <p className={mutedText}>
          Your club was created, but we couldn&apos;t finish setting up where its money is kept. This is usually
          a short hiccup.
        </p>
        <button type="button" onClick={() => retry(needsRetry)} disabled={busy !== null} className={primaryButton}>
          {busy === "retrying" ? "Finishing setup…" : "Try again"}
        </button>
        {error && (
          <p role="alert" className={errorText}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a club</h1>
        <p className={`mt-1 ${mutedText}`}>You&apos;ll be its treasurer. You can invite members next.</p>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Club name</span>
        <input
          required
          maxLength={CLUB_TEXT_MAX}
          placeholder="Kubing Club"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>School</span>
        <input
          required
          maxLength={CLUB_TEXT_MAX}
          placeholder="University of British Columbia"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={busy !== null} className={primaryButton}>
        Create club
      </button>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
    </form>
  );
}
