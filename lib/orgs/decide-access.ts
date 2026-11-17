// Who may do what in a club. Pure, tested in tests/orgs.test.ts.
// lib/orgs/access.ts wraps this for API routes.

export type MembershipRole = "member" | "treasurer";
export type MembershipStatus = "pending" | "active" | "removed" | "declined";

export type Membership = {
  org_id: string;
  privy_user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
};

export type AccessNeed = "member" | "treasurer";

export type AccessDecision =
  | "ok"
  | "not_member" // no membership, removed, or declined
  | "pending" // asked to join; the treasurer hasn't approved yet
  | "not_treasurer"; // an active member asking for a treasurer action

export function decideAccess(
  membership: Membership | null,
  orgId: string,
  userId: string,
  need: AccessNeed,
): AccessDecision {
  // Belt and braces: the membership must be for THIS club and THIS person.
  if (!membership || membership.org_id !== orgId || membership.privy_user_id !== userId) {
    return "not_member";
  }
  if (membership.status === "pending") return "pending";
  if (membership.status !== "active") return "not_member";
  if (need === "treasurer" && membership.role !== "treasurer") return "not_treasurer";
  return "ok";
}

/** A club must always keep at least one active treasurer. */
export function wouldLeaveNoTreasurer(
  activeTreasurerIds: readonly string[],
  leavingOrDemotedUserId: string,
): boolean {
  return activeTreasurerIds.filter((id) => id !== leavingOrDemotedUserId).length === 0;
}
