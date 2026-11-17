import "server-only";
import { db } from "@/lib/db";
import type { OrgAccess } from "@/lib/orgs/access";
import { loadOrgSettings, type OrgSettings } from "@/lib/orgs/settings";
import { getChainStatus } from "@/lib/solana/treasury";
import { decideDues, type DuesDecision, type DuesRow } from "./decide";
import { currentPeriod, type Period } from "./period";

export type FullDuesRow = DuesRow & {
  id: string;
  org_id: string;
  privy_user_id: string;
  amount_cents: number;
};

export type DuesContext = {
  access: OrgAccess;
  settings: OrgSettings;
  period: Period;
  row: FullDuesRow | null;
  decision: DuesDecision;
};

/** Where this member's dues stand in this club for the current period. */
export async function loadDuesContext(access: OrgAccess): Promise<DuesContext> {
  const settings = await loadOrgSettings(access.org.id);
  const period = currentPeriod(settings.duesPeriod);

  const { data: row, error } = await db()
    .from("dues_payments")
    .select("id, org_id, privy_user_id, amount_cents, status, signature, pending_tx, claimed_at")
    .eq("org_id", access.org.id)
    .eq("privy_user_id", access.person.userId)
    .eq("period", period.id)
    .maybeSingle<FullDuesRow>();
  if (error) throw new Error(`dues lookup: ${error.message}`);

  const chain = row?.status === "pending" && row.signature ? await getChainStatus(row.signature) : null;
  return { access, settings, period, row, decision: decideDues(row, new Date(), chain) };
}
