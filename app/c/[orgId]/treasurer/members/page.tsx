"use client";

import { useSignTransaction } from "@privy-io/react-auth/solana";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useMemberAccount } from "@/lib/wallets/useMemberAccount";
import { useOrg } from "../../../../_components/OrgProvider";
import { useAuthFetch } from "../../../../_components/useAuthFetch";
import { PageHeader, treasurerPage } from "../../_components/PageHeader";

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
  isFounder: boolean;
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
const primary = `${btn} bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:hover:bg-brand-900`;

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
  const [openId, setOpenId] = useState<string | null>(null); // phones: the person shown full screen
  const closeSheet = useCallback(() => setOpenId(null), []);

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
      <main className={treasurerPage}>
        <p>
          This page is for the club treasurer.{" "}
          <Link href={`/c/${orgId}`} className="underline decoration-zinc-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500 dark:decoration-zinc-600 dark:hover:text-brand-300">
            Go home
          </Link>
        </p>
      </main>
    );
  }

  const pending = data?.people.filter((p) => p.status === "pending") ?? [];
  const active = data?.people.filter((p) => p.status === "active") ?? [];
  const treasurerCount = active.filter((p) => p.role === "treasurer").length;
  const openPerson = active.find((p) => p.userId === openId) ?? null;

  return (
    <main className={treasurerPage}>
      <PageHeader
        title="Members"
        subtitle={
          data && (
            <>
              Join code{" "}
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{data.joinCode}</span> ·{" "}
              <Link
                href={`/c/${orgId}/treasurer/settings`}
                className="underline decoration-zinc-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-500 dark:decoration-zinc-600 dark:hover:text-brand-300"
              >
                Invite link and QR
              </Link>
            </>
          )
        }
      />

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
                          className={`${btn} bg-brand-700 text-white`}
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
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
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
                      onOpen={() => setOpenId(p.userId)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      {data && openPerson && (
        <MemberSheet person={openPerson} periodLabel={data.period.label} notice={notice} onClose={closeSheet}>
          <MemberActions
            person={openPerson}
            onlyTreasurer={treasurerCount <= 1}
            busyLabel={busy?.userId === openPerson.userId ? busy.label : null}
            anyBusy={!!busy}
            confirming={confirm?.userId === openPerson.userId ? confirm.action : null}
            onAction={(a) => act(openPerson, a)}
          />
        </MemberSheet>
      )}
    </main>
  );
}

function roleLabel(p: Person) {
  if (p.role !== "treasurer") return "Member";
  return p.isFounder ? "Founder" : "Treasurer";
}

function RoleBadge({ person: p }: { person: Person }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        p.role === "treasurer"
          ? "bg-brand-600 text-white dark:bg-brand-400 dark:text-brand-950"
          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {roleLabel(p)}
    </span>
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
  onOpen,
}: {
  person: Person;
  periodLabel: string;
  onlyTreasurer: boolean;
  busyLabel: string | null;
  anyBusy: boolean;
  confirming: Action | null;
  onAction: (a: Action) => void;
  onOpen: () => void;
}) {
  return (
    <li>
      {/* Phones: one tappable row (name, amount, status) that opens the person full screen. */}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 md:hidden dark:hover:bg-zinc-800/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {p.name}
            {p.isYou && <span className="font-normal text-zinc-500"> (you)</span>}
          </span>
          <span className="block truncate text-sm text-zinc-600 dark:text-zinc-400">
            {roleLabel(p)} · {p.duesPaidThisPeriod ? "Dues paid" : "Dues not paid"}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold tabular-nums">{p.totalReimbursed}</span>
          <span className="block text-xs text-zinc-500">reimbursed</span>
        </span>
        <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-zinc-400" />
      </button>

      {/* Wider screens: a table row with the actions inline. */}
      <div className="hidden flex-col gap-3 px-4 py-3 md:flex">
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_7rem_9rem_7rem] items-center gap-x-3 text-sm">
          <p className="truncate font-semibold">
            {p.name}
            {p.isYou && <span className="font-normal text-zinc-500"> (you)</span>}
          </p>
          <p className="truncate text-zinc-600 dark:text-zinc-400">{p.email ?? "No email"}</p>
          <p>
            <RoleBadge person={p} />
          </p>
          <p className={p.duesPaidThisPeriod ? "text-brand-700 dark:text-brand-300" : "text-zinc-600 dark:text-zinc-400"}>
            {p.duesPaidThisPeriod ? "✓ Paid" : "Not paid"}
            <span className="sr-only"> ({periodLabel})</span>
          </p>
          <p className="text-right tabular-nums">{p.totalReimbursed}</p>
        </div>
        <MemberActions
          person={p}
          onlyTreasurer={onlyTreasurer}
          busyLabel={busyLabel}
          anyBusy={anyBusy}
          confirming={confirming}
          onAction={onAction}
        />
      </div>
    </li>
  );
}

// Phones: one person, full screen, with what the treasurer can do.
function MemberSheet({
  person: p,
  periodLabel,
  notice,
  onClose,
  children,
}: {
  person: Person;
  periodLabel: string;
  notice: { text: string; tone: "ok" | "error" } | null;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={p.name}
      className="fixed inset-0 z-40 flex flex-col gap-5 overflow-y-auto overscroll-contain bg-white px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:hidden dark:bg-zinc-950"
    >
      <button
        type="button"
        onClick={onClose}
        autoFocus
        className="flex min-h-11 items-center gap-2 self-start rounded-full pr-3 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
        Back to members
      </button>

      <div className="flex flex-col items-start gap-2">
        <h2 className="text-2xl font-semibold break-words">
          {p.name}
          {p.isYou && <span className="font-normal text-zinc-500"> (you)</span>}
        </h2>
        <p className="text-sm break-all text-zinc-600 dark:text-zinc-400">{p.email ?? "No email"}</p>
        <RoleBadge person={p} />
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-zinc-100 p-3 dark:bg-zinc-900">
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">Dues · {periodLabel}</dt>
          <dd className={`mt-1 font-semibold ${p.duesPaidThisPeriod ? "text-brand-700 dark:text-brand-300" : ""}`}>
            {p.duesPaidThisPeriod ? "✓ Paid" : "Not paid"}
          </dd>
        </div>
        <div className="rounded-2xl bg-zinc-100 p-3 dark:bg-zinc-900">
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">Reimbursed</dt>
          <dd className="mt-1 font-display text-xl font-semibold tabular-nums">{p.totalReimbursed}</dd>
        </div>
      </dl>

      {notice && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            notice.tone === "ok" ? "bg-zinc-100 dark:bg-zinc-900" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {notice.text}
        </p>
      )}

      {children}
    </div>
  );
}

// What the treasurer can do with one person (same buttons in the table row and the phone sheet).
function MemberActions({
  person: p,
  onlyTreasurer,
  busyLabel,
  anyBusy,
  confirming,
  onAction,
}: {
  person: Person;
  onlyTreasurer: boolean;
  busyLabel: string | null;
  anyBusy: boolean;
  confirming: Action | null;
  onAction: (a: Action) => void;
}) {
  const treasurer = p.role === "treasurer";
  return (
    <div className="flex flex-wrap gap-2">
      {busyLabel ? (
        <span className="py-2 text-sm text-zinc-600 dark:text-zinc-400">{busyLabel}</span>
      ) : treasurer ? (
        <>
          {p.isFounder && !p.isYou ? (
            <span className="py-1 text-xs text-zinc-500">Founded the club. Only they can step down.</span>
          ) : onlyTreasurer ? (
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
  );
}
