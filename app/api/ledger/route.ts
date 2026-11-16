import { connection } from "next/server";
import { loadLedger, viewerIsTreasurer } from "@/lib/ledger/load";
import { explorerAddressUrl } from "@/lib/solana/memo";
import { squadsConfig } from "@/lib/solana/squads";

// GET /api/ledger: the public ledger. Anyone can read it. If the request
// comes from the treasurer's login, each row also says who paid (email);
// for everyone else it shows only a shortened account address.
// Also returns a public link to the club's Squads vault, if it's set up.
export async function GET(request: Request) {
  await connection(); // always run per request; never pre-build this response
  try {
    const isTreasurer = await viewerIsTreasurer(request);
    const entries = await loadLedger(isTreasurer);
    const vault = squadsConfig()?.vault.toBase58();
    return Response.json({
      entries,
      showingNames: isTreasurer,
      vaultUrl: vault ? explorerAddressUrl(vault) : null,
    });
  } catch (err) {
    console.error("ledger lookup failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
