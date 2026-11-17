import { connection } from "next/server";
import { SettingsPatchBody } from "@/lib/budget/settings";
import { requireTreasurer } from "@/lib/orgs/access";
import { loadOrgSettings } from "@/lib/orgs/settings";
import { updateOrgSettings } from "@/lib/orgs/settings-write";

// GET /api/orgs/:orgId/settings: this club's settings, join code, and whether
// its vault is set up. PATCH saves dues / auto-approve cap / receipt age (the
// daily limit changes on-chain, via settings/daily-limit). Treasurer only.
// Queries filter by org_id inside lib/orgs/settings*.ts.

export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/settings">) {
  await connection();
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const settings = await loadOrgSettings(orgId);
    return Response.json({
      settings,
      joinCode: access.org.join_code,
      vaultReady: access.org.vault_status === "ready" && access.org.squads_spending_limit_address !== null,
    });
  } catch (err) {
    console.error("settings load failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/settings">) {
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  try {
    const parsed = SettingsPatchBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
    await updateOrgSettings(orgId, parsed.data);
    return Response.json({ settings: await loadOrgSettings(orgId) });
  } catch (err) {
    console.error("settings save failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
