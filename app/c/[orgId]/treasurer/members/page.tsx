"use client";

import { useSignTransaction } from "@privy-io/react-auth/solana";
import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useMemberAccount } from "@/lib/wallets/useMemberAccount";
import { useOrg } from "../../../../_components/OrgProvider";
import { Badge } from "../../../../_components/ui/Badge";
import { EmptyState, ErrorState, LoadingBlocks } from "../../../../_components/ui/EmptyState";
import { SectionLabel } from "../../../../_components/ui/GlassCard";
import { Sheet } from "../../../../_components/ui/Sheet";
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

const btn = "inline-flex min-h-10 items-center justify-center rounded-[12px] px-3 text-[13px] font-semibold disabled:opacity-40";
const outline = `${btn} glass text-ink hover:bg-white/80`;
const danger = `${btn} bg-alert text-white`;
const primary = `${btn} bg-ink text-white hover:bg-zinc-800`;

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
          <Link href={`/c/${orgId}`} className="font-semibold underline underline-offset-4">
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
              <span className="font-mono font-semibold text-ink">{data.joinCode}</span> ·{" "}
              <Link href={`/c/${orgId}/treasurer/settings`} className="font-semibold text-ink underline underline-offset-4">
                Invite link and QR
              </Link>
            </>
          )
        }
      />

      {notice && (
        <p
          role="status"
          className={`glass rounded-[12px] px-4 py-3 text-[13px] font-medium ${notice.tone === "ok" ? "" : "text-alert"}`}
        >
          {notice.text}
        </p>
      )}

      {!data ? (
        problem === "failed" ? (
          <ErrorState
            what="We couldn't load the members."
            todo="Check your connection; we'll try again in a few seconds."
            onRetry={load}
          />
        ) : (
          <LoadingBlocks rows={3} height="h-14" label="Loading members" />
        )
      ) : (
        <>
          {pending.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionLabel>Waiting to join ({pending.length})</SectionLabel>
              <ul className="glass divide-y divide-black/[0.06] overflow-hidden rounded-[16px]">
                {pending.map((p) => {
                  const isBusy = busy?.userId === p.userId;
                  const confirming = confirm?.userId === p.userId && confirm.action === "decline";
                  return (
                    <li
                      key={p.userId}
                      className="fade-in flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold">{p.name}</p>
                        <p className="text-[13px] break-words text-muted [overflow-wrap:anywhere]">
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
                          className={primary}
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

          <section className="flex flex-col gap-2">
            <SectionLabel>Members ({active.length})</SectionLabel>
            {active.every((p) => p.isYou) ? (
              <EmptyState icon={Users} title="No members yet">
                Share your join code to invite people:{" "}
                <span className="font-mono font-semibold text-ink">{data.joinCode}</span>
              </EmptyState>
            ) : null}
            {active.length > 0 && (
              <div className="glass overflow-hidden rounded-[16px]">
                <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_7rem_9rem_7rem] gap-3 border-b border-black/[0.06] px-4 py-2 text-[12px] font-semibold text-muted uppercase md:grid">
                  <span>Name</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Dues ({data.period.label})</span>
                  <span className="text-right">Reimbursed</span>
                </div>
                <ul className="divide-y divide-black/[0.06]">
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
  return <Badge tone={p.role === "treasurer" ? "dark" : "neutral"}>{roleLabel(p)}</Badge>;
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
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-black/[0.03] md:hidden"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">
            {p.name}
            {p.isYou && <span className="font-normal text-muted"> (you)</span>}
          </span>
          <span className="block truncate text-[13px] text-muted">
            {roleLabel(p)} · {p.duesPaidThisPeriod ? "Dues paid" : "Dues not paid"}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-semibold tabular-nums">{p.totalReimbursed}</span>
          <span className="block text-[12px] text-muted">reimbursed</span>
        </span>
        <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-zinc-400" />
      </button>

      {/* Wider screens: a table row with the actions inline. */}
      <div className="hidden flex-col gap-3 px-4 py-3 md:flex">
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_7rem_9rem_7rem] items-center gap-x-3 text-[13px]">
          <p className="truncate text-[15px] font-semibold">
            {p.name}
            {p.isYou && <span className="font-normal text-muted"> (you)</span>}
          </p>
          <p className="truncate text-muted">{p.email ?? "No email"}</p>
          <p>
            <RoleBadge person={p} />
          </p>
          <p className={p.duesPaidThisPeriod ? "font-semibold" : "text-muted"}>
            {p.duesPaidThisPeriod ? "✓ Paid" : "Not paid"}
            <span className="sr-only"> ({periodLabel})</span>
          </p>
          <p className="text-right font-semibold tabular-nums">{p.totalReimbursed}</p>
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

// Phones: one person in a sheet, with what the treasurer can do.
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
  return (
    <Sheet title={p.isYou ? `${p.name} (you)` : p.name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2 px-1">
          <p className="text-[15px] break-all text-muted">{p.email ?? "No email"}</p>
          <RoleBadge person={p} />
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="glass rounded-[16px] p-3">
            <dt className="text-[13px] text-muted">Dues · {periodLabel}</dt>
            <dd className="mt-1 text-[15px] font-semibold">{p.duesPaidThisPeriod ? "✓ Paid" : "Not paid"}</dd>
          </div>
          <div className="glass rounded-[16px] p-3">
            <dt className="text-[13px] text-muted">Reimbursed</dt>
            <dd className="mt-1 text-[20px] font-bold tabular-nums">{p.totalReimbursed}</dd>
          </div>
        </dl>

        {notice && (
          <p
            role="status"
            className={`glass rounded-[12px] px-4 py-3 text-[13px] font-medium ${notice.tone === "ok" ? "" : "text-alert"}`}
          >
            {notice.text}
          </p>
        )}

        {children}
      </div>
    </Sheet>
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
        <span className="py-2 text-[13px] text-muted">{busyLabel}</span>
      ) : treasurer ? (
        <>
          {p.isFounder && !p.isYou ? (
            <span className="py-1 text-[12px] text-muted">Founded the club. Only they can step down.</span>
          ) : onlyTreasurer ? (
            <span className="py-1 text-[12px] text-muted">
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
