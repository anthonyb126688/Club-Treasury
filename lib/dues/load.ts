import "server-only";
import { db } from "@/lib/db";
import { getChainStatus } from "@/lib/solana/treasury";
import { getMember, verifyAccessToken, type Member } from "@/lib/wallets/privy-server";
import { CURRENT_TERM } from "./config";
import { decideDues, type DuesDecision, type DuesRow } from "./decide";

export type FullDuesRow = DuesRow & {
  id: string;
  privy_user_id: string;
  amount_cents: number;
};

export type DuesContext = {
  userId: string;
  member: Member & { solanaAddress: string };
  row: FullDuesRow | null;
  decision: DuesDecision;
};

/** Who's asking (from their Privy login), and where their dues stand this term. */
export async function loadDuesContext(request: Request): Promise<DuesContext | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return Response.json({ error: "not_logged_in" }, { status: 401 });

  const member = await getMember(userId);
  if (!member.solanaAddress) return Response.json({ error: "not_ready" }, { status: 409 });

  const { data: row, error } = await db()
    .from("dues_payments")
    .select("id, privy_user_id, amount_cents, status, signature, pending_tx, claimed_at")
    .eq("privy_user_id", userId)
    .eq("period", CURRENT_TERM.id)
    .maybeSingle<FullDuesRow>();
  if (error) throw new Error(`dues lookup: ${error.message}`);

  const chain = row?.status === "pending" && row.signature ? await getChainStatus(row.signature) : null;
  return {
    userId,
    member: member as DuesContext["member"],
    row,
    decision: decideDues(row, new Date(), chain),
  };
}
