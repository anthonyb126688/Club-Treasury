"use client";

import { useEffect, useState } from "react";
import { isInProgress, type StatusLine } from "@/lib/member/status";
import { StepBar } from "../c/[orgId]/_components/StepBar";
import { useAuthFetch } from "./useAuthFetch";

type Item = {
  id: string;
  vendor: string | null;
  amount: string | null;
  date: string; // when it was sent
  receiptDate: string | null; // YYYY-MM-DD from the receipt
  line: StatusLine | null;
};

function showDate(item: Item): string {
  const d = item.receiptDate ? new Date(`${item.receiptDate}T12:00:00Z`) : new Date(item.date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: item.receiptDate ? "UTC" : undefined });
}

// "My requests" on the club home: each request with a simple status line
// (Submitted → Approved → Paid, or Blocked / Denied with the reason).
// Checks back while anything is still moving.
export function ReimbursementHistory({ orgId, onChange }: { orgId: string; onChange?: () => void }) {
  const authFetch = useAuthFetch();
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastKey = "";

    async function load() {
      try {
        const res = await authFetch(`/api/orgs/${orgId}/reimburse`);
        if (cancelled) return;
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { requests: Item[] };
        if (cancelled) return;
        const list = body.requests.filter((r) => r.line !== null);
        setItems(list);
        setFailed(false);
        const key = list.map((r) => JSON.stringify(r.line)).join("|");
        if (lastKey && key !== lastKey) onChange?.(); // e.g. a payout landed: refresh balances
        lastKey = key;
        const moving = list.filter((r) => r.line && isInProgress(r.line));
        if (moving.length > 0) {
          // Payouts settle in seconds; treasurer reviews take longer.
          const fast = moving.some((r) => r.line?.kind === "steps" && r.line.current === "approved");
          timer = setTimeout(load, fast ? 4000 : 15000);
        }
      } catch {
        if (!cancelled) {
          setFailed(true); // keep the last list on screen
          timer = setTimeout(load, 15000);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authFetch, onChange, orgId]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">My requests</h2>
      {items === null ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {failed ? "We couldn't load your requests. We'll try again shortly." : "Loading your requests…"}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          No requests yet. Tap <span className="font-medium text-zinc-900 dark:text-zinc-100">Get reimbursed</span> after
          you buy something for the club.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((r) => (
            <li key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {/* Receipt text is untrusted: plain text only. */}
                  <p className="truncate font-medium">{r.vendor ?? "Receipt"}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{showDate(r)}</p>
                </div>
                <p className="shrink-0 font-display text-lg font-semibold tabular-nums">{r.amount ?? "—"}</p>
              </div>
              {r.line && <RequestStatus line={r.line} />}
            </li>
          ))}
        </ul>
      )}
      {failed && items !== null && (
        <p className="text-xs text-zinc-500">Couldn&apos;t refresh just now. Showing the last update.</p>
      )}
    </section>
  );
}

function RequestStatus({ line }: { line: StatusLine }) {
  if (line.kind === "denied") {
    return (
      <div className="mt-3 rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">Denied</p>
        <p className="text-zinc-600 dark:text-zinc-400">
          {line.note ? `Treasurer's note: ${line.note}` : "The treasurer didn't approve this one."}
        </p>
      </div>
    );
  }
  if (line.kind === "blocked") {
    return (
      <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm dark:bg-red-950">
        <p className="font-medium text-red-800 dark:text-red-200">Blocked · waiting for the treasurer</p>
        {line.reasons.map((reason) => (
          <p key={reason} className="text-red-700 dark:text-red-300">
            {reason}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <StepBar current={line.current} />
      {line.current === "submitted" && line.waiting && (
        <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Waiting for the treasurer</p>
          {line.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      )}
      {line.current === "approved" && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Approved. Your money is on its way…</p>
      )}
    </div>
  );
}
