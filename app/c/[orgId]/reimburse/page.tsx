"use client";

import Link from "next/link";
import { useState } from "react";
import { outcomeStep, PAYOUT_PROBLEM_REASON, type SubmitOutcome } from "@/lib/member/status";
import type { Category } from "@/lib/policy/rules";
import { parseDollarsToCents } from "@/lib/reimburse/decide";
import { useOrg } from "../../../_components/OrgProvider";
import { useAuthFetch } from "../../../_components/useAuthFetch";
import { StepBar } from "../_components/StepBar";
import { shrinkPhoto } from "./shrink-photo";

type Reading = {
  id: string;
  isReceipt: boolean;
  vendor: string | null;
  date: string | null;
  totalCents: number | null;
  category: Category;
  summary: string;
  categories: { slug: Category; name: string }[];
};

type Outcome = SubmitOutcome;

type Step =
  | { name: "pick" }
  | { name: "reading" }
  | { name: "confirm"; reading: Reading }
  | { name: "sending"; reading: Reading }
  | { name: "done"; outcome: Outcome; amount: string };

const centsToInput = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
const showDollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Get reimbursed: snap a receipt → check what the AI read → done.
export default function ReimbursePage() {
  const { orgId } = useOrg();
  const authFetch = useAuthFetch();
  const [step, setStep] = useState<Step>({ name: "pick" });
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [error, setError] = useState<string | null>(null);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStep({ name: "reading" });
    try {
      const photo = await shrinkPhoto(file);
      const form = new FormData();
      form.append("photo", photo, "receipt.jpg");
      const res = await authFetch(`/api/orgs/${orgId}/reimburse/read`, { method: "POST", body: form });
      if (res.status === 429) throw new Error("You've sent a lot of receipts today. Try again tomorrow.");
      if (res.status === 422) throw new Error("We couldn't read that photo. Try a clearer, closer shot.");
      if (!res.ok) throw new Error("Something went wrong reading your receipt. Try again.");
      const reading = (await res.json()) as Reading;
      setAmount(centsToInput(reading.totalCents));
      setCategory(reading.category);
      setStep({ name: "confirm", reading });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
      setStep({ name: "pick" });
    }
  }

  async function onSubmit(reading: Reading) {
    const totalCents = parseDollarsToCents(amount);
    if (totalCents === null) {
      setError("Enter the amount like 18.40");
      return;
    }
    setError(null);
    setStep({ name: "sending", reading });
    try {
      const res = await authFetch(`/api/orgs/${orgId}/reimburse/submit`, {
        method: "POST",
        body: JSON.stringify({ id: reading.id, totalCents, category }),
      });
      if (res.status === 409) {
        // Already sent (e.g. a double tap): it's in My requests.
        setStep({ name: "done", outcome: "pending", amount: showDollars(totalCents) });
        return;
      }
      if (!res.ok) throw new Error();
      const { status } = (await res.json()) as { status: Outcome };
      setStep({ name: "done", outcome: status, amount: showDollars(totalCents) });
    } catch {
      setError("We couldn't send your request. Try again.");
      setStep({ name: "confirm", reading });
    }
  }

  const edited =
    (step.name === "confirm" || step.name === "sending") &&
    (parseDollarsToCents(amount) !== step.reading.totalCents || category !== step.reading.category);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-12">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Get reimbursed</h1>
        <Link
          href={`/c/${orgId}`}
          className="shrink-0 rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          Cancel
        </Link>
      </div>

      {step.name === "pick" ? (
        <div className="flex flex-col gap-4">
          <label className="flex w-full cursor-pointer flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-brand-300 bg-brand-50 px-6 py-12 text-center hover:border-brand-500 dark:border-brand-700 dark:bg-brand-950/60 dark:hover:border-brand-500">
            <span aria-hidden className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-600 text-white dark:bg-brand-400 dark:text-brand-950">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
            <span>
              <span className="block font-display text-xl font-semibold">Snap or choose a receipt</span>
              <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">Opens your camera or photos</span>
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
          </label>
          <ol className="grid grid-cols-3 gap-2 text-center text-xs text-zinc-600 dark:text-zinc-400">
            {["Photo the whole receipt", "Check what we read", "Get paid, usually in seconds"].map((t, i) => (
              <li key={t} className="flex flex-col items-center gap-1.5">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-200 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
        </div>
      ) : step.name === "reading" ? (
        <div role="status" className="flex flex-col items-center gap-5 py-8">
          <div
            aria-hidden
            className="receipt-scan relative w-40 overflow-hidden bg-white px-4 pt-5 pb-7 shadow-[0_18px_40px_-20px_rgb(13_18_16/0.45)] dark:bg-zinc-800"
          >
            {[70, 90, 55, 80, 40, 85].map((w, i) => (
              <span key={i} className="mb-2.5 block h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700" style={{ width: `${w}%` }} />
            ))}
            <span className="mt-4 ml-auto block h-2.5 w-1/2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          </div>
          <p className="font-medium">Reading your receipt…</p>
        </div>
      ) : step.name === "confirm" || step.name === "sending" ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(step.reading);
          }}
        >
          {!step.reading.isReceipt && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              This doesn&apos;t look like a receipt. You can still send it, and the treasurer will take a look.
            </p>
          )}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">We read</p>
            {/* Receipt text is untrusted: shown as plain text only. */}
            <p className="mt-1 font-medium">{step.reading.summary}</p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {step.reading.vendor ?? "Unknown store"} · {step.reading.date ?? "no date found"}
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Amount</span>
            <div className="flex items-center rounded-xl border border-zinc-300 bg-white px-4 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15 dark:border-zinc-700 dark:bg-zinc-900">
              <span className="text-zinc-500">$</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent px-2 py-3 font-display text-2xl font-semibold tabular-nums outline-none"
                aria-label="Amount in dollars"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {step.reading.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {edited && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              You changed what we read, so the treasurer will double-check it before you&apos;re paid.
            </p>
          )}

          <button
            type="submit"
            disabled={step.name === "sending"}
            className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-brand-400 dark:hover:bg-brand-300 dark:text-brand-950"
          >
            {step.name === "sending" ? "Sending…" : "Looks right, send it"}
          </button>
          <button
            type="button"
            disabled={step.name === "sending"}
            onClick={() => setStep({ name: "pick" })}
            className="text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-brand-300"
          >
            Retake photo
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <Result outcome={step.outcome} amount={step.amount} />
          <Link
            href={`/c/${orgId}`}
            className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-3 text-center text-base font-medium text-white dark:bg-brand-400 dark:hover:bg-brand-300 dark:text-brand-950"
          >
            Done
          </Link>
          <button
            type="button"
            onClick={() => setStep({ name: "pick" })}
            className="text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-brand-300"
          >
            Submit another receipt
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </main>
  );
}

// The result after sending, in the same words as the status line on the
// home screen (Submitted -> Approved -> Paid, or Blocked).
function Result({ outcome, amount }: { outcome: Outcome; amount: string }) {
  const { step } = outcomeStep(outcome);
  if (step === "blocked") {
    return (
      <div className="rounded-3xl bg-red-50 px-5 py-6 text-center text-red-900 dark:bg-red-950 dark:text-red-200">
        <p className="font-display text-lg font-semibold">Blocked · waiting for the treasurer</p>
        <p className="mt-1">
          {PAYOUT_PROBLEM_REASON}. Your {amount} request is saved.
        </p>
      </div>
    );
  }
  if (step === "paid") {
    return (
      <div className="pop-in flex flex-col items-center gap-3 rounded-3xl bg-brand-700 px-5 py-8 text-center text-white dark:bg-brand-800">
        <span aria-hidden className="grid h-14 w-14 place-items-center rounded-full bg-gold-400 text-brand-950">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        <p className="text-brand-100">You&apos;ve been reimbursed</p>
        <p className="font-display text-5xl font-semibold tabular-nums">{amount}</p>
        <div className="mt-2 w-full rounded-2xl bg-white p-3 text-zinc-900">
          <StepBar current={step} />
        </div>
      </div>
    );
  }
  return (
    <div
      className={`flex flex-col gap-4 rounded-3xl px-5 py-6 ${
        step === "submitted"
          ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          : "bg-brand-50 text-brand-900 dark:bg-brand-950 dark:text-brand-100"
      }`}
    >
      <p className="text-center font-display text-lg font-semibold">
        {step === "approved"
          ? `Approved! Your ${amount} is on its way.`
          : `Submitted. Your ${amount} request is waiting for the treasurer.`}
      </p>
      <StepBar current={step} />
      {step === "submitted" && (
        <p className="text-center text-sm">
          The treasurer checks requests like this one. Follow it under My requests on the home screen.
        </p>
      )}
    </div>
  );
}
