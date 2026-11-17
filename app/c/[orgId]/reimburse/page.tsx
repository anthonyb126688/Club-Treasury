"use client";

import { Camera, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { outcomeStep, PAYOUT_PROBLEM_REASON, type SubmitOutcome } from "@/lib/member/status";
import type { Category } from "@/lib/policy/rules";
import { parseDollarsToCents } from "@/lib/reimburse/decide";
import { useOrg } from "../../../_components/OrgProvider";
import { Button, ButtonLink } from "../../../_components/ui/Button";
import { GlassCard } from "../../../_components/ui/GlassCard";
import { useAuthFetch } from "../../../_components/useAuthFetch";
import { signalDataChanged } from "../../../_components/useLiveData";
import { headerAction, memberPage, PageHeader } from "../_components/PageHeader";
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
      signalDataChanged(); // balances, requests and charts refresh everywhere
    } catch {
      setError("We couldn't send your request. Try again.");
      setStep({ name: "confirm", reading });
    }
  }

  const edited =
    (step.name === "confirm" || step.name === "sending") &&
    (parseDollarsToCents(amount) !== step.reading.totalCents || category !== step.reading.category);

  return (
    <main className={memberPage}>
      <PageHeader
        title="Get reimbursed"
        action={
          step.name !== "done" && (
            <Link href={`/c/${orgId}`} className={headerAction}>
              Cancel
            </Link>
          )
        }
      />

      {step.name === "pick" ? (
        <div className="flex flex-col gap-4">
          <label className="glass flex w-full cursor-pointer flex-col items-center gap-4 rounded-[16px] border-dashed px-6 py-12 text-center hover:bg-white/70">
            <span aria-hidden className="grid h-16 w-16 place-items-center rounded-[18px] bg-ink text-white">
              <Camera size={30} strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-[20px] font-bold tracking-[-0.02em]">Snap or choose a receipt</span>
              <span className="mt-1 block text-[15px] text-muted">Opens your camera or photos</span>
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
          </label>
          <ol className="grid grid-cols-3 gap-2 text-center text-[12px] text-muted">
            {["Photo the whole receipt", "Check what we read", "Get paid, usually in seconds"].map((t, i) => (
              <li key={t} className="flex flex-col items-center gap-1.5">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-black/[0.07] font-semibold text-ink">
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
            className="receipt-scan relative w-40 overflow-hidden bg-white px-4 pt-5 pb-7 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.35)]"
          >
            {[70, 90, 55, 80, 40, 85].map((w, i) => (
              <span key={i} className="mb-2.5 block h-1.5 rounded-full bg-zinc-200" style={{ width: `${w}%` }} />
            ))}
            <span className="mt-4 ml-auto block h-2.5 w-1/2 rounded-full bg-zinc-300" />
          </div>
          <p className="text-[15px] font-semibold">Reading your receipt…</p>
        </div>
      ) : step.name === "confirm" || step.name === "sending" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(step.reading);
          }}
        >
          {!step.reading.isReceipt && (
            <p className="rounded-[12px] bg-warn/12 px-4 py-3 text-[13px] text-warn-text">
              This doesn&apos;t look like a receipt. You can still send it, and the treasurer will take a look.
            </p>
          )}
          <GlassCard>
            <p className="text-[13px] font-medium text-muted">We read</p>
            {/* Receipt text is untrusted: shown as plain text only. */}
            <p className="mt-1 text-[15px] font-medium">{step.reading.summary}</p>
            <p className="mt-2 text-[13px] text-muted">
              {step.reading.vendor ?? "Unknown store"} · {step.reading.date ?? "no date found"}
            </p>
          </GlassCard>

          <div className="glass overflow-hidden rounded-[16px]">
            <label className="flex items-center gap-3 px-4">
              <span className="w-20 shrink-0 text-[15px] font-medium">Amount</span>
              <span className="text-[22px] font-semibold text-muted">$</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent py-3 text-[22px] font-bold tabular-nums outline-none"
                aria-label="Amount in dollars"
              />
            </label>
            <label className="flex items-center gap-3 border-t border-black/[0.06] px-4">
              <span className="w-20 shrink-0 text-[15px] font-medium">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="min-h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              >
                {step.reading.categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {edited && (
            <p className="px-1 text-[13px] text-muted">
              You changed what we read, so the treasurer will double-check it before you&apos;re paid.
            </p>
          )}

          <Button type="submit" disabled={step.name === "sending"} className="w-full">
            {step.name === "sending" ? "Sending…" : "Looks right, send it"}
          </Button>
          <Button variant="plain" disabled={step.name === "sending"} onClick={() => setStep({ name: "pick" })} className="w-full">
            Retake photo
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <Result outcome={step.outcome} amount={step.amount} />
          <ButtonLink href={`/c/${orgId}`} className="w-full">
            Done
          </ButtonLink>
          <Button variant="plain" onClick={() => setStep({ name: "pick" })} className="w-full">
            Submit another receipt
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-[12px] bg-alert/10 px-4 py-3 text-[13px] font-medium text-alert">
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
      <GlassCard className="text-center">
        <p className="text-[17px] font-semibold text-alert">Blocked · waiting for the treasurer</p>
        <p className="mt-1 text-[15px] text-zinc-700">
          {PAYOUT_PROBLEM_REASON}. Your {amount} request is saved.
        </p>
      </GlassCard>
    );
  }
  if (step === "paid") {
    return (
      <div className="pop-in flex flex-col items-center gap-3 rounded-[22px] bg-ink px-5 py-8 text-center text-white shadow-[0_20px_40px_-20px_rgb(0_0_0/0.5)]">
        <span aria-hidden className="grid h-14 w-14 place-items-center rounded-full bg-white text-ink">
          <Check size={30} strokeWidth={2.5} />
        </span>
        <p className="text-[15px] text-white/70">You&apos;ve been reimbursed</p>
        <p className="text-[48px] leading-none font-bold tracking-[-0.03em] tabular-nums">{amount}</p>
        <div className="mt-3 w-full">
          <StepBar current={step} inverted />
        </div>
      </div>
    );
  }
  return (
    <GlassCard className="flex flex-col gap-4">
      <p className="text-center text-[17px] font-semibold">
        {step === "approved"
          ? `Approved! Your ${amount} is on its way.`
          : `Submitted. Your ${amount} request is waiting for the treasurer.`}
      </p>
      <StepBar current={step} />
      {step === "submitted" && (
        <p className="text-center text-[13px] text-muted">
          The treasurer checks requests like this one. Follow it under My requests on the home screen.
        </p>
      )}
    </GlassCard>
  );
}
