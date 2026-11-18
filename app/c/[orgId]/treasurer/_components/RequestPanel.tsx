"use client";

import { ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";
import { receiptDay } from "@/lib/dashboard/format";
import type { RequestDetail } from "@/lib/dashboard/types";
import { Button } from "../../../../_components/ui/Button";
import { ErrorState, LoadingBlocks } from "../../../../_components/ui/EmptyState";
import { Sheet } from "../../../../_components/ui/Sheet";
import { ReceiptPhoto } from "./ReceiptPhoto";

const NOTE_MAX = 500;

// Approve / Deny stay pinned to the bottom of the panel while the treasurer scrolls the details.
const actionBar =
  "sticky -bottom-[calc(1.25rem+env(safe-area-inset-bottom))] -mx-4 -mb-[calc(1.25rem+env(safe-area-inset-bottom))] border-t border-black/[0.06] bg-[rgb(250_250_252/0.96)] px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]";

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-[13px] font-semibold text-muted uppercase">{title}</h3>
      {children}
    </div>
  );
}

// Everything about one request, and what the treasurer can do with it, in a
// sheet (full screen from the bottom on phones, a side panel on wide screens).
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
    <Sheet title={detail ? `${detail.statusLabel} · ${detail.amount}` : "Request"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {notice && (
          <p role="status" className="glass rounded-[12px] px-4 py-3 text-[13px] font-medium">
            {notice}
          </p>
        )}
        {!detail ? (
          failed ? (
            <ErrorState what="We couldn't load this request." todo="Close it and tap the request again." />
          ) : loading ? (
            <LoadingBlocks rows={3} height="h-24" label="Loading the request" />
          ) : null
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
      </div>
    </Sheet>
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
      <div className="glass flex items-start justify-between gap-3 rounded-[16px] p-4">
        <div className="min-w-0">
          <p className="text-[17px] leading-snug font-semibold break-words">{d.vendor ?? "Unknown store"}</p>
          <p className="mt-0.5 text-[13px] break-words text-muted">{d.memberName}</p>
          {d.memberEmail && d.memberEmail !== d.memberName && (
            <p className="truncate text-[13px] text-muted" title={d.memberEmail}>
              {d.memberEmail}
            </p>
          )}
          <p className="text-[13px] text-muted">Sent {longDate(d.submittedAt)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[24px] leading-tight font-bold tabular-nums">{d.amount}</p>
          <p className="text-[13px] text-muted">{d.category}</p>
        </div>
      </div>

      {(d.reasons.length > 0 || d.payoutError) && (
        <Section title="Why it needs you">
          <ul className="flex list-disc flex-col gap-1 rounded-[12px] bg-black/[0.05] py-2.5 pr-3 pl-7 text-[13px]">
            {d.payoutError && <li className="font-semibold text-alert">{d.payoutError}</li>}
            {d.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {d.status === "paid" && (
        <div className="flex items-center justify-between gap-3 rounded-[12px] bg-black/[0.05] px-3 py-2.5 text-[13px]">
          <p className="font-medium">Paid {d.paidAt ? longDate(d.paidAt) : ""}</p>
          {d.verifyUrl && (
            <a
              href={d.verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-4"
            >
              Verify this payment
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
            </a>
          )}
        </div>
      )}

      {d.status === "rejected" && (
        <div className="flex flex-col gap-1 rounded-[12px] bg-black/[0.05] px-3 py-2.5 text-[13px]">
          <p className="text-muted">Denied {d.decidedAt ? longDate(d.decidedAt) : ""}. Note to the member:</p>
          <p className="whitespace-pre-wrap">{d.denialNote ?? "No note."}</p>
        </div>
      )}

      {d.duplicateOf ? (
        <Section title="Compare with the earlier request">
          <div className="grid grid-cols-2 gap-3">
            <ReceiptPhoto url={d.photoUrl} label="This request" />
            <ReceiptPhoto url={d.duplicateOf.photoUrl} label="Earlier one" />
          </div>
          <p className="text-[13px] text-muted">
            Earlier: {d.duplicateOf.vendor ?? "Unknown store"}, {d.duplicateOf.amount}, {d.duplicateOf.date ? receiptDay(d.duplicateOf.date) : "no date"}
            {" — "}sent by {d.duplicateOf.memberName} on {longDate(d.duplicateOf.submittedAt)} (
            {d.duplicateOf.statusLabel.toLowerCase()})
          </p>
        </Section>
      ) : (
        <div className="mx-auto w-full max-w-xs">
          <ReceiptPhoto url={d.photoUrl} label="Receipt" />
        </div>
      )}

      <Section title={changed ? "What the AI read vs what the member entered" : "What the AI read"}>
        <div className="glass rounded-[16px] p-3">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="font-normal" />
                <th className="font-normal">AI read</th>
                <th className="font-normal">Member entered</th>
              </tr>
            </thead>
            <tbody>
              {d.comparison.map((c) => (
                <tr key={c.field} className={c.changed ? "bg-warn/10" : ""}>
                  <td className="py-1 pl-1 text-muted">{c.label}</td>
                  <td className="tabular-nums">{c.ai}</td>
                  <td className={`tabular-nums ${c.changed ? "font-semibold" : ""}`}>
                    {c.member}
                    {c.changed && <span className="ml-1 text-[12px] text-warn-text">changed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.looksLikeReceipt === false && (
            <p className="mt-2 text-[13px] text-warn-text">The AI didn&apos;t think this photo was a receipt.</p>
          )}
          {d.summary && <p className="mt-2 text-[13px]">{d.summary}</p>}
          <p className="mt-1 text-[13px] text-muted">Receipt date: {d.receiptDate ? receiptDay(d.receiptDate) : "not found"}</p>
          {d.lineItems.length > 0 && (
            <ul className="mt-2 text-[13px] text-muted">
              {d.lineItems.map((li, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 break-words">{li.description}</span>
                  <span className="shrink-0 tabular-nums">{li.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {d.actions.retry && (
        <Button disabled={busy} onClick={onRetry} className="w-full">
          {busy ? "Working…" : `Retry payout of ${d.amount}`}
        </Button>
      )}

      {(d.actions.approve || d.actions.deny) &&
        (denying ? (
          <form
            className={`${actionBar} flex flex-col gap-2`}
            onSubmit={(e) => {
              e.preventDefault();
              if (trimmed) onDeny(trimmed);
            }}
          >
            <label htmlFor="deny-note" className="px-1 text-[13px] font-semibold">
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
              className="glass rounded-[12px] px-3 py-2 text-[15px] outline-none"
            />
            <p className="text-right text-[12px] text-muted">
              {note.length}/{NOTE_MAX}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" disabled={busy} onClick={() => setDenying(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy || !trimmed}>
                {busy ? "Working…" : "Deny"}
              </Button>
            </div>
          </form>
        ) : (
          <div className={`${actionBar} flex flex-col gap-2`}>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" disabled={busy} onClick={() => setDenying(true)}>
                Deny
              </Button>
              <Button disabled={busy || !canApprove} onClick={onApprove}>
                {busy ? "Paying…" : `Approve ${d.amount}`}
              </Button>
            </div>
            {!canApprove && (
              <p className="text-[13px] text-muted">The club&apos;s account is still being set up, so approvals are paused.</p>
            )}
          </div>
        ))}
    </div>
  );
}
