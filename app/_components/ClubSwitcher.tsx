"use client";

import { useSignTransaction } from "@privy-io/react-auth/solana";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMemberAccount } from "@/lib/wallets/useMemberAccount";
import { useOrg } from "./OrgProvider";
import { useAuthFetch } from "./useAuthFetch";

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const item =
  "block w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-900";

/**
 * The club part of the nav: switch between your clubs (remembered as your
 * last club), join or create another, and leave this club. `plain` drops the
 * menu roles, for use inside the phone "More" sheet instead of a pop-over.
 */
export function ClubMenu({ onNavigate, plain = false }: { onNavigate: () => void; plain?: boolean }) {
  const role = plain ? undefined : "menuitem";
  const router = useRouter();
  const authFetch = useAuthFetch();
  const { orgId, club, me } = useOrg();
  const clubs = (me?.clubs ?? []).filter((c) => c.status === "active");

  async function switchTo(id: string) {
    onNavigate();
    // Remember it for next time; going there doesn't wait on this.
    authFetch("/api/me", { method: "PATCH", body: JSON.stringify({ lastOrgId: id }) }).catch(() => {});
    router.push(`/c/${id}`);
  }

  return (
    <div className="flex flex-col">
      {clubs.length > 1 && (
        <>
          <p className="px-3 pt-1 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Your clubs</p>
          {clubs.map((c) => (
            <button
              key={c.id}
              type="button"
              role={role}
              onClick={() => switchTo(c.id)}
              disabled={c.id === orgId}
              aria-current={c.id === orgId ? "page" : undefined}
              className={`${item} ${c.id === orgId ? "font-semibold disabled:opacity-100" : ""}`}
            >
              <span className="block truncate">
                {c.id === orgId ? "✓ " : ""}
                {c.name}
              </span>
              <span className="block truncate text-xs text-zinc-500">{c.school}</span>
            </button>
          ))}
          <hr className="my-2 border-zinc-200 dark:border-zinc-800" />
        </>
      )}
      <Link href="/start" role={role} onClick={onNavigate} className={item}>
        Join or create another club
      </Link>
      {club && <LeaveClub orgId={orgId} clubName={club.name} role={role} />}
      <hr className="my-2 border-zinc-200 dark:border-zinc-800" />
    </div>
  );
}

function LeaveClub({ orgId, clubName, role }: { orgId: string; clubName: string; role?: "menuitem" }) {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const account = useMemberAccount();
  const { signTransaction } = useSignTransaction();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await authFetch(`/api/orgs/${orgId}/leave`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
        changeId?: string;
        transaction?: string;
      };
      if (body.error === "only_treasurer") {
        setMessage("You're the club's only treasurer. Make someone else a treasurer before you leave.");
        return;
      }
      if (body.error === "club_not_ready") {
        setMessage("Your club is still being set up. Try again in a minute.");
        return;
      }
      if (body.status === "left") {
        router.replace("/");
        return;
      }
      // Treasurers: their account approves stepping down, silently.
      if (body.status !== "ready" || !body.changeId || !body.transaction) {
        setMessage("That didn't work. Try again.");
        return;
      }
      if (!account) {
        setMessage("Your account is still loading. Try again in a few seconds.");
        return;
      }
      const { signedTransaction } = await signTransaction({
        transaction: fromBase64(body.transaction),
        wallet: account,
        chain: "solana:devnet",
      });
      const sub = await authFetch(`/api/orgs/${orgId}/leave/submit`, {
        method: "POST",
        body: JSON.stringify({ changeId: body.changeId, transaction: toBase64(signedTransaction) }),
      });
      const s = (await sub.json().catch(() => ({}))) as { status?: string; error?: string };
      if (s.status === "done") router.replace("/");
      else if (s.status === "processing") setMessage("Almost done. Check back in a minute.");
      else if (s.error === "only_treasurer") {
        setMessage("You're the club's only treasurer. Make someone else a treasurer before you leave.");
      } else setMessage("That didn't work. Try again.");
    } catch {
      setMessage("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" role={role} onClick={() => setConfirming(true)} className={`${item} text-red-600`}>
        Leave club
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
      <p>
        Leave <strong className="break-words">{clubName}</strong>? To come back, you&apos;ll need the treasurer to
        approve you again.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={leave}
          disabled={busy}
          className="flex-1 rounded-xl bg-red-600 px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Leaving…" : "Leave"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setMessage(null);
          }}
          disabled={busy}
          className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
      {message && (
        <p role="alert" className="text-red-600">
          {message}
        </p>
      )}
    </div>
  );
}
