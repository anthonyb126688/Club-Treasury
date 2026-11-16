import { connection } from "next/server";
import { loadLedger, viewerIsTreasurer } from "@/lib/ledger/load";

// GET /api/ledger: the public ledger. Anyone can read it. If the request
// comes from the treasurer's login, each row also says who paid (email);
// for everyone else it shows only a shortened account address.
export async function GET(request: Request) {
  await connection(); // always run per request; never pre-build this response
  try {
    const isTreasurer = await viewerIsTreasurer(request);
    const entries = await loadLedger(isTreasurer);
    return Response.json({ entries, showingNames: isTreasurer });
  } catch (err) {
    console.error("ledger lookup failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
