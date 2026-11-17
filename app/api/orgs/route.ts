import { z } from "zod";
import { db } from "@/lib/db";
import { createClub } from "@/lib/orgs/create";
import { cleanClubText, CLUB_TEXT_MAX } from "@/lib/orgs/onboarding";
import { currentPerson } from "@/lib/orgs/orgs";

const Body = z.object({
  name: z.string().max(CLUB_TEXT_MAX * 2),
  school: z.string().max(CLUB_TEXT_MAX * 2),
});

// POST /api/orgs { name, school }: create a club. The person creating it
// becomes its treasurer. Takes several seconds (it sets up the club's vault).
//   → { orgId, joinCode, vault: "ready" | "failed" }
//   "failed" can be retried with POST /api/orgs/:orgId/vault/retry.
//   400 { error: "bad_name" | "bad_school" }
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const name = cleanClubText(parsed.data.name);
  const school = cleanClubText(parsed.data.school);
  if (!name) return Response.json({ error: "bad_name" }, { status: 400 });
  if (!school) return Response.json({ error: "bad_school" }, { status: 400 });

  try {
    const person = await currentPerson(request);
    if (!person) return Response.json({ error: "not_logged_in" }, { status: 401 });

    const { orgId, vault } = await createClub(person, { name, school });
    const { data, error } = await db().from("orgs").select("join_code").eq("id", orgId).single();
    if (error) throw new Error(`join code lookup: ${error.message}`);
    return Response.json({ orgId, joinCode: data.join_code as string, vault });
  } catch (err) {
    console.error("create club failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
