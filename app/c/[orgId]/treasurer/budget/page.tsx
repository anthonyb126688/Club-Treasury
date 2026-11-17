"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { centsToInput, parseDollars } from "@/lib/budget/settings";
import { perPeriod } from "@/lib/dues/period";
import { formatCents } from "@/lib/money";
import { useOrg } from "../../../../_components/OrgProvider";
import { useAuthFetch } from "../../../../_components/useAuthFetch";
import { PageHeader, treasurerPage } from "../../_components/PageHeader";

// Budget builder: the club's categories, how much each may spend per month or
// semester, and what's been spent so far. The reimbursement policy reads
// these same budgets for every new receipt. Treasurer only.

type Period = "month" | "semester";

type Category = {
  id: string;
  name: string;
  slug: string;
  budgetCents: number;
  period: Period;
  archived: boolean;
  spentCents: number;
  remainingCents: number;
  overCents: number;
  percentUsed: number;
  alwaysReviewed: boolean;
};

const ERRORS: Record<string, string> = {
  bad_name: "Use letters or numbers in the name.",
  reserved: "Every club already has an \"Other\" category.",
  name_taken: "There's already a category with that name.",
  not_found: "That category was removed. Refresh the page.",
  cant_archive_other: "\"Other\" can't be archived.",
  bad_request: "Check the name (up to 40 characters) and the amount.",
};

const errorText = (code: string | undefined) => (code && ERRORS[code]) || "That didn't work. Try again.";

const inputClass =
  "min-h-11 rounded-[12px] border-[0.5px] border-black/10 bg-white/80 px-3 text-[15px] outline-none focus:border-ink focus:ring-2 focus:ring-black/10";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-[12px] bg-ink px-4 text-[15px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-40";
const secondaryButton =
  "glass inline-flex min-h-11 items-center justify-center rounded-[12px] px-4 text-[15px] font-semibold text-ink hover:bg-white/80 disabled:opacity-40";

export default function BudgetPage() {
  const { orgId, isTreasurer } = useOrg();
  const authFetch = useAuthFetch();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/orgs/${orgId}/categories`);
      if (!res.ok) {
        setProblem(res.status === 403 ? "forbidden" : "failed");
        return;
      }
      const body = (await res.json()) as { categories: Category[] };
      setCategories(body.categories);
      setProblem(null);
    } catch {
      setProblem("failed");
    }
  }, [authFetch, orgId]);

  useEffect(() => {
    if (!isTreasurer) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [isTreasurer, load]);

  async function send(path: string, method: string, body?: unknown): Promise<string | null> {
    try {
      const res = await authFetch(`/api/orgs/${orgId}/categories${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) {
        await load();
        return null;
      }
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      return errorText(b.error);
    } catch {
      return errorText(undefined);
    }
  }

  const active = categories?.filter((c) => !c.archived) ?? [];
  const archived = categories?.filter((c) => c.archived) ?? [];

  return (
    <main className={`${treasurerPage} *:max-w-3xl`}>
      <PageHeader title="Budget" />

      {!isTreasurer || problem === "forbidden" ? (
        <p>This page is for the club treasurer.</p>
      ) : !categories ? (
        <p className="text-muted">
          {problem === "failed" ? "We couldn't load the budget. Refresh to try again." : "Loading…"}
        </p>
      ) : (
        <>
          <p className="text-[13px] text-muted">
            Small receipts are paid instantly only while their category has budget left. A receipt that would go
            over budget goes to you instead. A category with a $0.00 budget sends everything in it to you.
          </p>

          {notice && (
            <p role="status" className="glass rounded-[12px] px-4 py-3 text-[13px]">
              {notice}
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {active.map((c) => (
              <CategoryCard
                key={c.id}
                category={c}
                onSave={async (patch) => {
                  const err = await send(`/${c.id}`, "PATCH", patch);
                  setNotice(err ?? `Saved ${patch.name ?? c.name}.`);
                  return err;
                }}
                onArchive={async () => {
                  const err = await send(`/${c.id}`, "DELETE");
                  setNotice(err ?? `Archived ${c.name}. Past requests keep this category.`);
                }}
              />
            ))}
          </ul>

          <AddCategory
            onAdd={async (input) => {
              const err = await send("", "POST", input);
              setNotice(err ?? `Added ${input.name}.`);
              return err;
            }}
          />

          {archived.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[17px] font-semibold">Archived</h2>
              <p className="text-[13px] text-muted">
                Members can&apos;t choose these any more. Past requests keep them. Adding a category with the same
                name brings it back.
              </p>
              <ul className="flex flex-wrap gap-2">
                {archived.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-full bg-black/[0.06] px-3 py-1 text-[13px] text-zinc-600"
                  >
                    {c.name}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

type Patch = { name?: string; budgetCents?: number; period?: Period };

function CategoryCard({
  category: c,
  onSave,
  onArchive,
}: {
  category: Category;
  onSave: (patch: Patch) => Promise<string | null>;
  onArchive: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(c.name);
  const [amount, setAmount] = useState(centsToInput(c.budgetCents));
  const [period, setPeriod] = useState<Period>(c.period);
  const [error, setError] = useState<string | null>(null);

  // The second tap must come soon after the first.
  useEffect(() => {
    if (!confirmArchive) return;
    const t = setTimeout(() => setConfirmArchive(false), 5000);
    return () => clearTimeout(t);
  }, [confirmArchive]);

  function startEditing() {
    setName(c.name);
    setAmount(centsToInput(c.budgetCents));
    setPeriod(c.period);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const cents = parseDollars(amount);
    if (!name.trim()) return setError("Give the category a name.");
    if (cents === null) return setError("Enter the budget in dollars, like 200 or 150.50.");
    const patch: Patch = {};
    if (name.trim() !== c.name) patch.name = name.trim();
    if (cents !== c.budgetCents) patch.budgetCents = cents;
    if (period !== c.period) patch.period = period;
    if (Object.keys(patch).length === 0) return setEditing(false);
    setBusy(true);
    const err = await onSave(patch);
    setBusy(false);
    if (err) setError(err);
    else setEditing(false);
  }

  async function archive() {
    if (!confirmArchive) return setConfirmArchive(true);
    setBusy(true);
    await onArchive();
    setBusy(false);
    setConfirmArchive(false);
  }

  const over = c.overCents > 0;
  return (
    <li className="glass flex flex-col gap-4 rounded-[16px] p-4 sm:p-5">
      {editing ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-[13px] font-medium">
            Name
            <input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium sm:w-36">
            Budget ($)
            <input
              className={inputClass}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium sm:w-36">
            Resets
            <select className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="month">Every month</option>
              <option value="semester">Every semester</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" className={primaryButton} disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[17px] font-semibold">{c.name}</p>
            <p className="text-[13px] text-muted">
              {c.alwaysReviewed
                ? "Always reviewed by you. Never paid instantly."
                : `${formatCents(c.budgetCents)} ${perPeriod(c.period)}`}
            </p>
          </div>
          {!c.alwaysReviewed && (
            <div className="flex gap-2">
              <button type="button" className={secondaryButton} disabled={busy} onClick={startEditing}>
                Edit
              </button>
              <button
                type="button"
                className={
                  confirmArchive
                    ? "inline-flex min-h-11 items-center justify-center rounded-[12px] bg-alert px-4 text-[15px] font-semibold text-white disabled:opacity-40"
                    : secondaryButton
                }
                disabled={busy}
                onClick={archive}
              >
                {busy && confirmArchive ? "Archiving…" : confirmArchive ? "Tap again to archive" : "Archive"}
              </button>
            </div>
          )}
        </div>
      )}

      {!c.alwaysReviewed && (
        <>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-black/[0.08]"
            role="progressbar"
            aria-valuenow={c.percentUsed}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${c.name} budget used`}
          >
            <div
              className={`h-full rounded-full ${over || c.percentUsed >= 100 ? "bg-alert" : "bg-ink"}`}
              style={{ width: `${c.percentUsed}%` }}
            />
          </div>
          <p className="text-[13px] tabular-nums text-zinc-700">
            {formatCents(c.spentCents)} spent this {c.period} ·{" "}
            {over ? (
              <span className="font-medium text-alert">{formatCents(c.overCents)} over</span>
            ) : (
              `${formatCents(c.remainingCents)} left`
            )}
          </p>
          {c.budgetCents === 0 && (
            <p className="text-[13px] text-warn-text">
              This category has a $0.00 budget, so every receipt in it goes to you.
            </p>
          )}
        </>
      )}

      {error && <p className="text-[13px] text-alert">{error}</p>}
    </li>
  );
}

function AddCategory({ onAdd }: { onAdd: (input: { name: string; budgetCents: number; period: Period }) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollars(amount || "0");
    if (!name.trim()) return setError("Give the category a name.");
    if (cents === null) return setError("Enter the budget in dollars, like 200 or 150.50.");
    setBusy(true);
    setError(null);
    const err = await onAdd({ name: name.trim(), budgetCents: cents, period });
    setBusy(false);
    if (err) return setError(err);
    setName("");
    setAmount("");
  }

  return (
    <form onSubmit={add} className="glass flex flex-col gap-4 rounded-[16px] p-4 sm:p-5">
      <h2 className="text-[17px] font-semibold">Add a category</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-[13px] font-medium">
          Name
          <input
            className={inputClass}
            placeholder="e.g. Club T-shirts"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium sm:w-36">
          Budget ($)
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium sm:w-36">
          Resets
          <select className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="month">Every month</option>
            <option value="semester">Every semester</option>
          </select>
        </label>
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="text-[13px] text-alert">{error}</p>}
    </form>
  );
}
