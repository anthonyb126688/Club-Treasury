import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkNames } from "@/lib/orgs/onboarding";
import { currentPerson, loadMembership, myClubs } from "@/lib/orgs/orgs";

// GET /api/me: who's logged in, and every club they're in or have asked to
// join. The app uses it to decide where to send someone after login.
//   404 { error: "not_set_up" } → their account is still being created
//   (the welcome step makes the members row).
// Treasurers also get each club's join code (to share the invite).
export async function GET(request: Request) {
  await connection();
  try {
    const person = await currentPerson(request);
    if (!person) {
      const hasToken = request.headers.get("authorization")?.startsWith("Bearer ");
      return hasToken
        ? Response.json({ error: "not_set_up" }, { status: 404 })
        : Response.json({ error: "not_logged_in" }, { status: 401 });
    }
    const clubs = await myClubs(person.userId);

    const treasurerOf = clubs.filter((c) => c.role === "treasurer" && c.status === "active").map((c) => c.org.id);
    const joinCodes = new Map<string, string>();
    if (treasurerOf.length) {
      const { data, error } = await db().from("orgs").select("id, join_code").in("id", treasurerOf);
      if (error) throw new Error(`join codes lookup: ${error.message}`);
      for (const row of data ?? []) joinCodes.set(row.id as string, row.join_code as string);
    }

    return Response.json({
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
      lastOrgId: person.lastOrgId,
      clubs: clubs.map((c) => ({
        id: c.org.id,
        name: c.org.name,
        school: c.org.school,
        role: c.role,
        status: c.status,
        ...(joinCodes.has(c.org.id) ? { joinCode: joinCodes.get(c.org.id) } : {}),
      })),
    });
  } catch (err) {
    console.error("me lookup failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}

const PatchBody = z
  .object({
    firstName: z.string().max(200).optional(),
    lastName: z.string().max(200).optional(),
    lastOrgId: z.uuid().optional(),
  })
  .refine((b) => (b.firstName === undefined) === (b.lastName === undefined), {
    message: "first and last name go together",
  });

// PATCH /api/me: save your name ({ firstName, lastName }) and/or the club
// you last opened ({ lastOrgId }, must be a club you're an active member of).
//   400 { error: "bad_name", message } | 403 { error: "not_member" }
export async function PATCH(request: Request) {
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    const person = await currentPerson(request);
    if (!person) return Response.json({ error: "not_logged_in" }, { status: 401 });

    const update: Record<string, string> = {};
    if (parsed.data.firstName !== undefined && parsed.data.lastName !== undefined) {
      const names = checkNames({ firstName: parsed.data.firstName, lastName: parsed.data.lastName });
      if (!names.ok) return Response.json({ error: "bad_name", message: names.error }, { status: 400 });
      update.first_name = names.firstName;
      update.last_name = names.lastName;
    }
    if (parsed.data.lastOrgId) {
      const membership = await loadMembership(parsed.data.lastOrgId, person.userId);
      if (membership?.status !== "active") return Response.json({ error: "not_member" }, { status: 403 });
      update.last_org_id = parsed.data.lastOrgId;
    }
    if (Object.keys(update).length === 0) return Response.json({ status: "ok" });

    const { error } = await db().from("members").update(update).eq("privy_user_id", person.userId);
    if (error) throw new Error(`member update: ${error.message}`);
    return Response.json({ status: "ok" });
  } catch (err) {
    console.error("me update failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
