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
        <Link href={`/c/${orgId}`} className="shrink-0 py-1 text-sm text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      {step.name === "pick" ? (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-2 text-zinc-600 dark:text-zinc-400">
            <li>1. Take a clear photo of the whole receipt.</li>
            <li>2. Check what we read.</li>
            <li>3. Get paid back, usually in seconds.</li>
          </ol>
          <label className="flex w-full cursor-pointer flex-col items-center rounded-2xl bg-zinc-900 px-4 py-6 text-center text-white active:opacity-90 dark:bg-zinc-50 dark:text-zinc-900">
            <span className="text-xl font-semibold">Snap or choose a receipt</span>
            <span className="mt-1 text-sm opacity-80">Opens your camera or photos</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
          </label>
        </div>
      ) : step.name === "reading" ? (
        <p
          role="status"
          className="animate-pulse rounded-2xl bg-zinc-100 px-4 py-10 text-center text-lg text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          Reading your receipt…
        </p>
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
          <div className="rounded-2xl bg-zinc-100 p-5 dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">We read</p>
            {/* Receipt text is untrusted: shown as plain text only. */}
            <p className="mt-1 font-medium">{step.reading.summary}</p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {step.reading.vendor ?? "Unknown store"} · {step.reading.date ?? "no date found"}
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Amount</span>
            <div className="flex items-center rounded-xl border border-zinc-300 px-3 dark:border-zinc-700">
              <span className="text-zinc-500">$</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent px-2 py-3 text-lg tabular-nums outline-none"
                aria-label="Amount in dollars"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="rounded-xl border border-zinc-300 bg-transparent px-3 py-3 text-base dark:border-zinc-700"
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
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {step.name === "sending" ? "Sending…" : "Looks right, send it"}
          </button>
          <button
            type="button"
            disabled={step.name === "sending"}
            onClick={() => setStep({ name: "pick" })}
            className="text-sm text-zinc-600 underline dark:text-zinc-400"
          >
            Retake photo
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <Result outcome={step.outcome} amount={step.amount} />
          <Link
            href={`/c/${orgId}`}
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-center text-base font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Done
          </Link>
          <button
            type="button"
            onClick={() => setStep({ name: "pick" })}
            className="text-sm text-zinc-600 underline dark:text-zinc-400"
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
      <div className="rounded-2xl bg-red-50 px-4 py-6 text-center text-red-900 dark:bg-red-950 dark:text-red-200">
        <p className="text-lg font-semibold">Blocked · waiting for the treasurer</p>
        <p className="mt-1">
          {PAYOUT_PROBLEM_REASON}. Your {amount} request is saved.
        </p>
      </div>
    );
  }
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl px-4 py-6 ${
        step === "submitted"
          ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          : "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200"
      }`}
    >
      <p className="text-center text-lg font-semibold">
        {step === "paid"
          ? `✓ You've been reimbursed ${amount}`
          : step === "approved"
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
