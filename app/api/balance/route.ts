import { db } from "@/lib/db";
import { formatUsd } from "@/lib/money";
import { getDollarBalance } from "@/lib/solana/balance";
import { getMember, verifyAccessToken } from "@/lib/wallets/privy-server";

// GET /api/balance — the logged-in member's email and dollar balance.
// The browser sends its Privy login token; we work out who it is server-side.
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) {
    return Response.json({ error: "not_logged_in" }, { status: 401 });
  }

  try {
    const member = await getMember(userId);
    if (!member.solanaAddress) {
      // Account is still being set up right after first login.
      return Response.json({ email: member.email, balance: null, ready: false });
    }
    const [units, role] = await Promise.all([
      getDollarBalance(member.solanaAddress),
      db()
        .from("members")
        .select("role")
        .eq("privy_user_id", userId)
        .maybeSingle<{ role: string }>(),
    ]);
    return Response.json({
      email: member.email,
      balance: formatUsd(units),
      ready: true,
      isTreasurer: role.data?.role === "treasurer",
    });
  } catch (err) {
    // Log only the message: never the token, keys, or RPC URL.
    console.error("balance lookup failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
