import "server-only";
import { db } from "@/lib/db";
import { CURRENT_TERM } from "./config";

/**
 * Mark a dues payment as paid and add it to the public ledger. Safe to call
 * more than once: the ledger allows only one entry per dues payment.
 */
export async function recordDuesPaid(row: {
  id: string;
  privy_user_id: string;
  amount_cents: number;
  signature: string;
}) {
  const { error: updateError } = await db()
    .from("dues_payments")
    .update({ status: "sent", paid_at: new Date().toISOString(), pending_tx: null })
    .eq("id", row.id);
  if (updateError) throw new Error(`dues update: ${updateError.message}`);

  const { error: ledgerError } = await db()
    .from("ledger_entries")
    .upsert(
      {
        direction: "in",
        kind: "dues",
        amount_cents: row.amount_cents,
        description: `Dues for ${CURRENT_TERM.label}`,
        privy_user_id: row.privy_user_id,
        dues_payment_id: row.id,
        signature: row.signature,
      },
      { onConflict: "dues_payment_id", ignoreDuplicates: true },
    );
  if (ledgerError) throw new Error(`ledger insert: ${ledgerError.message}`);
}
