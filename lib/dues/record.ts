import "server-only";
import { db } from "@/lib/db";

/**
 * Mark a dues payment as paid and add it to the club's public ledger. Safe
 * to call more than once: the ledger allows only one entry per dues payment.
 */
export async function recordDuesPaid(
  row: { id: string; org_id: string; privy_user_id: string; amount_cents: number; signature: string },
  periodLabel: string,
) {
  const { error: updateError } = await db()
    .from("dues_payments")
    .update({ status: "sent", paid_at: new Date().toISOString(), pending_tx: null })
    .eq("org_id", row.org_id)
    .eq("id", row.id);
  if (updateError) throw new Error(`dues update: ${updateError.message}`);

  const { error: ledgerError } = await db()
    .from("ledger_entries")
    .upsert(
      {
        org_id: row.org_id,
        direction: "in",
        kind: "dues",
        amount_cents: row.amount_cents,
        description: `Dues for ${periodLabel}`,
        privy_user_id: row.privy_user_id,
        dues_payment_id: row.id,
        signature: row.signature,
      },
      { onConflict: "dues_payment_id", ignoreDuplicates: true },
    );
  if (ledgerError) throw new Error(`ledger insert: ${ledgerError.message}`);
}
