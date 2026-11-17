"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useState } from "react";
import type { Category } from "@/lib/policy/rules";
import { parseDollarsToCents } from "@/lib/reimburse/decide";
import { useOrg } from "../../../_components/OrgProvider";
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

type Outcome = "reimbursed" | "paying" | "pending" | "delayed";

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
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { orgId } = useOrg();
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
      const res = await fetch(`/api/orgs/${orgId}/reimburse/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
        body: form,
      });
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
      const res = await fetch(`/api/orgs/${orgId}/reimburse/submit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: reading.id, totalCents, category }),
      });
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Get reimbursed</h1>
        <Link href={`/c/${orgId}`} className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      {!ready ? (
        <p className="text-zinc-600 dark:text-zinc-400">Loading…</p>
      ) : !authenticated ? (
        <p>
          <Link href="/" className="underline">
            Log in
          </Link>{" "}
          to get reimbursed.
        </p>
      ) : step.name === "pick" ? (
        <div className="flex flex-col gap-4">
          <p className="text-zinc-600 dark:text-zinc-400">
            Take a clear photo of the whole receipt. We&apos;ll read it for you.
          </p>
          <label className="w-full cursor-pointer rounded-xl bg-zinc-900 px-4 py-3 text-center text-base font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
            Snap or choose a receipt
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
        <p className="rounded-xl bg-zinc-100 px-4 py-6 text-center text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
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
          {step.outcome === "reimbursed" ? (
            <p className="rounded-xl bg-green-50 px-4 py-6 text-center text-lg font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
              ✓ You&apos;ve been reimbursed {step.amount}
            </p>
          ) : step.outcome === "paying" ? (
            <p className="rounded-xl bg-green-50 px-4 py-6 text-center text-lg font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
              Approved! Your {step.amount} is on its way.
            </p>
          ) : step.outcome === "pending" ? (
            <p className="rounded-xl bg-amber-50 px-4 py-6 text-center text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <span className="block text-lg font-medium">Pending</span>
              Your {step.amount} request was sent to the treasurer for review.
            </p>
          ) : (
            <p className="rounded-xl bg-amber-50 px-4 py-6 text-center text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Approved, but your {step.amount} payout is delayed. The treasurer can retry it.
            </p>
          )}
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
