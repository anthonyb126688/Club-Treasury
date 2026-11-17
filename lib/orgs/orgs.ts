import "server-only";
import { db } from "@/lib/db";
import { verifyAccessToken } from "@/lib/wallets/privy-server";
import type { Membership } from "./decide-access";

// Clubs ("orgs"), people, and memberships: the shared lookups every
// club-aware route and page uses.

export const DEFAULT_ORG_ID = "00000000-0000-4000-8000-000000000001";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Org = {
  id: string;
  name: string;
  school: string;
  join_code: string;
  squads_multisig_address: string | null;
  squads_vault_address: string | null;
  squads_spending_limit_address: string | null;
  vault_status: "pending" | "ready" | "failed";
  created_at: string;
};

export const ORG_COLUMNS =
  "id, name, school, join_code, squads_multisig_address, squads_vault_address, squads_spending_limit_address, vault_status, created_at";

/** A logged-in person (one row in `members`, whatever clubs they're in). */
export type Person = {
  userId: string;
  email: string | null;
  solanaAddress: string;
  firstName: string | null;
  lastName: string | null;
  lastOrgId: string | null;
};

/** "Ada Lovelace", or the email, or "A member". */
export function displayName(p: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  return name || p.email || "A member";
}

/**
 * Who's making this request, from their Privy login. Null if not logged in,
 * or not set up yet (the members row is created by the welcome step).
 */
export async function currentPerson(request: Request): Promise<Person | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return null;
  const { data, error } = await db()
    .from("members")
    .select("email, solana_address, first_name, last_name, last_org_id")
    .eq("privy_user_id", userId)
    .maybeSingle<{
      email: string | null;
      solana_address: string;
      first_name: string | null;
      last_name: string | null;
      last_org_id: string | null;
    }>();
  if (error) throw new Error(`member lookup: ${error.message}`);
  if (!data) return null;
  return {
    userId,
    email: data.email,
    solanaAddress: data.solana_address,
    firstName: data.first_name,
    lastName: data.last_name,
    lastOrgId: data.last_org_id,
  };
}

export async function loadOrg(orgId: string): Promise<Org | null> {
  if (!UUID_PATTERN.test(orgId)) return null;
  const { data, error } = await db().from("orgs").select(ORG_COLUMNS).eq("id", orgId).maybeSingle<Org>();
  if (error) throw new Error(`org lookup: ${error.message}`);
  return data;
}

export async function loadOrgByJoinCode(code: string): Promise<Org | null> {
  const { data, error } = await db().from("orgs").select(ORG_COLUMNS).eq("join_code", code).maybeSingle<Org>();
  if (error) throw new Error(`org lookup: ${error.message}`);
  return data;
}

export async function loadMembership(orgId: string, userId: string): Promise<Membership | null> {
  const { data, error } = await db()
    .from("org_memberships")
    .select("org_id, privy_user_id, role, status")
    .eq("org_id", orgId)
    .eq("privy_user_id", userId)
    .maybeSingle<Membership>();
  if (error) throw new Error(`membership lookup: ${error.message}`);
  return data;
}

export type MyClub = { org: Pick<Org, "id" | "name" | "school">; role: Membership["role"]; status: Membership["status"] };

/** Every club this person belongs to or has asked to join. */
export async function myClubs(userId: string): Promise<MyClub[]> {
  const { data, error } = await db()
    .from("org_memberships")
    .select("role, status, org:orgs(id, name, school)")
    .eq("privy_user_id", userId)
    .in("status", ["active", "pending"])
    .order("requested_at", { ascending: true });
  if (error) throw new Error(`clubs lookup: ${error.message}`);
  return (data ?? []) as unknown as MyClub[];
}

/** Active treasurers of a club (their user ids). */
export async function activeTreasurers(orgId: string): Promise<string[]> {
  const { data, error } = await db()
    .from("org_memberships")
    .select("privy_user_id")
    .eq("org_id", orgId)
    .eq("role", "treasurer")
    .eq("status", "active");
  if (error) throw new Error(`treasurers lookup: ${error.message}`);
  return (data ?? []).map((r) => r.privy_user_id as string);
}
