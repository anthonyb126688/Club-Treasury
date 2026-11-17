import { requireTreasurer } from "@/lib/orgs/access";
import { loadOrgSettings } from "@/lib/orgs/settings";
import { createClubVault } from "@/lib/orgs/vault";

// POST /api/orgs/:orgId/vault/retry: finish setting up a new club's vault
// after it failed during "create club". Safe to repeat: createClubVault
// picks up where it left off. Treasurer only.
//   → { vault: "ready" | "failed" }
export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/vault/retry">) {
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  if (access.org.vault_status === "ready") return Response.json({ vault: "ready" });
  try {
    const settings = await loadOrgSettings(orgId);
    const vault = await createClubVault(orgId, access.person.solanaAddress, settings.dailyAutoApproveLimitCents);
    return Response.json({ vault });
  } catch (err) {
    console.error("vault retry failed:", (err as Error).message);
    return Response.json({ vault: "failed" }, { status: 502 });
  }
}
