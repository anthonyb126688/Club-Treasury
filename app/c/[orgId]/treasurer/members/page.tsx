"use client";

import { useSignTransaction } from "@privy-io/react-auth/solana";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useMemberAccount } from "@/lib/wallets/useMemberAccount";
import { useOrg } from "../../../../_components/OrgProvider";
import { useAuthFetch } from "../../../../_components/useAuthFetch";

type Person = {
  userId: string;
  name: string;
  email: string | null;
  role: "member" | "treasurer";
  status: "pending" | "active";
  requestedAt: string;
  duesPaidThisPeriod: boolean;
  totalReimbursed: string;
  isYou: boolean;
};

type MembersData = { joinCode: string; period: { id: string; label: string }; people: Person[] };

// What a tap on a row does. "confirm" ones need a second tap.
type Action = "approve" | "decline" | "remove" | "promote" | "demote" | "demote_remove";

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const btn = "rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50";
const outline = `${btn} border border-zinc-300 dark:border-zinc-700`;
const danger = `${btn} border border-red-600 bg-red-600 text-white`;
const primary = `${btn} bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900`;

// Treasurer → Members: approve join requests, see who's paid dues and how
// much each person has been reimbursed, add a co-treasurer, remove people.
export default function MembersPage() {
  const { orgId, refresh: refreshMe } = useOrg();
  const authFetch = useAuthFetch();
  const router = useRouter();
  const account = useMemberAccount();
  const { signTransaction } = useSignTransaction();

  const [data, setData] = useState<MembersData | null>(null);
  const [problem, setProblem] = useState<"forbidden" | "failed" | null>(null);
  const [busy, setBusy] = useState<{ userId: string; label: string } | null>(null);
  const [confirm, setConfirm] = useState<{ userId: string; action: Action } | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/orgs/${orgId}/members`);
      if (res.status === 401 || res.status === 403) return setProblem("forbidden");
      if (!res.ok) throw new Error();
      setData((await res.json()) as MembersData);
      setProblem(null);
    } catch {
      setProblem("failed");
    }
  }, [authFetch, orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
    const timer = setInterval(load, 15_000); // pick up new join requests and dues
    return () => clearInterval(timer);
  }, [load]);

  const url = (p: Person, rest = "") => `/api/orgs/${orgId}/members/${encodeURIComponent(p.userId)}${rest}`;

  async function post(path: string, body: unknown) {
    const res = await authFetch(path, { method: "POST", body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
      changeId?: string;
      transaction?: string;
    };
    return { res, json };
  }

  // Approve / decline / remove a regular member: one call.
  async function simple(p: Person, action: "approve" | "decline" | "remove"): Promise<string> {
    const { res, json } = await post(url(p), { action });
    if (!res.ok) throw new Error(json.message ?? "That didn't work. Try again.");
    if (action === "approve") return `${p.name} is in. They can now use the club.`;
    if (action === "decline") return `Declined ${p.name}'s request.`;
    return `Removed ${p.name} from the club.`;
  }

  // Co-treasurer changes: the server prepares the vault change, your own
  // account approves it silently (no pop-up), then the server sends it.
  async function vaultChange(p: Person, flow: "promote" | "demote", then?: "demote" | "remove"): Promise<string> {
    setBusy({ userId: p.userId, label: "Preparing…" });
    const prep = await post(url(p, `/${flow}/prepare`), flow === "demote" ? { then } : {});
    if (!prep.res.ok || prep.json.status !== "ready" || !prep.json.changeId || !prep.json.transaction) {
      throw new Error(prep.json.message ?? "That didn't work. Try again.");
    }
    if (!account) throw new Error("Your account isn't ready yet. Refresh the page and try again.");

    setBusy({ userId: p.userId, label: "Approving…" });
    const { signedTransaction } = await signTransaction({
      transaction: fromBase64(prep.json.transaction),
      wallet: account,
      chain: "solana:devnet",
    });

    setBusy({ userId: p.userId, label: "Saving…" });
    const sub = await post(url(p, `/${flow}/submit`), {
      changeId: prep.json.changeId,
      transaction: toBase64(signedTransaction),
    });
    if (sub.json.status === "processing") {
      return "Approved. It's still going through; refresh in a minute to see the change.";
    }
    if (!sub.res.ok || sub.json.status !== "done") {
      throw new Error(sub.json.message ?? "That didn't go through. Nothing changed; try again.");
    }
    if (flow === "promote") return `${p.name} is now a co-treasurer.`;
    if (p.isYou) return "You're no longer a treasurer.";
    return then === "remove" ? `Removed ${p.name} from the club.` : `${p.name} is now a regular member.`;
  }

  async function act(p: Person, action: Action) {
    const needsConfirm = action === "decline" || action === "remove" || action === "demote_remove" || action === "demote";
    if (needsConfirm && (confirm?.userId !== p.userId || confirm.action !== action)) {
      setConfirm({ userId: p.userId, action });
      return;
    }
    setConfirm(null);
    setNotice(null);
    setBusy({ userId: p.userId, label: "Working…" });
    try {
      let text: string;
      if (action === "approve" || action === "decline") text = await simple(p, action);
      else if (action === "promote") text = await vaultChange(p, "promote");
      else if (action === "demote") text = await vaultChange(p, "demote", "demote");
      else if (action === "demote_remove") text = await vaultChange(p, "demote", "remove");
      else text = await simple(p, "remove"); // regular members; treasurers use demote_remove
      setNotice({ text, tone: "ok" });
      if (p.isYou && action === "demote") {
        // You stepped down: you can't see the treasurer area any more.
        await refreshMe();
        router.replace(`/c/${orgId}`);
        return;
      }
    } catch (err) {
      setNotice({ text: (err as Error).message || "That didn't work. Try again.", tone: "error" });
    } finally {
      setBusy(null);
    }
    await load();
  }

  if (problem === "forbidden") {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <p>
          This page is for the club treasurer.{" "}
          <Link href={`/c/${orgId}`} className="underline">
            Go home
          </Link>
        </p>
      </main>
    );
  }

  const pending = data?.people.filter((p) => p.status === "pending") ?? [];
  const active = data?.people.filter((p) => p.status === "active") ?? [];
  const treasurerCount = active.filter((p) => p.role === "treasurer").length;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Members</h1>
        {data && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Join code <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{data.joinCode}</span>{" "}
            ·{" "}
            <Link href={`/c/${orgId}/treasurer/settings`} className="underline">
              Settings
            </Link>
          </p>
        )}
      </div>

      {notice && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            notice.tone === "ok"
              ? "bg-zinc-100 dark:bg-zinc-900"
              : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {notice.text}
        </p>
      )}

      {!data ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {problem === "failed" ? "We couldn't load the members. Refresh to try again." : "Loading…"}
        </p>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">
                Waiting to join <span className="text-zinc-500">({pending.length})</span>
              </h2>
              <ul className="flex flex-col gap-3">
                {pending.map((p) => {
                  const isBusy = busy?.userId === p.userId;
                  const confirming = confirm?.userId === p.userId && confirm.action === "decline";
                  return (
                    <li
                      key={p.userId}
                      className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{p.name}</p>
                        <p className="break-all text-sm text-zinc-600 dark:text-zinc-400">
                          {p.email ?? "No email"} · asked {shortDate(p.requestedAt)}
                        </p>
                      </div>
                      <div className="grid shrink-0 grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => act(p, "decline")}
                          className={confirming ? danger : outline}
                        >
                          {confirming ? "Tap to decline" : "Decline"}
                        </button>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => act(p, "approve")}
                          className={`${btn} bg-green-700 text-white`}
                        >
                          {isBusy ? busy.label : "Approve"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              Members <span className="text-zinc-500">({active.length})</span>
            </h2>
            {active.every((p) => p.isYou) ? (
              <p className="rounded-xl bg-zinc-100 px-4 py-6 text-center text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                No members yet. Share your join code to invite people.
                <span className="mt-1 block font-mono text-lg font-semibold">{data.joinCode}</span>
              </p>
            ) : null}
            {active.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_7rem_9rem_7rem] gap-3 bg-zinc-50 px-4 py-2 text-sm text-zinc-500 md:grid dark:bg-zinc-900">
                  <span>Name</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Dues ({data.period.label})</span>
                  <span className="text-right">Reimbursed</span>
                </div>
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {active.map((p) => (
                    <MemberRow
                      key={p.userId}
                      person={p}
                      periodLabel={data.period.label}
                      onlyTreasurer={treasurerCount <= 1}
                      busyLabel={busy?.userId === p.userId ? busy.label : null}
                      anyBusy={!!busy}
                      confirming={confirm?.userId === p.userId ? confirm.action : null}
                      onAction={(a) => act(p, a)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function MemberRow({
  person: p,
  periodLabel,
  onlyTreasurer,
  busyLabel,
  anyBusy,
  confirming,
  onAction,
}: {
  person: Person;
  periodLabel: string;
  onlyTreasurer: boolean;
  busyLabel: string | null;
  anyBusy: boolean;
  confirming: Action | null;
  onAction: (a: Action) => void;
}) {
  const treasurer = p.role === "treasurer";
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_7rem_9rem_7rem] md:items-center">
        <p className="col-span-2 truncate text-base font-semibold md:col-span-1 md:text-sm">
          {p.name}
          {p.isYou && <span className="font-normal text-zinc-500"> (you)</span>}
        </p>
        <p className="col-span-2 break-all text-zinc-600 md:col-span-1 dark:text-zinc-400">{p.email ?? "No email"}</p>
        <p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              treasurer
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {treasurer ? "Treasurer" : "Member"}
          </span>
        </p>
        <p className={p.duesPaidThisPeriod ? "text-green-700 dark:text-green-400" : "text-zinc-600 dark:text-zinc-400"}>
          {p.duesPaidThisPeriod ? "✓ Paid" : "Not paid"}
          <span className="text-zinc-500 md:hidden"> · {periodLabel}</span>
        </p>
        <p className="tabular-nums md:text-right">
          <span className="text-zinc-500 md:hidden">Reimbursed </span>
          {p.totalReimbursed}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {busyLabel ? (
          <span className="py-2 text-sm text-zinc-600 dark:text-zinc-400">{busyLabel}</span>
        ) : treasurer ? (
          <>
            {onlyTreasurer ? (
              <span className="py-1 text-xs text-zinc-500">
                The only treasurer. Make someone else co-treasurer before stepping down.
              </span>
            ) : (
              <>
                <button
                  type="button"
                  disabled={anyBusy}
                  onClick={() => onAction("demote")}
                  className={confirming === "demote" ? danger : outline}
                >
                  {confirming === "demote"
                    ? "Tap to confirm"
                    : p.isYou
                      ? "Step down as treasurer"
                      : "Make regular member"}
                </button>
                {!p.isYou && (
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => onAction("demote_remove")}
                    className={confirming === "demote_remove" ? danger : outline}
                  >
                    {confirming === "demote_remove" ? "Tap to remove" : "Remove from club"}
                  </button>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <button type="button" disabled={anyBusy} onClick={() => onAction("promote")} className={primary}>
              Make co-treasurer
            </button>
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => onAction("remove")}
              className={confirming === "remove" ? danger : outline}
            >
              {confirming === "remove" ? "Tap to remove" : "Remove from club"}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
