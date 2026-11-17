"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useMemberAccount } from "@/lib/wallets/useMemberAccount";
import { useOrg } from "../../../_components/OrgProvider";

type Photo = string | null;

type Item = {
  id: string;
  status: string;
  memberEmail: string | null;
  submittedAt: string;
  photoUrl: Photo;
  vendor: string | null;
  date: string | null;
  summary: string | null;
  lineItems: { description: string; amount: string }[];
  amount: string;
  category: string;
  ai: { amount: string; category: string };
  edited: { amount: boolean; category: boolean };
  reasons: string[];
  payoutError: string | null;
  duplicateOf: {
    photoUrl: Photo;
    vendor: string | null;
    date: string | null;
    amount: string;
    status: string;
    memberEmail: string | null;
    submittedAt: string;
  } | null;
};

type Group = { code: string; title: string; hint: string; items: Item[] };
type Queue = { onChain: boolean; pendingCount: number; pendingTotal: string; groups: Group[] };

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const STATUS_WORDS: Record<string, string> = {
  paid: "already paid",
  queued: "also pending",
  approved: "approved",
  auto_approved: "approved",
  rejected: "rejected",
  payment_failed: "approved, payout delayed",
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function ReceiptPhoto({ url, label }: { url: Photo; label: string }) {
  if (!url) {
    return (
      <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900">
        No photo
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private link */}
      <img
        src={url}
        alt={label}
        className="aspect-[3/4] w-full rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
      />
      <span className="mt-1 block text-center text-xs text-zinc-500">{label} · tap to enlarge</span>
    </a>
  );
}

function RequestCard({
  item,
  busy,
  onAction,
}: {
  item: Item;
  busy: boolean;
  onAction: (action: "approve" | "reject" | "retry") => void;
}) {
  const [confirmReject, setConfirmReject] = useState(false);
  const failed = item.status === "payment_failed";

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Receipt-derived text: always plain text. */}
          <p className="truncate font-semibold">{item.vendor ?? "Unknown store"}</p>
          <p className="break-all text-sm text-zinc-600 dark:text-zinc-400">
            {item.memberEmail ?? "Member"} · sent {shortDate(item.submittedAt)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-semibold tabular-nums">{item.amount}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.category}</p>
        </div>
      </div>

      <ul className="flex flex-col gap-1 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        {failed && item.payoutError && <li>• {item.payoutError}</li>}
        {item.reasons.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>

      {(item.edited.amount || item.edited.category) && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="font-normal" />
              <th className="font-normal">AI read</th>
              <th className="font-normal">Member entered</th>
            </tr>
          </thead>
          <tbody>
            {item.edited.amount && (
              <tr>
                <td className="py-1 text-zinc-500">Amount</td>
                <td className="tabular-nums">{item.ai.amount}</td>
                <td className="font-semibold tabular-nums">{item.amount}</td>
              </tr>
            )}
            {item.edited.category && (
              <tr>
                <td className="py-1 text-zinc-500">Category</td>
                <td>{item.ai.category}</td>
                <td className="font-semibold">{item.category}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {item.duplicateOf ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <ReceiptPhoto url={item.photoUrl} label="This request" />
            <ReceiptPhoto url={item.duplicateOf.photoUrl} label="Earlier one" />
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Earlier: {item.duplicateOf.vendor ?? "Unknown store"}, {item.duplicateOf.amount},{" "}
            {item.duplicateOf.date ?? "no date"} — sent by {item.duplicateOf.memberEmail ?? "a member"} on{" "}
            {shortDate(item.duplicateOf.submittedAt)} ({STATUS_WORDS[item.duplicateOf.status] ?? item.duplicateOf.status})
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <ReceiptPhoto url={item.photoUrl} label="Receipt" />
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            {item.summary && <p>{item.summary}</p>}
            <p className="text-zinc-600 dark:text-zinc-400">Receipt date: {item.date ?? "not found"}</p>
            {item.lineItems.length > 0 && (
              <ul className="mt-1 text-zinc-600 dark:text-zinc-400">
                {item.lineItems.map((li, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{li.description}</span>
                    <span className="tabular-nums">{li.amount}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {failed ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("retry")}
          className="w-full rounded-xl bg-zinc-900 px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {busy ? "Working…" : `Retry payout of ${item.amount}`}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => (confirmReject ? onAction("reject") : setConfirmReject(true))}
            className={`rounded-xl border px-4 py-3 font-medium disabled:opacity-50 ${
              confirmReject
                ? "border-red-600 bg-red-600 text-white"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {confirmReject ? "Tap to reject" : "Reject"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction("approve")}
            className="rounded-xl bg-green-700 px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {busy ? "Paying…" : `Approve ${item.amount}`}
          </button>
        </div>
      )}
    </li>
  );
}

// Treasurer dashboard: the approval queue, grouped by why each request
// needs a human. Approving pays out immediately.
export default function TreasurerPage() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { orgId } = useOrg();
  const account = useMemberAccount();
  const { signTransaction } = useSignTransaction();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [problem, setProblem] = useState<"forbidden" | "failed" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/treasurer/queue`, {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
      });
      if (res.status === 403 || res.status === 401) return setProblem("forbidden");
      if (!res.ok) throw new Error();
      setQueue((await res.json()) as Queue);
      setProblem(null);
    } catch {
      setProblem("failed");
    }
  }, [getAccessToken, orgId]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
    const timer = setInterval(load, 15_000); // pick up new requests
    return () => clearInterval(timer);
  }, [ready, authenticated, load]);

  // Approve through the club vault: the treasurer's own account approves the
  // payment (silently, no pop-up), then the vault pays the member.
  async function approveOnChain(item: Item): Promise<string> {
    const auth = { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json" };
    const prep = await fetch(`/api/orgs/${orgId}/treasurer/approve/prepare`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ id: item.id }),
    });
    const p = (await prep.json().catch(() => ({}))) as { status?: string; transaction?: string };
    if (p.status === "paid") return `Already paid ${item.amount}.`;
    if (p.status === "processing") return `The ${item.amount} payout is already on its way.`;
    if (p.status === "not_approver") return "Your account isn't set up as the club's approver.";
    if (prep.status === 409) return "Someone already decided that one.";
    if (!prep.ok || p.status !== "ready" || !p.transaction || !account) {
      return "That didn't work. Try again.";
    }

    const { signedTransaction } = await signTransaction({
      transaction: fromBase64(p.transaction),
      wallet: account,
      chain: "solana:devnet",
    });

    const sub = await fetch(`/api/orgs/${orgId}/treasurer/approve/submit`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ id: item.id, transaction: toBase64(signedTransaction) }),
    });
    const s = (await sub.json().catch(() => ({}))) as { status?: string };
    if (s.status === "paid") return `Paid ${item.amount} to ${item.memberEmail ?? "the member"}.`;
    if (s.status === "processing") return `Approved. The ${item.amount} payout is on its way.`;
    if (sub.status === 409) return "That changed while you were approving. Refresh and try again.";
    return "The payout didn't go through. It's back in the queue; try again.";
  }

  async function act(item: Item, action: "approve" | "reject" | "retry") {
    setBusyId(item.id);
    setNotice(null);
    try {
      if (action === "approve") {
        setNotice(
          queue?.onChain
            ? await approveOnChain(item)
            : "The club is still being set up. Try again in a minute.",
        );
        return;
      }
      const res = await fetch(`/api/orgs/${orgId}/treasurer/decide`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: item.id, action }),
      });
      const body = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      if (res.status === 409) setNotice("Someone already decided that one.");
      else if (!res.ok) setNotice("That didn't work. Try again.");
      else if (body.status === "rejected") setNotice(`Rejected ${item.amount} from ${item.vendor ?? "receipt"}.`);
      else if (body.status === "paid") setNotice(`Paid ${item.amount} to ${item.memberEmail ?? "the member"}.`);
      else if (body.status === "processing") setNotice(`Approved. The ${item.amount} payout is on its way.`);
      else setNotice("Approved, but the payout didn't go through. It's under Payment problems.");
    } catch {
      setNotice("That didn't work. Try again.");
    } finally {
      setBusyId(null);
      await load();
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Treasurer</h1>
        <Link href={`/c/${orgId}`} className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Home
        </Link>
      </div>

      {!ready ? (
        <p className="text-zinc-600 dark:text-zinc-400">Loading…</p>
      ) : !authenticated || problem === "forbidden" ? (
        <p>
          This page is for the club treasurer.{" "}
          <Link href="/" className="underline">
            Go home
          </Link>
        </p>
      ) : !queue ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {problem === "failed" ? "We couldn't load the queue. Refresh to try again." : "Loading…"}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-900">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Waiting on you</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{queue.pendingCount}</p>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-900">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Total requested</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{queue.pendingTotal}</p>
            </div>
          </div>

          {notice && (
            <p role="status" className="rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
              {notice}
            </p>
          )}

          {queue.groups.length === 0 ? (
            <p className="rounded-xl bg-green-50 px-4 py-6 text-center text-green-800 dark:bg-green-950 dark:text-green-200">
              ✓ All caught up. Nothing is waiting for review.
            </p>
          ) : (
            <>
              <nav className="flex flex-wrap gap-2">
                {queue.groups.map((g) => (
                  <a
                    key={g.code}
                    href={`#${g.code}`}
                    className="rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
                  >
                    {g.title} <span className="font-semibold">{g.items.length}</span>
                  </a>
                ))}
              </nav>

              {queue.groups.map((g) => (
                <section key={g.code} id={g.code} className="flex scroll-mt-4 flex-col gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {g.title} <span className="text-zinc-500">({g.items.length})</span>
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{g.hint}</p>
                  </div>
                  <ul className="flex flex-col gap-4">
                    {g.items.map((item) => (
                      <RequestCard
                        key={item.id}
                        item={item}
                        busy={busyId === item.id}
                        onAction={(action) => act(item, action)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </>
      )}
    </main>
  );
}
