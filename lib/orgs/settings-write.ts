import "server-only";
import { db } from "@/lib/db";
import { settingsColumns, type SettingsPatch } from "@/lib/budget/settings";
import { makeJoinCode } from "./join-code";

// Writes for a club's settings page (reads are in settings.ts). Callers have
// already checked the person is this club's treasurer (requireTreasurer).

/** Save the changed settings. Takes effect for the next request the policy checks. */
export async function updateOrgSettings(orgId: string, patch: SettingsPatch): Promise<void> {
  const cols = settingsColumns(patch);
  if (Object.keys(cols).length === 0) return;
  const { data, error } = await db()
    .from("org_settings")
    .update({ ...cols, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .select("org_id");
  if (error) throw new Error(`settings update: ${error.message}`);
  if (!data?.length) throw new Error("settings update: no settings row for this club");
}

/** Give the club a new join code (the old one stops working). Retries on a clash. */
export async function regenerateJoinCode(org: { id: string; name: string; join_code: string }): Promise<string> {
  const orgId = org.id;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeJoinCode(org.name);
    if (code === org.join_code) continue;
    const { data, error } = await db().from("orgs").update({ join_code: code }).eq("id", orgId).select("join_code");
    if (!error) {
      if (!data?.length) throw new Error("join code update: club not found");
      return code;
    }
    if (error.code !== "23505") throw new Error(`join code update: ${error.message}`); // 23505 = already taken
  }
  throw new Error("join code update: couldn't find an unused code");
}
