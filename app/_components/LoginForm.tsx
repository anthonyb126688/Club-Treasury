"use client";

import { useLoginWithEmail } from "@privy-io/react-auth";
import { useState, type FormEvent } from "react";

// Our own email + code form, so every word on screen is ours.
// Privy's error messages are never shown directly.
export function LoginForm() {
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendCode({ email: email.trim() });
      setStep("code");
    } catch {
      setError("We couldn't send a code to that email. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onLogIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginWithCode({ code: code.trim() });
    } catch {
      setError("That code didn't work. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-200";
  const button =
    "w-full rounded-xl bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900";

  return step === "email" ? (
    <form onSubmit={onSendCode} className="flex w-full flex-col gap-3">
      <label htmlFor="email" className="text-sm text-zinc-600 dark:text-zinc-400">
        Log in with your email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={input}
      />
      <button type="submit" disabled={busy} className={button}>
        {busy ? "Sending…" : "Send code"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  ) : (
    <form onSubmit={onLogIn} className="flex w-full flex-col gap-3">
      <label htmlFor="code" className="text-sm text-zinc-600 dark:text-zinc-400">
        Enter the 6-digit code we sent to {email}
      </label>
      <input
        id="code"
        required
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className={`${input} tracking-widest`}
      />
      <button type="submit" disabled={busy} className={button}>
        {busy ? "Logging in…" : "Log in"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
        className="text-sm text-zinc-600 underline dark:text-zinc-400"
      >
        Use a different email
      </button>
    </form>
  );
}
