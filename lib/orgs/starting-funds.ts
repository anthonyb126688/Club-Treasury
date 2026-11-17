import "server-only";
import { db } from "@/lib/db";
import { clubHolderAddress } from "@/lib/solana/squads";
import { depositToTreasury } from "@/lib/solana/transfer";
import { loadOrg } from "./orgs";

/** Every new club starts with $1,000 of test dollars (devnet only). */
export const STARTING_FUNDS_CENTS = 100_000;

export type StartingFundsResult =
  | { status: "deposited"; signature: string; explorerUrl: string }
  | { status: "already_funded" }
  | { status: "not_confirmed"; explorerUrl: string };

/**
 * Put starting test dollars into a club's vault and record it on the club's
 * public ledger as "Starting club funds". Does nothing if the club already
 * has a deposit on its ledger, so it's safe to call again. The vault must
 * be set up first.
 */
export async function giveStartingFunds(
  orgId: string,
  amountCents: number = STARTING_FUNDS_CENTS,
): Promise<StartingFundsResult> {
  const org = await loadOrg(orgId);
  if (!org) throw new Error("No such club");

  const { data: existing, error } = await db()
    .from("ledger_entries")
    .select("id")
    .eq("org_id", orgId)
    .eq("kind", "deposit")
    .limit(1);
  if (error) throw new Error(`ledger lookup: ${error.message}`);
  if (existing.length > 0) return { status: "already_funded" };

  const result = await depositToTreasury(amountCents, `club-treasury:deposit:${orgId}`, clubHolderAddress(org));
  if (result.status !== "confirmed") return { status: "not_confirmed", explorerUrl: result.explorerUrl };

  const { error: insertError } = await db().from("ledger_entries").insert({
    org_id: orgId,
    direction: "in",
    kind: "deposit",
    amount_cents: amountCents,
    description: "Starting club funds",
    signature: result.signature,
  });
  if (insertError) throw new Error(`ledger insert: ${insertError.message}`);
  return { status: "deposited", signature: result.signature, explorerUrl: result.explorerUrl };
}

/** Same, for the create-club flow: never fails club creation, just logs. */
export async function tryGiveStartingFunds(orgId: string): Promise<void> {
  try {
    const result = await giveStartingFunds(orgId);
    if (result.status === "not_confirmed") console.error("starting funds not confirmed:", result.explorerUrl);
  } catch (err) {
    console.error("starting funds failed:", (err as Error).message);
  }
}
