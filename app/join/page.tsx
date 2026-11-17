"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { normalizeJoinCode } from "@/lib/orgs/join-code";
import { OnboardingGate, OnboardingShell } from "../_components/onboarding/OnboardingGate";
import { errorText, inputClass, labelClass, mutedText, primaryButton } from "../_components/onboarding/styles";

// Type a club's join code (e.g. "kubi 4821" → KUBI-4821), then confirm it on
// /join/[code].
export default function JoinPage() {
  return (
    <OnboardingShell>
      <OnboardingGate loginHint="Log in to join your club.">{() => <JoinCodeForm />}</OnboardingGate>
    </OnboardingShell>
  );
}

function JoinCodeForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const code = normalizeJoinCode(text);
    if (!code) {
      setError("Join codes look like KUBI-4821: 4 letters, then 4 numbers.");
      return;
    }
    router.push(`/join/${code}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Join a club</h1>
        <p className={`mt-1 ${mutedText}`}>Ask your treasurer for the club&apos;s join code.</p>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Join code</span>
        <input
          required
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          placeholder="KUBI-4821"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          className={`${inputClass} uppercase tracking-widest`}
        />
      </label>
      <button type="submit" className={primaryButton}>
        Find my club
      </button>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
    </form>
  );
}
