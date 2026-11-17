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
    "w-full min-h-12 rounded-[12px] border-[0.5px] border-black/10 bg-white/80 px-4 text-[16px] text-ink outline-none focus:border-ink focus:ring-2 focus:ring-black/10";
  const button =
    "inline-flex w-full min-h-12 items-center justify-center rounded-[12px] bg-ink px-4 text-[16px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-40";

  return step === "email" ? (
    <form onSubmit={onSendCode} className="flex w-full flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
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
      {error && <p role="alert" className="text-[13px] font-medium text-alert">{error}</p>}
    </form>
  ) : (
    <form onSubmit={onLogIn} className="flex w-full flex-col gap-3">
      <label htmlFor="code" className="text-sm font-medium">
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
        className={`${input} text-center font-display text-2xl tracking-[0.4em]`}
      />
      <button type="submit" disabled={busy} className={button}>
        {busy ? "Logging in…" : "Log in"}
      </button>
      {error && <p role="alert" className="text-[13px] font-medium text-alert">{error}</p>}
      <button
        type="button"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
        className="text-[13px] text-muted underline underline-offset-4 hover:text-ink"
      >
        Use a different email
      </button>
    </form>
  );
}
