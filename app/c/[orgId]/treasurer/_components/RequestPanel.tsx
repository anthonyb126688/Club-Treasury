"use client";

import { useState } from "react";
import type { RequestDetail } from "@/lib/dashboard/types";
import { ReceiptPhoto } from "./ReceiptPhoto";

const NOTE_MAX = 500;

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}

// Everything about one request, and what the treasurer can do with it.
// Receipt-derived text (vendor, summary, line items) is UNTRUSTED: it's only
// ever rendered as plain text.
export function RequestPanel({
  detail,
  loading,
  failed,
  busy,
  notice,
  onClose,
  onApprove,
  onDeny,
  onRetry,
  canApprove,
}: {
  detail: RequestDetail | null;
  loading: boolean;
  failed: boolean;
  busy: boolean;
  notice: string | null;
  onClose: () => void;
  onApprove: () => void;
  onDeny: (note: string) => void;
  onRetry: () => void;
  canApprove: boolean;
}) {
  return (
    <aside
      aria-label="Request details"
      className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-white px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] dark:bg-zinc-950 lg:sticky lg:pt-4 lg:pb-4 lg:inset-auto lg:top-4 lg:z-auto lg:max-h-[calc(100vh-2rem)] lg:rounded-2xl lg:border lg:border-zinc-200 lg:dark:border-zinc-800"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <button type="button" onClick={onClose} className="text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-brand-300">
          <span className="lg:hidden">← Back to requests</span>
          <span className="hidden lg:inline">Close</span>
        </button>
        {detail && <span className="text-sm text-zinc-500">{detail.statusLabel}</span>}
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
          {notice}
        </p>
      )}

      {!detail ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {failed ? "We couldn't load this request. Try again." : loading ? "Loading…" : ""}
        </p>
      ) : (
        <PanelBody
          key={detail.id}
          detail={detail}
          busy={busy}
          onApprove={onApprove}
          onDeny={onDeny}
          onRetry={onRetry}
          canApprove={canApprove}
        />
      )}
    </aside>
  );
}

function PanelBody({
  detail: d,
  busy,
  onApprove,
  onDeny,
  onRetry,
  canApprove,
}: {
  detail: RequestDetail;
  busy: boolean;
  onApprove: () => void;
  onDeny: (note: string) => void;
  onRetry: () => void;
  canApprove: boolean;
}) {
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState("");
  const trimmed = note.trim();
  const changed = d.comparison.some((c) => c.changed);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{d.vendor ?? "Unknown store"}</p>
          <p className="break-all text-sm text-zinc-600 dark:text-zinc-400">
            {d.memberName}
            {d.memberEmail && d.memberEmail !== d.memberName ? ` · ${d.memberEmail}` : ""}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Sent {longDate(d.submittedAt)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl font-semibold tabular-nums">{d.amount}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{d.category}</p>
        </div>
      </div>

      {(d.reasons.length > 0 || d.payoutError) && (
        <Section title="Why it needs you">
          <ul className="flex flex-col gap-1 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {d.payoutError && <li>• {d.payoutError}</li>}
            {d.reasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </Section>
      )}

      {d.status === "paid" && (
        <div className="flex flex-col gap-1 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900 dark:bg-brand-950 dark:text-brand-200">
          <p>Paid {d.paidAt ? longDate(d.paidAt) : ""}</p>
          {d.verifyUrl && (
            <a href={d.verifyUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              Verify this payment
            </a>
          )}
        </div>
      )}

      {d.status === "rejected" && (
        <div className="flex flex-col gap-1 rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
          <p className="text-zinc-600 dark:text-zinc-400">Denied {d.decidedAt ? longDate(d.decidedAt) : ""}. Note to the member:</p>
          <p className="whitespace-pre-wrap">{d.denialNote ?? "No note."}</p>
        </div>
      )}

      {d.duplicateOf ? (
        <Section title="Compare with the earlier request">
          <div className="grid grid-cols-2 gap-3">
            <ReceiptPhoto url={d.photoUrl} label="This request" />
            <ReceiptPhoto url={d.duplicateOf.photoUrl} label="Earlier one" />
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Earlier: {d.duplicateOf.vendor ?? "Unknown store"}, {d.duplicateOf.amount}, {d.duplicateOf.date ?? "no date"}
            {" — "}sent by {d.duplicateOf.memberName} on {longDate(d.duplicateOf.submittedAt)} ({d.duplicateOf.statusLabel.toLowerCase()})
          </p>
        </Section>
      ) : (
        <div className="mx-auto w-full max-w-xs">
          <ReceiptPhoto url={d.photoUrl} label="Receipt" />
        </div>
      )}

      <Section title={changed ? "What the AI read vs what the member entered" : "What the AI read"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="font-normal" />
              <th className="font-normal">AI read</th>
              <th className="font-normal">Member entered</th>
            </tr>
          </thead>
          <tbody>
            {d.comparison.map((c) => (
              <tr key={c.field} className={c.changed ? "bg-amber-50 dark:bg-amber-950" : ""}>
                <td className="py-1 pl-1 text-zinc-500">{c.label}</td>
                <td className="tabular-nums">{c.ai}</td>
                <td className={`tabular-nums ${c.changed ? "font-semibold" : ""}`}>
                  {c.member}
                  {c.changed && <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">changed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.looksLikeReceipt === false && (
          <p className="text-sm text-amber-800 dark:text-amber-300">The AI didn&apos;t think this photo was a receipt.</p>
        )}
        {d.summary && <p className="text-sm">{d.summary}</p>}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Receipt date: {d.receiptDate ?? "not found"}</p>
        {d.lineItems.length > 0 && (
          <ul className="text-sm text-zinc-600 dark:text-zinc-400">
            {d.lineItems.map((li, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{li.description}</span>
                <span className="tabular-nums">{li.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {d.actions.retry && (
        <button
          type="button"
          disabled={busy}
          onClick={onRetry}
          className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-brand-400 dark:hover:bg-brand-300 dark:text-brand-950"
        >
          {busy ? "Working…" : `Retry payout of ${d.amount}`}
        </button>
      )}

      {(d.actions.approve || d.actions.deny) &&
        (denying ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (trimmed) onDeny(trimmed);
            }}
          >
            <label htmlFor="deny-note" className="text-sm font-medium">
              Note to {d.memberName} (required)
            </label>
            <textarea
              id="deny-note"
              required
              maxLength={NOTE_MAX}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. This was a personal purchase, not a club expense."
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="text-right text-xs text-zinc-500">
              {note.length}/{NOTE_MAX}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDenying(false)}
                className="rounded-xl border border-zinc-300 px-4 py-3 font-medium disabled:opacity-50 dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !trimmed}
                className="rounded-xl bg-red-600 px-4 py-3 font-medium text-white disabled:opacity-50"
              >
                {busy ? "Working…" : "Deny"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDenying(true)}
                className="rounded-xl border border-zinc-300 px-4 py-3 font-medium disabled:opacity-50 dark:border-zinc-700"
              >
                Deny
              </button>
              <button
                type="button"
                disabled={busy || !canApprove}
                onClick={onApprove}
                className="rounded-xl bg-brand-700 px-4 py-3 font-medium text-white disabled:opacity-50"
              >
                {busy ? "Paying…" : `Approve ${d.amount}`}
              </button>
            </div>
            {!canApprove && (
              <p className="text-sm text-zinc-500">The club&apos;s account is still being set up, so approvals are paused.</p>
            )}
          </div>
        ))}
    </div>
  );
}
