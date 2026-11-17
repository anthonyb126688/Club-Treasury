import "server-only";
import { decideAccess, type AccessNeed, type Membership } from "./decide-access";
import { currentPerson, loadMembership, loadOrg, type Org, type Person } from "./orgs";

// The club gatekeeper. EVERY API route under app/api/orgs/[orgId]/ starts
// with requireMember or requireTreasurer (tests/route-guards.test.ts checks).
// After it passes, every query must filter by this org's id.

export type OrgAccess = { person: Person; membership: Membership; org: Org };

const deny = (status: number, error: string) => Response.json({ error }, { status });

async function requireAccess(request: Request, orgId: string, need: AccessNeed): Promise<OrgAccess | Response> {
  const person = await currentPerson(request);
  if (!person) return deny(401, "not_logged_in");

  const org = await loadOrg(orgId);
  if (!org) return deny(404, "no_such_club");

  const membership = await loadMembership(org.id, person.userId);
  const decision = decideAccess(membership, org.id, person.userId, need);
  if (decision === "pending") return deny(403, "pending");
  if (decision === "not_member") return deny(403, "not_member");
  if (decision === "not_treasurer") return deny(403, "not_treasurer");
  return { person, membership: membership!, org };
}

/** An active member (or treasurer) of this club, or a 401/403/404 Response. */
export function requireMember(request: Request, orgId: string) {
  return requireAccess(request, orgId, "member");
}

/** An active treasurer of this club, or a 401/403/404 Response. */
export function requireTreasurer(request: Request, orgId: string) {
  return requireAccess(request, orgId, "treasurer");
}
