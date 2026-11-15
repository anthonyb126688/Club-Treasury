import { db } from "@/lib/db";
import { getChainStatus, submit, waitForConfirmation } from "@/lib/solana/treasury";
import { signWelcomePayment } from "@/lib/solana/welcome";
import { decideWelcome, type WelcomeRow } from "@/lib/welcome/decide";
import { getMember, verifyAccessToken } from "@/lib/wallets/privy-server";

// POST /api/welcome: give a new member their one-time $50, exactly once.
// Who the member is and where the money goes both come from Privy on the
// server; the browser only proves it's logged in.
//
// Responses: { status: "sent" | "pending" }. "pending" means try again shortly.
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return Response.json({ error: "not_logged_in" }, { status: 401 });

  try {
    const member = await getMember(userId);
    if (!member.solanaAddress) return Response.json({ status: "pending" });

    const members = db().from("members");
    const { data: row, error } = await members
      .select("welcome_status, welcome_signature, welcome_claimed_at")
      .eq("privy_user_id", userId)
      .maybeSingle<WelcomeRow>();
    if (error) throw new Error(`members lookup: ${error.message}`);

    const chain = row?.welcome_signature ? await getChainStatus(row.welcome_signature) : null;
    const decision = decideWelcome(row, new Date(), chain);

    if (decision === "done") return Response.json({ status: "sent" });
    if (decision === "wait") return Response.json({ status: "pending" });
    if (decision === "mark_sent") {
      await members
        .update({ welcome_status: "sent", welcomed_at: new Date().toISOString() })
        .eq("privy_user_id", userId);
      return Response.json({ status: "sent" });
    }

    // claim_new or retry: claim the row atomically BEFORE paying, so two
    // requests at once can't both pay.
    let claimed: boolean;
    if (decision === "claim_new") {
      const { data, error: insertError } = await members
        .upsert(
          { privy_user_id: userId, email: member.email, solana_address: member.solanaAddress },
          { onConflict: "privy_user_id", ignoreDuplicates: true },
        )
        .select("privy_user_id");
      if (insertError) throw new Error(`members insert: ${insertError.message}`);
      claimed = (data?.length ?? 0) > 0;
    } else {
      const { data, error: claimError } = await members
        .update({
          welcome_status: "pending",
          welcome_signature: null,
          welcome_claimed_at: new Date().toISOString(),
        })
        .eq("privy_user_id", userId)
        .eq("welcome_status", row!.welcome_status)
        .eq("welcome_claimed_at", row!.welcome_claimed_at)
        .select("privy_user_id");
      if (claimError) throw new Error(`members claim: ${claimError.message}`);
      claimed = (data?.length ?? 0) > 0;
    }
    if (!claimed) return Response.json({ status: "pending" });

    // Sign, save the signature, THEN send. A later retry can always check
    // whether this exact payment landed.
    const payment = await signWelcomePayment(member.solanaAddress);
    await members
      .update({ welcome_signature: payment.signature })
      .eq("privy_user_id", userId);
    await submit(payment);

    const result = await waitForConfirmation(payment.signature);
    if (result === "confirmed") {
      await members
        .update({ welcome_status: "sent", welcomed_at: new Date().toISOString() })
        .eq("privy_user_id", userId);
      return Response.json({ status: "sent" });
    }
    if (result === "failed") {
      await members.update({ welcome_status: "failed" }).eq("privy_user_id", userId);
    }
    return Response.json({ status: "pending" });
  } catch (err) {
    // Log only the message: never the token, keys, or RPC URL.
    console.error("welcome failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
