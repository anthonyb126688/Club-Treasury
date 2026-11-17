import { connection } from "next/server";
import { db } from "@/lib/db";
import { normalizeJoinCode } from "@/lib/orgs/join-code";
import { joinAction } from "@/lib/orgs/onboarding";
import { currentPerson, loadMembership, loadOrgByJoinCode } from "@/lib/orgs/orgs";

// Joining a club by its code (typed in, or from an invite link /join/CODE).
// Logged-in people only. Someone who isn't in the club only ever learns its
// name and school.

const notFound = () => Response.json({ error: "no_such_club" }, { status: 404 });

// GET /api/join/:code → { code, name, school, status, orgId? }
//   status: your membership ("active" | "pending" | "declined" | "removed")
//   or null. orgId only when you're active or pending (to open the club or
//   the waiting screen).
export async function GET(request: Request, ctx: RouteContext<"/api/join/[code]">) {
  await connection();
  const code = normalizeJoinCode(decodeURIComponent((await ctx.params).code));
  if (!code) return notFound();
  try {
    const person = await currentPerson(request);
    if (!person) return Response.json({ error: "not_logged_in" }, { status: 401 });
    const org = await loadOrgByJoinCode(code);
    if (!org) return notFound();
    const membership = await loadMembership(org.id, person.userId);
    const status = membership?.status ?? null;
    const shareId = status === "active" || status === "pending";
    return Response.json({ code, name: org.name, school: org.school, status, ...(shareId ? { orgId: org.id } : {}) });
  } catch (err) {
    console.error("join lookup failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}

// POST /api/join/:code: ask to join. Creates a pending request, or puts a
// declined/removed one back to pending. Already active → nothing changes.
//   → { status: "pending" | "active", orgId }
export async function POST(request: Request, ctx: RouteContext<"/api/join/[code]">) {
  const code = normalizeJoinCode(decodeURIComponent((await ctx.params).code));
  if (!code) return notFound();
  try {
    const person = await currentPerson(request);
    if (!person) return Response.json({ error: "not_logged_in" }, { status: 401 });
    const org = await loadOrgByJoinCode(code);
    if (!org) return notFound();
    const orgId = org.id;

    const existing = await loadMembership(orgId, person.userId);
    const action = joinAction(existing?.status ?? null);
    if (action === "already_active") {
      await db().from("members").update({ last_org_id: orgId }).eq("privy_user_id", person.userId);
      return Response.json({ status: "active", orgId });
    }
    if (action === "already_pending") return Response.json({ status: "pending", orgId });

    const now = new Date().toISOString();
    if (action === "insert") {
      const { error } = await db().from("org_memberships").insert({
        org_id: orgId,
        privy_user_id: person.userId,
        role: "member",
        status: "pending",
        requested_at: now,
      });
      // A double tap can race to insert; the unique (org, person) row wins.
      if (error && !/duplicate|unique/i.test(error.message)) throw new Error(`join insert: ${error.message}`);
    } else {
      // Declined or removed before: ask again, as a regular member.
      const { error } = await db()
        .from("org_memberships")
        .update({ status: "pending", role: "member", requested_at: now, approved_at: null, approved_by: null })
        .eq("org_id", orgId)
        .eq("privy_user_id", person.userId)
        .in("status", ["declined", "removed"]);
      if (error) throw new Error(`join reopen: ${error.message}`);
    }
    return Response.json({ status: "pending", orgId });
  } catch (err) {
    console.error("join request failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
