import "server-only";
import { db } from "@/lib/db";
import { currentPeriod, type Period } from "@/lib/dues/period";
import { activeTreasurers } from "@/lib/orgs/orgs";
import { loadOrgSettings } from "@/lib/orgs/settings";
import {
  buildMemberList,
  checkMemberAction,
  totalsByPerson,
  type ActionCheck,
  type MemberAction,
  type MemberListItem,
  type MembershipRow,
  type TargetMembership,
} from "./rules";

// Database side of the treasurer's Members page. Every query is filtered by
// the club's id, so one club's people never show up in another club.

/** Everyone waiting to join or active in this club, with dues + reimbursed totals. */
export async function loadMemberList(
  orgId: string,
  viewerId: string,
): Promise<{ people: MemberListItem[]; period: Period }> {
  const settings = await loadOrgSettings(orgId);
  const period = currentPeriod(settings.duesPeriod);

  const [memberships, dues, paid] = await Promise.all([
    db()
      .from("org_memberships")
      .select("privy_user_id, role, status, requested_at, member:members(email, first_name, last_name)")
      .eq("org_id", orgId)
      .in("status", ["pending", "active"]),
    db()
      .from("dues_payments")
      .select("privy_user_id")
      .eq("org_id", orgId)
      .eq("period", period.id)
      .eq("status", "sent"),
    db()
      .from("reimbursement_requests")
      .select("privy_user_id, total_cents")
      .eq("org_id", orgId)
      .eq("status", "paid"),
  ]);
  if (memberships.error) throw new Error(`members lookup: ${memberships.error.message}`);
  if (dues.error) throw new Error(`dues lookup: ${dues.error.message}`);
  if (paid.error) throw new Error(`reimbursed lookup: ${paid.error.message}`);

  const paidIds = new Set((dues.data ?? []).map((r) => r.privy_user_id as string));
  const totals = totalsByPerson((paid.data ?? []) as { privy_user_id: string; total_cents: number | null }[]);
  const rows = (memberships.data ?? []) as unknown as MembershipRow[];
  return { people: buildMemberList(rows, paidIds, totals, viewerId), period };
}

export type Target = { membership: TargetMembership; solanaAddress: string | null };

/** One person's membership in THIS club (and their account address). */
export async function loadTarget(orgId: string, userId: string): Promise<Target> {
  const { data, error } = await db()
    .from("org_memberships")
    .select("role, status, member:members(solana_address)")
    .eq("org_id", orgId)
    .eq("privy_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`member lookup: ${error.message}`);
  if (!data) return { membership: null, solanaAddress: null };
  const member = data.member as unknown as { solana_address: string | null } | null;
  return {
    membership: { role: data.role, status: data.status } as NonNullable<TargetMembership>,
    solanaAddress: member?.solana_address ?? null,
  };
}

/** Load the person and check the rules for this action. */
export async function checkTarget(
  orgId: string,
  viewerId: string,
  targetId: string,
  action: MemberAction,
): Promise<{ target: Target; check: ActionCheck }> {
  const [target, treasurerIds] = await Promise.all([loadTarget(orgId, targetId), activeTreasurers(orgId)]);
  const check = checkMemberAction(action, target.membership, {
    viewerId,
    targetId,
    activeTreasurerIds: treasurerIds,
  });
  return { target, check };
}

/** Is this prepared vault change the one we expect (same club, kind, person)? */
export async function vaultChangeMatches(
  orgId: string,
  changeId: string,
  kind: "add_approver" | "remove_approver",
  userId: string,
): Promise<{ then?: "demote" | "remove" } | null> {
  const { data, error } = await db()
    .from("org_vault_changes")
    .select("kind, payload, status")
    .eq("org_id", orgId)
    .eq("id", changeId)
    .maybeSingle();
  if (error) throw new Error(`vault change lookup: ${error.message}`);
  const payload = (data?.payload ?? {}) as { userId?: string; then?: "demote" | "remove" };
  if (!data || data.kind !== kind || payload.userId !== userId) return null;
  return { then: payload.then };
}

/** The plain-English refusal for a failed check. */
export function refuse(check: Extract<ActionCheck, { ok: false }>): Response {
  return Response.json(
    { error: check.error, message: check.message },
    { status: check.error === "not_found" ? 404 : 409 },
  );
}

export const BAD_PERSON = () =>
  Response.json({ error: "bad_request", message: "That person isn't in this club." }, { status: 400 });
