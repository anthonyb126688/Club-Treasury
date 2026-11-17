"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import { useCallback, useEffect, useState } from "react";
import { useMemberAccount } from "@/lib/wallets/useMemberAccount";

type DuesStatus = {
  term: string;
  amount: string;
  status: "unpaid" | "pending" | "paid";
  clubBalance: string | null;
};

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

// This period's dues status + the one-tap "Pay dues" button. The club's
// balance comes back with the dues status; it's passed up via onClubBalance.
// The member's account approves the payment silently (no pop-up); the club
// pays the network fee. The server makes sure dues are charged once per term.
export function DuesCard({
  orgId,
  onPaid,
  onClubBalance,
  refreshKey = 0,
}: {
  orgId: string;
  onPaid: () => void;
  onClubBalance?: (balance: string | null) => void;
  refreshKey?: number; // bump to re-check (e.g. after a payout lands)
}) {
  const { getAccessToken } = usePrivy();
  const account = useMemberAccount();
  const { signTransaction } = useSignTransaction();
  const [dues, setDues] = useState<DuesStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const authHeader = useCallback(
    async () => ({ Authorization: `Bearer ${await getAccessToken()}` }),
    [getAccessToken],
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/orgs/${orgId}/dues`, { headers: await authHeader() });
    if (res.ok) {
      const body = (await res.json()) as DuesStatus;
      setDues(body);
      onClubBalance?.(body.clubBalance);
    }
  }, [authHeader, orgId, onClubBalance]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    refresh();
  }, [refresh, refreshKey]);

  // While a payment is processing, check back until it settles.
  useEffect(() => {
    if (dues?.status !== "pending") return;
    const t = setTimeout(refresh, 3000);
    return () => clearTimeout(t);
  }, [dues, refresh]);

  async function payDues() {
    setBusy(true);
    setMessage(null);
    try {
      const prep = await fetch(`/api/orgs/${orgId}/dues/prepare`, { method: "POST", headers: await authHeader() });
      if (prep.status === 409) {
        setMessage("The club is still being set up. Try again in a minute.");
        return;
      }
      if (prep.status === 402) {
        setMessage("You don't have enough money to pay dues.");
        return;
      }
      if (!prep.ok) throw new Error();
      const p = (await prep.json()) as { status: string; transaction?: string };
      if (p.status !== "ready" || !p.transaction) {
        await refresh();
        return;
      }

      if (!account) throw new Error();

      const { signedTransaction } = await signTransaction({
        transaction: fromBase64(p.transaction),
        wallet: account,
        chain: "solana:devnet",
      });

      const sub = await fetch(`/api/orgs/${orgId}/dues/submit`, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: toBase64(signedTransaction) }),
      });
      const s = sub.ok ? ((await sub.json()) as { status: string }) : { status: "failed" };
      if (s.status === "paid") onPaid();
      if (s.status === "failed") setMessage("We couldn't finish your dues payment. Try again.");
      await refresh();
    } catch {
      setMessage("We couldn't finish your dues payment. Try again.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Dues</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{dues ? `${dues.amount} · ${dues.term}` : "…"}</p>
      </div>

      <div className="mt-4">
        {dues?.status === "paid" ? (
          <p className="rounded-xl bg-brand-50 px-4 py-3 text-center font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-200">
            ✓ Paid for {dues.term}
          </p>
        ) : dues?.status === "pending" ? (
          <p className="animate-pulse rounded-xl bg-zinc-100 px-4 py-3 text-center text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Your dues payment is going through…
          </p>
        ) : (
          <>
            {dues && (
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Not paid yet for {dues.term}.</p>
            )}
            <button
              type="button"
              onClick={payDues}
              disabled={!dues || busy}
              className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-brand-400 dark:hover:bg-brand-300 dark:text-brand-950"
            >
              {busy ? "Paying…" : dues ? `Pay ${dues.amount} dues` : "Pay dues"}
            </button>
          </>
        )}
      </div>
      {message && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {message}
        </p>
      )}
    </section>
  );
}
