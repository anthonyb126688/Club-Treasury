// Pure: turns a ledger row from the database into what the ledger page shows.
// Decided Nov 16: the treasurer sees who paid (email); everyone else sees only
// a shortened account address. This runs on the SERVER, so emails never
// reach a non-treasurer's browser at all.
import { centsToUnits, formatUsd } from "@/lib/money";

export type LedgerRow = {
  id: string;
  direction: "in" | "out";
  kind: "dues" | "reimbursement" | "deposit";
  amount_cents: number;
  description: string;
  signature: string;
  created_at: string;
  member: { email: string | null; solana_address: string } | null;
};

export type LedgerItem = {
  id: string;
  direction: "in" | "out";
  kind: LedgerRow["kind"];
  amount: string; // "$25.00"
  description: string; // plain text only, never rendered as HTML
  who: string | null; // email (treasurer) or "7xKp…3fQa" (everyone else)
  date: string; // ISO timestamp
  verifyUrl: string;
};

/** "7xKpAbCd...Xy3fQa" → "7xKp…3fQa" */
export function shortAddress(address: string): string {
  return address.length <= 10 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Public Solana Explorer page for this payment (devnet only). */
export function verifyUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function toLedgerItem(row: LedgerRow, viewerIsTreasurer: boolean): LedgerItem {
  let who: string | null = null;
  if (row.member) {
    who =
      viewerIsTreasurer && row.member.email
        ? row.member.email
        : shortAddress(row.member.solana_address);
  }
  return {
    id: row.id,
    direction: row.direction,
    kind: row.kind,
    amount: formatUsd(centsToUnits(row.amount_cents)),
    description: row.description,
    who,
    date: row.created_at,
    verifyUrl: verifyUrl(row.signature),
  };
}
