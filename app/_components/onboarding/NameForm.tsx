"use client";

import { useState, type FormEvent } from "react";
import { checkNames, NAME_MAX } from "@/lib/orgs/onboarding";
import { useAuthFetch } from "../useAuthFetch";
import { errorText, inputClass, labelClass, mutedText, primaryButton } from "./styles";

/** "What's your name?" — first + last, saved to your account. */
export function NameForm({ onSaved }: { onSaved: () => void | Promise<unknown> }) {
  const authFetch = useAuthFetch();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const check = checkNames({ firstName, lastName });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: check.firstName, lastName: check.lastName }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "We couldn't save your name. Try again.");
        return;
      }
      await onSaved();
    } catch {
      setError("We couldn't save your name. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">What&apos;s your name?</h2>
        <p className={`mt-1 text-sm ${mutedText}`}>Your club&apos;s treasurer will see it.</p>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>First name</span>
        <input
          required
          autoComplete="given-name"
          maxLength={NAME_MAX}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Last name</span>
        <input
          required
          autoComplete="family-name"
          maxLength={NAME_MAX}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Saving…" : "Continue"}
      </button>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
    </form>
  );
}
