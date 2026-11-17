"use client";

import { useSignTransaction } from "@privy-io/react-auth/solana";
import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  centsToInput,
  MAX_RECEIPT_AGE_DAYS,
  parseDollars,
  settingsPreview,
  type PreviewSettings,
} from "@/lib/budget/settings";
import { useMemberAccount } from "@/lib/wallets/useMemberAccount";
import { useOrg } from "../../../../_components/OrgProvider";
import { useAuthFetch } from "../../../../_components/useAuthFetch";

// Club settings: dues, the instant-payout rules, and the join code. Changes
// apply to the next receipt the policy checks. The daily limit also lives in
// the club's vault, so changing it needs one silent approval by the
// treasurer's own account (prepare → approve → submit). Treasurer only.

type Settings = PreviewSettings;
type Loaded = { settings: Settings; joinCode: string; vaultReady: boolean };

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const inputClass =
  "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-brand-400";
const primaryButton =
  "rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-brand-400 dark:hover:bg-brand-300 dark:text-brand-950";
const secondaryButton = "rounded-xl border border-zinc-300 px-4 py-2 font-medium disabled:opacity-50 dark:border-zinc-700";

const noSubscribe = () => () => {};

function parseDays(input: string): number | null {
  if (!/^\d{1,3}$/.test(input.trim())) return null;
  const n = Number(input.trim());
  return n >= 1 && n <= MAX_RECEIPT_AGE_DAYS ? n : null;
}

export default function SettingsPage() {
  const { orgId, isTreasurer } = useOrg();
  const authFetch = useAuthFetch();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Form fields, as typed.
  const [dues, setDues] = useState("");
  const [duesPeriod, setDuesPeriod] = useState<"semester" | "month">("semester");
  const [cap, setCap] = useState("");
  const [days, setDays] = useState("");
  const [daily, setDaily] = useState("");

  const fill = useCallback((s: Settings) => {
    setDues(centsToInput(s.duesAmountCents));
    setDuesPeriod(s.duesPeriod);
    setCap(centsToInput(s.autoApproveCapCents));
    setDays(String(s.maxReceiptAgeDays));
    setDaily(centsToInput(s.dailyAutoApproveLimitCents));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/orgs/${orgId}/settings`);
      if (!res.ok) {
        setProblem(res.status === 403 ? "forbidden" : "failed");
        return;
      }
      const body = (await res.json()) as Loaded;
      setLoaded(body);
      fill(body.settings);
      setProblem(null);
    } catch {
      setProblem("failed");
    }
  }, [authFetch, orgId, fill]);

  useEffect(() => {
    if (!isTreasurer) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [isTreasurer, load]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pb-12 *:max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <Link href={`/c/${orgId}/treasurer`} className="text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-brand-300">
          Treasurer
        </Link>
      </div>

      {!isTreasurer || problem === "forbidden" ? (
        <p>This page is for the club treasurer.</p>
      ) : !loaded ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {problem === "failed" ? "We couldn't load the settings. Refresh to try again." : "Loading…"}
        </p>
      ) : (
        <SettingsForm
          orgId={orgId}
          loaded={loaded}
          fields={{ dues, duesPeriod, cap, days, daily }}
          set={{ setDues, setDuesPeriod, setCap, setDays, setDaily }}
          onSaved={(settings) => setLoaded((l) => (l ? { ...l, settings } : l))}
          onJoinCode={(joinCode) => setLoaded((l) => (l ? { ...l, joinCode } : l))}
          reload={load}
        />
      )}
    </main>
  );
}

type Fields = { dues: string; duesPeriod: "semester" | "month"; cap: string; days: string; daily: string };
type Setters = {
  setDues: (v: string) => void;
  setDuesPeriod: (v: "semester" | "month") => void;
  setCap: (v: string) => void;
  setDays: (v: string) => void;
  setDaily: (v: string) => void;
};

function SettingsForm({
  orgId,
  loaded,
  fields,
  set,
  onSaved,
  onJoinCode,
  reload,
}: {
  orgId: string;
  loaded: Loaded;
  fields: Fields;
  set: Setters;
  onSaved: (s: Settings) => void;
  onJoinCode: (code: string) => void;
  reload: () => Promise<void>;
}) {
  const authFetch = useAuthFetch();
  const account = useMemberAccount();
  const { signTransaction } = useSignTransaction();
  const saved = loaded.settings;

  const duesCents = parseDollars(fields.dues);
  const capCents = parseDollars(fields.cap);
  const receiptDays = parseDays(fields.days);
  const dailyCents = parseDollars(fields.daily);

  // The preview uses what's typed when it's valid, otherwise what's saved.
  const preview = settingsPreview({
    duesAmountCents: duesCents !== null && duesCents > 0 ? duesCents : saved.duesAmountCents,
    duesPeriod: fields.duesPeriod,
    autoApproveCapCents: capCents ?? saved.autoApproveCapCents,
    dailyAutoApproveLimitCents: dailyCents ?? saved.dailyAutoApproveLimitCents,
    maxReceiptAgeDays: receiptDays ?? saved.maxReceiptAgeDays,
  });

  // ---- Dues / cap / receipt age (a plain save) ----
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const changes: Record<string, number | string> = {};
  if (duesCents !== null && duesCents !== saved.duesAmountCents) changes.duesAmountCents = duesCents;
  if (fields.duesPeriod !== saved.duesPeriod) changes.duesPeriod = fields.duesPeriod;
  if (capCents !== null && capCents !== saved.autoApproveCapCents) changes.autoApproveCapCents = capCents;
  if (receiptDays !== null && receiptDays !== saved.maxReceiptAgeDays) changes.maxReceiptAgeDays = receiptDays;

  const fieldErrors = {
    dues: duesCents === null || duesCents <= 0 ? "Enter the dues in dollars, like 25." : null,
    cap: capCents === null ? "Enter an amount in dollars, like 50 (0 turns instant payouts off)." : null,
    days: receiptDays === null ? `Enter a number of days from 1 to ${MAX_RECEIPT_AGE_DAYS}.` : null,
    daily: dailyCents === null ? "Enter an amount in dollars, like 150." : null,
  };
  const formValid = !fieldErrors.dues && !fieldErrors.cap && !fieldErrors.days;

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await authFetch(`/api/orgs/${orgId}/settings`, { method: "PATCH", body: JSON.stringify(changes) });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { settings: Settings };
      onSaved(body.settings);
      setSaveMsg({ ok: true, text: "Saved. New receipts use these settings right away." });
    } catch {
      setSaveMsg({ ok: false, text: "That didn't save. Check the amounts and try again." });
    } finally {
      setSaving(false);
    }
  }

  // ---- Daily limit (needs the treasurer's silent approval) ----
  const [dailyStep, setDailyStep] = useState<null | "preparing" | "approving" | "saving">(null);
  const [dailyMsg, setDailyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dailyChanged = dailyCents !== null && dailyCents !== saved.dailyAutoApproveLimitCents;

  async function saveDailyLimit() {
    if (dailyCents === null) return;
    setDailyMsg(null);
    try {
      setDailyStep("preparing");
      const prep = await authFetch(`/api/orgs/${orgId}/settings/daily-limit/prepare`, {
        method: "POST",
        body: JSON.stringify({ cents: dailyCents }),
      });
      const p = (await prep.json().catch(() => ({}))) as { status?: string; changeId?: string; transaction?: string };
      if (p.status === "not_ready") {
        return setDailyMsg({ ok: false, text: "The club's vault isn't set up yet, so the limit can't change." });
      }
      if (!prep.ok || p.status !== "ready" || !p.changeId || !p.transaction) {
        return setDailyMsg({ ok: false, text: "We couldn't start the change. Try again in a moment." });
      }
      if (!account) {
        return setDailyMsg({ ok: false, text: "Your account isn't ready yet. Refresh the page and try again." });
      }

      setDailyStep("approving");
      const { signedTransaction } = await signTransaction({
        transaction: fromBase64(p.transaction),
        wallet: account,
        chain: "solana:devnet",
      });

      setDailyStep("saving");
      const sub = await authFetch(`/api/orgs/${orgId}/settings/daily-limit/submit`, {
        method: "POST",
        body: JSON.stringify({ changeId: p.changeId, transaction: toBase64(signedTransaction) }),
      });
      const s = (await sub.json().catch(() => ({}))) as { status?: string };
      if (s.status === "done") {
        setDailyMsg({ ok: true, text: "Done. The club's daily limit is updated." });
        await reload();
      } else if (s.status === "processing") {
        setDailyMsg({ ok: true, text: "Almost done. The new limit will show here in a minute; refresh to check." });
      } else if (s.status === "conflict") {
        setDailyMsg({ ok: false, text: "That change was already used or doesn't match. Try again." });
      } else {
        setDailyMsg({ ok: false, text: "The limit didn't change. Nothing was updated; try again." });
      }
    } catch {
      setDailyMsg({ ok: false, text: "The approval didn't finish. Nothing was changed; try again." });
    } finally {
      setDailyStep(null);
    }
  }

  const dailyButton =
    dailyStep === "preparing"
      ? "Getting ready…"
      : dailyStep === "approving"
        ? "Approving…"
        : dailyStep === "saving"
          ? "Saving…"
          : "Update daily limit";

  return (
    <>
      <section className="rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-900" aria-live="polite">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">What this means</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {preview.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Anything else, and every &quot;Other&quot; receipt, goes to you to approve.{" "}
          <Link href={`/c/${orgId}/treasurer/budget`} className="underline decoration-zinc-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500 dark:decoration-zinc-600 dark:hover:text-brand-300">
            Category budgets
          </Link>
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Dues and instant payouts</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dues amount ($)" error={fieldErrors.dues}>
            <input className={inputClass} inputMode="decimal" value={fields.dues} onChange={(e) => set.setDues(e.target.value)} />
          </Field>
          <Field label="Dues are paid">
            <select
              className={inputClass}
              value={fields.duesPeriod}
              onChange={(e) => set.setDuesPeriod(e.target.value as "semester" | "month")}
            >
              <option value="semester">Once a semester</option>
              <option value="month">Once a month</option>
            </select>
          </Field>
          <Field
            label="Pay receipts instantly up to ($)"
            hint="Bigger receipts go to you."
            error={fieldErrors.cap}
          >
            <input className={inputClass} inputMode="decimal" value={fields.cap} onChange={(e) => set.setCap(e.target.value)} />
          </Field>
          <Field label="Oldest receipt accepted (days)" hint="Older receipts go to you." error={fieldErrors.days}>
            <input className={inputClass} inputMode="numeric" value={fields.days} onChange={(e) => set.setDays(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={primaryButton}
            disabled={saving || !formValid || Object.keys(changes).length === 0}
            onClick={save}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saveMsg && (
            <p role="status" className={`text-sm ${saveMsg.ok ? "text-brand-700 dark:text-brand-300" : "text-red-600 dark:text-red-400"}`}>
              {saveMsg.text}
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Daily safety limit</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The most the club pays out automatically in one day. This limit is locked into the club&apos;s vault on
          the blockchain: even if our server were hacked, it couldn&apos;t pay out more than this a day. Changing it
          takes one tap; your account approves it in the background.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-56">
            <Field label="Daily limit ($)" error={fieldErrors.daily}>
              <input
                className={inputClass}
                inputMode="decimal"
                value={fields.daily}
                disabled={dailyStep !== null}
                onChange={(e) => set.setDaily(e.target.value)}
              />
            </Field>
          </div>
          <button
            type="button"
            className={primaryButton}
            disabled={!loaded.vaultReady || !dailyChanged || dailyStep !== null}
            onClick={saveDailyLimit}
          >
            {dailyButton}
          </button>
        </div>
        {!loaded.vaultReady && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            The club&apos;s vault is still being set up. You can change the daily limit once it&apos;s ready.
          </p>
        )}
        {dailyMsg && (
          <p role="status" className={`text-sm ${dailyMsg.ok ? "text-brand-700 dark:text-brand-300" : "text-red-600 dark:text-red-400"}`}>
            {dailyMsg.text}
          </p>
        )}
      </section>

      <JoinCodeSection orgId={orgId} joinCode={loaded.joinCode} onJoinCode={onJoinCode} />
    </>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error ? (
        <span className="text-red-600 dark:text-red-400">{error}</span>
      ) : (
        hint && <span className="text-zinc-600 dark:text-zinc-400">{hint}</span>
      )}
    </label>
  );
}

function JoinCodeSection({
  orgId,
  joinCode,
  onJoinCode,
}: {
  orgId: string;
  joinCode: string;
  onJoinCode: (code: string) => void;
}) {
  const authFetch = useAuthFetch();
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const link = origin ? `${origin}/join/${joinCode}` : "";

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    QRCode.toDataURL(link, { margin: 1, width: 240 })
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setQr(null));
    return () => {
      cancelled = true;
    };
  }, [link]);

  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 5000);
    return () => clearTimeout(t);
  }, [confirm]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy(what: "code" | "link", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setMsg({ ok: false, text: "Couldn't copy. Select the text and copy it yourself." });
    }
  }

  async function regenerate() {
    if (!confirm) return setConfirm(true);
    setBusy(true);
    setMsg(null);
    try {
      const res = await authFetch(`/api/orgs/${orgId}/join-code/regenerate`, { method: "POST" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { joinCode: string };
      onJoinCode(body.joinCode);
      setMsg({ ok: true, text: "New code ready. The old code and link no longer work." });
    } catch {
      setMsg({ ok: false, text: "We couldn't make a new code. Try again." });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Invite members</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Share the code or link. New members show up for you to approve.
      </p>
      <div className="flex flex-col gap-4 rounded-2xl bg-zinc-100 p-4 sm:flex-row sm:items-center dark:bg-zinc-900">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-3xl font-semibold tracking-wider">{joinCode}</span>
            <button type="button" className={secondaryButton} onClick={() => copy("code", joinCode)}>
              {copied === "code" ? "Copied" : "Copy code"}
            </button>
          </div>
          {link && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 break-all text-sm text-zinc-700 dark:text-zinc-300">{link}</span>
              <button type="button" className={secondaryButton} onClick={() => copy("link", link)}>
                {copied === "link" ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className={
                confirm
                  ? "self-start rounded-xl bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-50"
                  : `self-start ${secondaryButton}`
              }
              disabled={busy}
              onClick={regenerate}
            >
              {busy ? "Making a new code…" : confirm ? "Tap again to replace the code" : "Make a new code"}
            </button>
            {confirm && (
              <span className="text-sm text-amber-700 dark:text-amber-300">
                The current code and invite link will stop working.
              </span>
            )}
          </div>
        </div>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing to optimize
          <img src={qr} alt="QR code for the invite link" width={160} height={160} className="self-center rounded-xl bg-white p-2" />
        )}
      </div>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-brand-700 dark:text-brand-300" : "text-red-600 dark:text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
