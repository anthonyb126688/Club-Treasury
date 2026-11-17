import "server-only";
import { z } from "zod";
import type { OrgAccess } from "@/lib/orgs/access";
import { finishVaultChange, prepareVaultChange } from "@/lib/orgs/vault";
import { parseUserIdParam } from "./rules";
import { BAD_PERSON, checkTarget, refuse, vaultChangeMatches } from "./server";

// Making someone co-treasurer, or removing a treasurer, changes who can
// approve payments from the club's vault. That's an on-chain change the
// current treasurer's own account approves silently (lib/orgs/vault.ts):
//   prepare → the browser approves it → submit.
// The routes under app/api/orgs/[orgId]/members/[userId]/{promote,demote}/
// check the treasurer first, then call these.

export type Flow = "promote" | "demote";

const SubmitBody = z.object({ changeId: z.uuid(), transaction: z.string().min(1).max(10_000) });
const DemoteBody = z.object({ then: z.enum(["demote", "remove"]) });

const badRequest = () => Response.json({ error: "bad_request" }, { status: 400 });

export async function prepareMemberChange(
  access: OrgAccess,
  rawUserId: string,
  flow: Flow,
  request: Request,
): Promise<Response> {
  const userId = parseUserIdParam(rawUserId);
  if (!userId) return BAD_PERSON();

  let then: "demote" | "remove" = "demote";
  if (flow === "demote") {
    const parsed = DemoteBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest();
    then = parsed.data.then;
  }
  const action = flow === "promote" ? "promote" : then === "remove" ? "demote_remove" : "demote";

  const { target, check } = await checkTarget(access.org.id, access.person.userId, userId, action);
  if (!check.ok) return refuse(check);
  if (!target.solanaAddress) {
    return Response.json(
      { error: "not_set_up", message: "That person's account isn't fully set up yet. Ask them to log in once." },
      { status: 409 },
    );
  }

  const result = await prepareVaultChange(
    access.org,
    flow === "promote"
      ? { kind: "add_approver", userId, address: target.solanaAddress }
      : { kind: "remove_approver", userId, address: target.solanaAddress, then },
    access.person,
  );
  if (result.status === "not_ready") {
    return Response.json(
      { status: "not_ready", message: "The club is still being set up. Try again in a minute." },
      { status: 409 },
    );
  }
  if (result.status === "failed") {
    return Response.json({ status: "failed", message: "That didn't work. Try again." }, { status: 502 });
  }
  return Response.json(result);
}

export async function submitMemberChange(
  access: OrgAccess,
  rawUserId: string,
  flow: Flow,
  request: Request,
): Promise<Response> {
  const userId = parseUserIdParam(rawUserId);
  if (!userId) return BAD_PERSON();
  const parsed = SubmitBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest();

  // The prepared change must be for THIS club, this kind, and this person.
  const kind = flow === "promote" ? "add_approver" : "remove_approver";
  const match = await vaultChangeMatches(access.org.id, parsed.data.changeId, kind, userId);
  if (!match) return badRequest();

  // Check again: things may have changed since prepare (e.g. two treasurers
  // removing each other at the same time must not leave the club with none).
  const action = flow === "promote" ? "promote" : match.then === "remove" ? "demote_remove" : "demote";
  const { check } = await checkTarget(access.org.id, access.person.userId, userId, action);
  if (!check.ok) return refuse(check);

  const status = await finishVaultChange(access.org, parsed.data.changeId, access.person, parsed.data.transaction);
  if (status === "conflict") {
    return Response.json(
      { status, message: "That changed while you were approving. Refresh and try again." },
      { status: 409 },
    );
  }
  return Response.json({ status });
}
