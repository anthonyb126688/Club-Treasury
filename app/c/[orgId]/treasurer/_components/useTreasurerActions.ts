"use client";

import { useSignTransaction } from "@privy-io/react-auth/solana";
import { useCallback } from "react";
import { useMemberAccount } from "@/lib/wallets/useMemberAccount";
import { useAuthFetch } from "../../../../_components/useAuthFetch";

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export type Target = { id: string; amount: string; memberName: string; vendor: string | null };

/**
 * The treasurer's three actions. Each returns a plain-English message for
 * the screen. Approve goes through the club's vault: the server prepares
 * the payment, the treasurer's own account approves it silently (no
 * pop-up), and the server checks it, sends it, and records it.
 */
export function useTreasurerActions(orgId: string) {
  const authFetch = useAuthFetch();
  const account = useMemberAccount();
  const { signTransaction } = useSignTransaction();

  const approve = useCallback(
    async (item: Target): Promise<string> => {
      const prep = await authFetch(`/api/orgs/${orgId}/treasurer/approve/prepare`, {
        method: "POST",
        body: JSON.stringify({ id: item.id }),
      });
      const p = (await prep.json().catch(() => ({}))) as { status?: string; transaction?: string };
      if (p.status === "paid") return `Already paid ${item.amount}.`;
      if (p.status === "processing") return `The ${item.amount} payout is already on its way.`;
      if (p.status === "not_approver") return "Your account isn't set up as one of the club's approvers.";
      if (p.status === "unavailable") return "The club's account isn't ready for payouts yet. Try again in a minute.";
      if (prep.status === 409) return "Someone already decided that one.";
      if (!prep.ok || p.status !== "ready" || !p.transaction) return "That didn't work. Try again.";
      if (!account) return "Your account is still loading. Try again in a moment.";

      const { signedTransaction } = await signTransaction({
        transaction: fromBase64(p.transaction),
        wallet: account,
        chain: "solana:devnet",
      });

      const sub = await authFetch(`/api/orgs/${orgId}/treasurer/approve/submit`, {
        method: "POST",
        body: JSON.stringify({ id: item.id, transaction: toBase64(signedTransaction) }),
      });
      const s = (await sub.json().catch(() => ({}))) as { status?: string };
      if (s.status === "paid") return `Paid ${item.amount} to ${item.memberName}.`;
      if (s.status === "processing") return `Approved. The ${item.amount} payout is on its way.`;
      if (sub.status === 409) return "That changed while you were approving. Refresh and try again.";
      return "The payout didn't go through. It's still waiting for you; try again.";
    },
    [authFetch, orgId, account, signTransaction],
  );

  const deny = useCallback(
    async (item: Target, note: string): Promise<string> => {
      const res = await authFetch(`/api/orgs/${orgId}/treasurer/decide`, {
        method: "POST",
        body: JSON.stringify({ id: item.id, action: "reject", note }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) return `Denied ${item.amount} from ${item.memberName}. They'll see your note.`;
      if (res.status === 409) return "Someone already decided that one.";
      if (body.error === "note_required") return "Add a note so the member knows why.";
      return "That didn't work. Try again.";
    },
    [authFetch, orgId],
  );

  const retry = useCallback(
    async (item: Target): Promise<string> => {
      const res = await authFetch(`/api/orgs/${orgId}/treasurer/decide`, {
        method: "POST",
        body: JSON.stringify({ id: item.id, action: "retry" }),
      });
      const body = (await res.json().catch(() => ({}))) as { status?: string };
      if (!res.ok) return "That didn't work. Try again.";
      if (body.status === "paid") return `Paid ${item.amount} to ${item.memberName}.`;
      if (body.status === "processing") return `The ${item.amount} payout is on its way.`;
      if (body.status === "queued") return "This one needs your approval now. It's back under Needs approval.";
      if (body.status === "not_payable") return "This one can't be paid as it is. Refresh to see its status.";
      return "The payout still didn't go through. Try again in a minute.";
    },
    [authFetch, orgId],
  );

  return { approve, deny, retry };
}
