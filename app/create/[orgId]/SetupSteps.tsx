"use client";

import { useSignTransaction } from "@privy-io/react-auth/solana";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { centsToInput, parseDollarsToCents } from "@/lib/orgs/onboarding";
import { DEFAULT_SETTINGS } from "@/lib/policy/rules";
import { useMemberAccount } from "@/lib/wallets/useMemberAccount";
import { InviteCard } from "../../_components/onboarding/InviteCard";
import { OnboardingGate } from "../../_components/onboarding/OnboardingGate";
import {
  errorText,
  inputClass,
  labelClass,
  mutedText,
  primaryButton,
  secondaryButton,
} from "../../_components/onboarding/styles";
import type { OnboardingMe } from "../../_components/onboarding/useMe";
import { useAuthFetch } from "../../_components/useAuthFetch";

// Three quick screens for a brand-new club (all changeable later in
// Settings): 1) dues, 2) spending rules, 3) invite members + budget.
// A new club starts with DEFAULT_SETTINGS, so that's what we prefill and
// compare against (only changed values are saved).

const DUES_LIMITS = { minCents: 100, maxCents: 100_000 }; // $1 – $1,000
const CAP_LIMITS = { minCents: 0, maxCents: 1_000_000 }; // $0 – $10,000
const DAILY_LIMITS = { minCents: 100, maxCents: 1_000_000 }; // $1 – $10,000

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export function SetupSteps() {
  const { orgId } = useParams<{ orgId: string }>();
  return <OnboardingGate>{(me) => <Setup orgId={orgId} me={me} />}</OnboardingGate>;
}

function Setup({ orgId, me }: { orgId: string; me: OnboardingMe }) {
  const club = me.clubs.find((c) => c.id === orgId && c.status === "active");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // What's saved so far (starts as the new-club defaults).
  const [saved, setSaved] = useState({
    duesAmountCents: DEFAULT_SETTINGS.duesAmountCents,
    duesPeriod: DEFAULT_SETTINGS.duesPeriod,
    autoApproveCapCents: DEFAULT_SETTINGS.autoApproveCapCents,
    dailyLimitCents: DEFAULT_SETTINGS.dailyAutoApproveLimitCents,
  });

  if (!club || club.role !== "treasurer") {
    return (
      <div className="flex flex-col gap-4">
        <p>Only the club&apos;s treasurer can set it up.</p>
        <Link href="/" className="underline">
          Go to my clubs
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className={`text-sm ${mutedText}`}>
          {club.name} · Step {step} of 3
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1 flex-1 rounded-full ${n <= step ? "bg-zinc-900 dark:bg-zinc-50" : "bg-zinc-200 dark:bg-zinc-800"}`}
            />
          ))}
        </div>
      </div>
      {step === 1 && (
        <DuesStep
          orgId={orgId}
          saved={saved}
          onDone={(dues) => {
            setSaved((s) => ({ ...s, ...dues }));
            setStep(2);
          }}
        />
      )}
      {step === 2 && (
        <SpendingStep
          orgId={orgId}
          saved={saved}
          onBack={() => setStep(1)}
          onDone={(rules) => {
            setSaved((s) => ({ ...s, ...rules }));
            setStep(3);
          }}
        />
      )}
      {step === 3 && <ReadyStep orgId={orgId} clubName={club.name} joinCode={club.joinCode ?? null} />}
    </div>
  );
}

type Saved = {
  duesAmountCents: number;
  duesPeriod: "semester" | "month";
  autoApproveCapCents: number;
  dailyLimitCents: number;
};

function useSaveSettings(orgId: string) {
  const authFetch = useAuthFetch();
  return async (patch: Record<string, unknown>): Promise<boolean> => {
    const res = await authFetch(`/api/orgs/${orgId}/settings`, { method: "PATCH", body: JSON.stringify(patch) });
    return res.ok;
  };
}

function DuesStep({
  orgId,
  saved,
  onDone,
}: {
  orgId: string;
  saved: Saved;
  onDone: (dues: Pick<Saved, "duesAmountCents" | "duesPeriod">) => void;
}) {
  const save = useSaveSettings(orgId);
  const [amount, setAmount] = useState(centsToInput(saved.duesAmountCents));
  const [period, setPeriod] = useState<Saved["duesPeriod"]>(saved.duesPeriod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(amount, DUES_LIMITS);
    if (cents === null) return setError("Enter dues between $1.00 and $1,000.00.");
    setError(null);
    if (cents === saved.duesAmountCents && period === saved.duesPeriod) return onDone({ duesAmountCents: cents, duesPeriod: period });
    setBusy(true);
    try {
      if (await save({ duesAmountCents: cents, duesPeriod: period })) onDone({ duesAmountCents: cents, duesPeriod: period });
      else setError("We couldn't save your dues. Try again.");
    } catch {
      setError("We couldn't save your dues. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dues</h1>
        <p className={`mt-1 ${mutedText}`}>How much does each member pay?</p>
      </div>
      <DollarInput label="Dues amount" value={amount} onChange={setAmount} />
      <fieldset className="flex flex-col gap-2">
        <legend className={`mb-1 ${labelClass}`}>How often</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["semester", "Each semester"],
              ["month", "Each month"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-xl border px-4 py-3 text-center ${
                period === value
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="period"
                value={value}
                checked={period === value}
                onChange={() => setPeriod(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Saving…" : "Next"}
      </button>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
    </form>
  );
}

function SpendingStep({
  orgId,
  saved,
  onBack,
  onDone,
}: {
  orgId: string;
  saved: Saved;
  onBack: () => void;
  onDone: (rules: Pick<Saved, "autoApproveCapCents" | "dailyLimitCents">) => void;
}) {
  const save = useSaveSettings(orgId);
  const authFetch = useAuthFetch();
  const account = useMemberAccount();
  const { signTransaction } = useSignTransaction();
  const [cap, setCap] = useState(centsToInput(saved.autoApproveCapCents));
  const [daily, setDaily] = useState(centsToInput(saved.dailyLimitCents));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capSaved, setCapSaved] = useState(saved.autoApproveCapCents);

  /** Change the daily total: the club's vault enforces it, so the treasurer's account approves it. */
  async function saveDailyLimit(cents: number): Promise<string | null> {
    const prep = await authFetch(`/api/orgs/${orgId}/settings/daily-limit/prepare`, {
      method: "POST",
      body: JSON.stringify({ cents }),
    });
    const p = (await prep.json().catch(() => ({}))) as { status?: string; changeId?: string; transaction?: string };
    if (!prep.ok || p.status !== "ready" || !p.changeId || !p.transaction) {
      return "We couldn't change the daily total. Try again in a minute.";
    }
    if (!account) return "Your account is still loading. Try again in a few seconds.";
    const { signedTransaction } = await signTransaction({
      transaction: fromBase64(p.transaction),
      wallet: account,
      chain: "solana:devnet",
    });
    const sub = await authFetch(`/api/orgs/${orgId}/settings/daily-limit/submit`, {
      method: "POST",
      body: JSON.stringify({ changeId: p.changeId, transaction: toBase64(signedTransaction) }),
    });
    const s = (await sub.json().catch(() => ({}))) as { status?: string };
    if (s.status === "done" || s.status === "processing") return null;
    if (s.status === "conflict") return "Something changed while you were saving. Try again.";
    return "We couldn't change the daily total. Try again.";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const capCents = parseDollarsToCents(cap, CAP_LIMITS);
    const dailyCents = parseDollarsToCents(daily, DAILY_LIMITS);
    if (capCents === null) return setError("Enter an amount between $0.00 and $10,000.00 for each receipt.");
    if (dailyCents === null) return setError("Enter a daily total between $1.00 and $10,000.00.");
    if (dailyCents < capCents) return setError("The daily total should be at least the amount for one receipt.");
    setError(null);
    setBusy(true);
    try {
      if (capCents !== capSaved) {
        if (!(await save({ autoApproveCapCents: capCents }))) {
          setError("We couldn't save the amount per receipt. Try again.");
          return;
        }
        setCapSaved(capCents);
      }
      if (dailyCents !== saved.dailyLimitCents) {
        const problem = await saveDailyLimit(dailyCents);
        if (problem) {
          setError(problem);
          return;
        }
      }
      onDone({ autoApproveCapCents: capCents, dailyLimitCents: dailyCents });
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Spending rules</h1>
        <p className={`mt-1 ${mutedText}`}>
          Small receipts that fit the budget are paid back instantly. Anything else comes to you to approve.
        </p>
      </div>
      <DollarInput
        label="Pay back instantly, up to (per receipt)"
        value={cap}
        onChange={setCap}
      />
      <DollarInput label="Most paid back instantly per day (whole club)" value={daily} onChange={setDaily} />
      <p className={`text-sm ${mutedText}`}>Suggested: $50.00 per receipt and $150.00 per day.</p>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Saving…" : "Next"}
      </button>
      <button type="button" onClick={onBack} disabled={busy} className={secondaryButton}>
        Back
      </button>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
    </form>
  );
}

function ReadyStep({ orgId, clubName, joinCode }: { orgId: string; clubName: string; joinCode: string | null }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{clubName} is ready</h1>
        <p className={`mt-1 ${mutedText}`}>
          Share the code or link with your members. You&apos;ll approve each person who asks to join.
        </p>
      </div>
      {joinCode && <InviteCard joinCode={joinCode} />}
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">Budget</h2>
        <p className={`text-sm ${mutedText}`}>
          Your club starts with budgets for food, travel, supplies, and events. You can change them now or later.
        </p>
      </div>
      <button type="button" onClick={() => router.push(`/c/${orgId}/treasurer/budget`)} className={primaryButton}>
        Set up the budget now
      </button>
      <button type="button" onClick={() => router.push(`/c/${orgId}/treasurer`)} className={secondaryButton}>
        Do this later
      </button>
    </div>
  );
}

function DollarInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-zinc-500">$</span>
        <input
          required
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pl-8 tabular-nums`}
        />
      </div>
    </label>
  );
}
