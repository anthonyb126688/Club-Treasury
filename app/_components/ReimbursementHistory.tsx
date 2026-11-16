"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  vendor: string | null;
  amount: string | null;
  status: "paying" | "reimbursed" | "pending" | "not_approved" | "delayed";
  date: string;
};

const LABEL: Record<Item["status"], { text: string; className: string }> = {
  reimbursed: { text: "Reimbursed", className: "text-green-700 dark:text-green-400" },
  paying: { text: "On its way", className: "text-green-700 dark:text-green-400" },
  pending: { text: "Pending", className: "text-amber-700 dark:text-amber-400" },
  delayed: { text: "Delayed", className: "text-amber-700 dark:text-amber-400" },
  not_approved: { text: "Not approved", className: "text-zinc-500" },
};

// "My reimbursements" on the home screen. Refreshes while anything is
// still pending or on its way.
export function ReimbursementHistory({ onChange }: { onChange?: () => void }) {
  const { getAccessToken } = usePrivy();
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastKey = "";

    async function load() {
      try {
        const res = await fetch("/api/reimburse", {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
        });
        if (res.ok && !cancelled) {
          const body = (await res.json()) as { requests: Item[] };
          setItems(body.requests);
          const key = body.requests.map((r) => r.status).join();
          if (lastKey && key !== lastKey) onChange?.(); // e.g. a payout landed: refresh balance
          lastKey = key;
          const waiting = body.requests.some((r) => r.status === "paying" || r.status === "pending");
          if (waiting) timer = setTimeout(load, 5000);
        }
      } catch {
        // Leave the last list on screen.
      }
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [getAccessToken, onChange]);

  if (!items || items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">My reimbursements</h2>
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.vendor ?? "Receipt"}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">{r.amount ?? "—"}</p>
              <p className={`text-sm ${LABEL[r.status].className}`}>{LABEL[r.status].text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
