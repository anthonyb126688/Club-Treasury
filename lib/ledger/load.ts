import "server-only";
import { db } from "@/lib/db";
import { verifyAccessToken } from "@/lib/wallets/privy-server";
import { toLedgerItem, type LedgerItem, type LedgerRow } from "./view";

/**
 * Is the person making this request the treasurer? Logging in is optional
 * for the ledger: no token or a bad token just means "public visitor".
 */
export async function viewerIsTreasurer(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return false;

  const { data, error } = await db()
    .from("members")
    .select("role")
    .eq("privy_user_id", userId)
    .maybeSingle<{ role: string }>();
  if (error) throw new Error(`role lookup: ${error.message}`);
  return data?.role === "treasurer";
}

/** The most recent ledger entries, newest first, ready to show. */
export async function loadLedger(isTreasurer: boolean, limit = 100): Promise<LedgerItem[]> {
  const { data, error } = await db()
    .from("ledger_entries")
    .select(
      "id, direction, kind, amount_cents, description, signature, created_at, member:members(email, solana_address)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ledger lookup: ${error.message}`);

  return ((data ?? []) as unknown as LedgerRow[]).map((row) => toLedgerItem(row, isTreasurer));
}
