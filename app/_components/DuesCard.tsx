"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import { useCallback, useEffect, useState } from "react";
import { useMemberAccount } from "@/lib/wallets/useMemberAccount";
import { signalDataChanged, useOnDataChanged } from "./useLiveData";

export type DuesStatus = {
  term: string;
  amount: string;
  status: "unpaid" | "pending" | "paid";
  clubBalance: string | null;
};

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

// This period's dues status + the one-tap "Pay dues" action. The club's
// balance comes back with the dues status; it's passed up via onClubBalance.
// The member's account approves the payment silently (no pop-up); the club
// pays the network fee. The server makes sure dues are charged once per term.
export function useDues({
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

  // Club balance and dues status follow other people's payments too.
  useOnDataChanged(refresh);

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
      if (s.status === "paid") {
        onPaid();
        signalDataChanged(); // every live screen refreshes
      }
      if (s.status === "failed") setMessage("We couldn't finish your dues payment. Try again.");
      await refresh();
    } catch {
      setMessage("We couldn't finish your dues payment. Try again.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return { dues, busy, message, payDues };
}
