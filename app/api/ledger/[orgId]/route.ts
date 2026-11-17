import { connection } from "next/server";
import { loadLedger, viewerIsTreasurer } from "@/lib/ledger/load";
import { loadOrg } from "@/lib/orgs/orgs";
import { explorerAddressUrl } from "@/lib/solana/memo";
import { squadsConfigFor } from "@/lib/solana/squads";

// GET /api/ledger/:orgId: a club's PUBLIC ledger (deliberately outside the
// members-only /api/orgs/ routes). Anyone can read it. If the request comes
// from one of this club's treasurers, each row also says who paid (email);
// everyone else sees only a shortened account address. Also returns a public
// link to the club's Squads vault.
export async function GET(request: Request, ctx: RouteContext<"/api/ledger/[orgId]">) {
  await connection(); // always run per request; never pre-build this response
  try {
    const { orgId } = await ctx.params;
    const org = await loadOrg(orgId);
    if (!org) return Response.json({ error: "no_such_club" }, { status: 404 });

    const isTreasurer = await viewerIsTreasurer(request, org.id);
    const entries = await loadLedger(org.id, isTreasurer);
    const vault = squadsConfigFor(org)?.vault.toBase58();
    return Response.json({
      club: { name: org.name, school: org.school },
      entries,
      showingNames: isTreasurer,
      vaultUrl: vault ? explorerAddressUrl(vault) : null,
    });
  } catch (err) {
    console.error("ledger lookup failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
