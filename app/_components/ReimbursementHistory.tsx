"use client";

import { useEffect, useState } from "react";
import { isInProgress, type StatusLine } from "@/lib/member/status";
import { StepBar } from "../c/[orgId]/_components/StepBar";
import { EmptyState, ErrorState, LoadingBlocks } from "./ui/EmptyState";
import { SectionLabel } from "./ui/GlassCard";
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
    <section className="flex flex-col gap-2">
      <SectionLabel>My requests</SectionLabel>
      {items === null ? (
        failed ? (
          <ErrorState what="We couldn't load your requests." todo="We'll try again in a few seconds." />
        ) : (
          <LoadingBlocks rows={2} height="h-24" label="Loading your requests" />
        )
      ) : items.length === 0 ? (
        <EmptyState title="No requests yet">
          Bought something for the club? Tap <span className="font-semibold text-ink">Get reimbursed</span> and snap
          the receipt.
        </EmptyState>
      ) : (
        <ul className="glass divide-y divide-black/[0.06] overflow-hidden rounded-[16px]">
          {items.map((r) => (
            <li key={r.id} className="fade-in px-4 py-3.5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {/* Receipt text is untrusted: plain text only. */}
                  <p className="truncate text-[15px] font-medium">{r.vendor ?? "Receipt"}</p>
                  <p className="text-[13px] text-muted">{showDate(r)}</p>
                </div>
                <p className="shrink-0 text-[17px] font-semibold tabular-nums">{r.amount ?? "—"}</p>
              </div>
              {r.line && <RequestStatus line={r.line} />}
            </li>
          ))}
        </ul>
      )}
      {failed && items !== null && (
        <p className="px-1 text-[12px] text-muted">Couldn&apos;t refresh just now. Showing the last update.</p>
      )}
    </section>
  );
}

function RequestStatus({ line }: { line: StatusLine }) {
  if (line.kind === "denied") {
    return (
      <div className="mt-3 rounded-[12px] bg-black/[0.05] px-3 py-2 text-[13px]">
        <p className="font-semibold">Denied</p>
        <p className="text-zinc-600">
          {line.note ? `Treasurer's note: ${line.note}` : "The treasurer didn't approve this one."}
        </p>
      </div>
    );
  }
  if (line.kind === "blocked") {
    return (
      <div className="mt-3 rounded-[12px] bg-alert/10 px-3 py-2 text-[13px]">
        <p className="font-semibold text-alert">Blocked · waiting for the treasurer</p>
        {line.reasons.map((reason) => (
          <p key={reason} className="text-zinc-700">
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
        <div className="mt-2 rounded-[12px] bg-black/[0.05] px-3 py-2 text-[13px] text-zinc-700">
          <p className="font-semibold text-ink">Waiting for the treasurer</p>
          {line.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      )}
      {line.current === "approved" && (
        <p className="mt-2 text-[13px] text-muted">Approved. Your money is on its way…</p>
      )}
    </div>
  );
}
