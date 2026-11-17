// The treasurer's Members page: pure helpers (no database), tested in
// tests/members.test.ts. lib/members/server.ts and the API routes under
// app/api/orgs/[orgId]/members/ use these.
import { wouldLeaveNoTreasurer, type MembershipRole, type MembershipStatus } from "@/lib/orgs/decide-access";

// ---- Who's being acted on ------------------------------------------------------

/** Privy user ids look like "did:privy:abc123". */
const PRIVY_USER_ID = /^did:privy:[A-Za-z0-9_-]{1,100}$/;

/**
 * The user id from the URL (the page sends it through encodeURIComponent).
 * Accepts it already decoded or still encoded; null if it isn't a Privy id.
 */
export function parseUserIdParam(raw: string): string | null {
  if (PRIVY_USER_ID.test(raw)) return raw;
  try {
    const decoded = decodeURIComponent(raw);
    return PRIVY_USER_ID.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

// ---- What the treasurer may do -----------------------------------------------

export type MemberAction =
  | "approve" // let a pending person in
  | "decline" // turn a pending person down
  | "remove" // remove a regular member (not a treasurer)
  | "promote" // make co-treasurer (vault change)
  | "demote" // treasurer → regular member (vault change)
  | "demote_remove"; // treasurer → out of the club (vault change)

export type TargetMembership = { role: MembershipRole; status: MembershipStatus } | null;

export type MemberActionError =
  | "not_found"
  | "already_handled"
  | "not_active"
  | "already_treasurer"
  | "is_treasurer"
  | "not_treasurer"
  | "remove_self"
  | "last_treasurer"
  | "founder";

export const MEMBER_ACTION_MESSAGES: Record<MemberActionError, string> = {
  not_found: "That person isn't in this club.",
  already_handled: "That request was already handled. Refresh to see the latest.",
  not_active: "That person isn't an active member of this club.",
  already_treasurer: "That person is already a treasurer.",
  is_treasurer: "That person is a treasurer. Remove them as treasurer first.",
  not_treasurer: "That person isn't a treasurer.",
  remove_self: "You can't remove yourself here. Use Leave club instead.",
  last_treasurer: "A club needs at least one treasurer. Make someone else co-treasurer first.",
  founder: "Only the club's founder can change their own role.",
};

export type ActionCheck = { ok: true } | { ok: false; error: MemberActionError; message: string };

const fail = (error: MemberActionError): ActionCheck => ({ ok: false, error, message: MEMBER_ACTION_MESSAGES[error] });

/**
 * May the treasurer `viewerId` do `action` to `targetId`, whose membership in
 * THIS club is `target`? `activeTreasurerIds` = the club's active treasurers.
 * `founderId` = who created the club: co-treasurers can't demote or remove
 * them; only the founder can step down.
 */
export function checkMemberAction(
  action: MemberAction,
  target: TargetMembership,
  ctx: { viewerId: string; targetId: string; activeTreasurerIds: readonly string[]; founderId?: string | null },
): ActionCheck {
  if (!target || target.status === "removed" || target.status === "declined") return fail("not_found");

  if (action === "approve" || action === "decline") {
    return target.status === "pending" ? { ok: true } : fail("already_handled");
  }

  if (target.status !== "active") return fail("not_active");
  const self = ctx.viewerId === ctx.targetId;
  const isFounder = !!ctx.founderId && ctx.targetId === ctx.founderId;
  if (isFounder && !self && action !== "promote") return fail("founder");

  if (action === "remove") {
    if (self) return fail("remove_self");
    if (target.role === "treasurer") return fail("is_treasurer");
    return { ok: true };
  }
  if (action === "promote") {
    return target.role === "treasurer" ? fail("already_treasurer") : { ok: true };
  }

  // demote / demote_remove
  if (target.role !== "treasurer") return fail("not_treasurer");
  if (action === "demote_remove" && self) return fail("remove_self");
  if (wouldLeaveNoTreasurer(ctx.activeTreasurerIds, ctx.targetId)) return fail("last_treasurer");
  return { ok: true };
}

// ---- The list ----------------------------------------------------------------

export type MembershipRow = {
  privy_user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  requested_at: string;
  member: { email: string | null; first_name: string | null; last_name: string | null } | null;
};

export type MemberListItem = {
  userId: string;
  name: string;
  email: string | null;
  role: MembershipRole;
  status: "pending" | "active";
  requestedAt: string;
  duesPaidThisPeriod: boolean;
  totalReimbursedCents: number;
  isYou: boolean;
  /** Created the club. Other treasurers can't demote or remove them. */
  isFounder: boolean;
};

/** "Ada Lovelace", or the email, or "A member" (same as lib/orgs displayName). */
export function personName(m: MembershipRow["member"]): string {
  const name = [m?.first_name, m?.last_name].filter(Boolean).join(" ").trim();
  return name || m?.email || "A member";
}

/** Sum of paid reimbursements per person. */
export function totalsByPerson(rows: readonly { privy_user_id: string; total_cents: number | null }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.privy_user_id, (totals.get(r.privy_user_id) ?? 0) + (r.total_cents ?? 0));
  return totals;
}

/**
 * Pending requests first (oldest first, so nobody waits forever), then active
 * people: treasurers, then everyone else, each by name. Removed and declined
 * people are left out.
 */
export function buildMemberList(
  memberships: readonly MembershipRow[],
  paidDuesIds: ReadonlySet<string>,
  reimbursedCents: ReadonlyMap<string, number>,
  viewerId: string,
  founderId: string | null = null,
): MemberListItem[] {
  const items: MemberListItem[] = memberships
    .filter((m): m is MembershipRow & { status: "pending" | "active" } => m.status === "pending" || m.status === "active")
    .map((m) => ({
      userId: m.privy_user_id,
      name: personName(m.member),
      email: m.member?.email ?? null,
      role: m.role,
      status: m.status,
      requestedAt: m.requested_at,
      duesPaidThisPeriod: m.status === "active" && paidDuesIds.has(m.privy_user_id),
      totalReimbursedCents: reimbursedCents.get(m.privy_user_id) ?? 0,
      isYou: m.privy_user_id === viewerId,
      isFounder: !!founderId && m.privy_user_id === founderId,
    }));

  const rank = (i: MemberListItem) => (i.status === "pending" ? 0 : i.role === "treasurer" ? 1 : 2);
  return items.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.status === "pending") return a.requestedAt.localeCompare(b.requestedAt);
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}
