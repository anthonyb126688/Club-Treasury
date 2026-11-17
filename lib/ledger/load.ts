import "server-only";
import { db } from "@/lib/db";
import { decideAccess } from "@/lib/orgs/decide-access";
import { currentPerson, loadMembership } from "@/lib/orgs/orgs";
import { toLedgerItem, type LedgerItem, type LedgerRow } from "./view";

/**
 * Is the person making this request a treasurer of THIS club? Logging in is
 * optional for the public ledger: no token or a bad token just means
 * "public visitor".
 */
export async function viewerIsTreasurer(request: Request, orgId: string): Promise<boolean> {
  const person = await currentPerson(request);
  if (!person) return false;
  const membership = await loadMembership(orgId, person.userId);
  return decideAccess(membership, orgId, person.userId, "treasurer") === "ok";
}

/** A club's most recent ledger entries, newest first, ready to show. */
export async function loadLedger(orgId: string, isTreasurer: boolean, limit = 100): Promise<LedgerItem[]> {
  const { data, error } = await db()
    .from("ledger_entries")
    .select(
      "id, direction, kind, amount_cents, description, signature, created_at, member:members(email, solana_address)",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ledger lookup: ${error.message}`);

  return ((data ?? []) as unknown as LedgerRow[]).map((row) => toLedgerItem(row, isTreasurer));
}
