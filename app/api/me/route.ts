import { connection } from "next/server";
import { currentPerson, myClubs } from "@/lib/orgs/orgs";

// GET /api/me: who's logged in, and every club they're in or have asked to
// join. The app uses it to decide where to send someone after login.
//   404 { error: "not_set_up" } → their account is still being created
//   (the welcome step makes the members row).
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
    return Response.json({
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
      lastOrgId: person.lastOrgId,
      clubs: clubs.map((c) => ({ id: c.org.id, name: c.org.name, school: c.org.school, role: c.role, status: c.status })),
    });
  } catch (err) {
    console.error("me lookup failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
