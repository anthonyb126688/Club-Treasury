import "server-only";
import { db } from "@/lib/db";
import type { PolicyContext } from "@/lib/policy/decide";
import { CATEGORY_LABELS, DEFAULT_RULES, type Category, type PolicyRules } from "@/lib/policy/rules";
import { getChainStatus, submit, waitForConfirmation } from "@/lib/solana/treasury";
import { signDollarTransfer } from "@/lib/solana/transfer";
import { verifyAccessToken } from "@/lib/wallets/privy-server";
import { decidePayout, type PayoutRow, type RequestStatus } from "./decide";

export const RECEIPT_BUCKET = "receipts";

export type CurrentMember = {
  userId: string;
  email: string | null;
  solanaAddress: string;
  role: "member" | "treasurer";
};

/**
 * Who's making this request, from their Privy login. Null if not logged in,
 * or not set up yet (the members row is created by the welcome step).
 */
export async function currentMember(request: Request): Promise<CurrentMember | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return null;
  const { data, error } = await db()
    .from("members")
    .select("email, solana_address, role")
    .eq("privy_user_id", userId)
    .maybeSingle<{ email: string | null; solana_address: string; role: "member" | "treasurer" }>();
  if (error) throw new Error(`member lookup: ${error.message}`);
  if (!data) return null;
  return { userId, email: data.email, solanaAddress: data.solana_address, role: data.role };
}

/** Today's date (UTC) as YYYY-MM-DD. */
export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Policy rules, with monthly budgets from the category_budgets table. */
export async function loadRules(): Promise<PolicyRules> {
  const { data, error } = await db()
    .from("category_budgets")
    .select("category, monthly_limit_cents");
  if (error) throw new Error(`budgets lookup: ${error.message}`);
  const budgets = { ...DEFAULT_RULES.monthlyBudgetCents };
  for (const row of (data ?? []) as { category: Category; monthly_limit_cents: number }[]) {
    budgets[row.category] = row.monthly_limit_cents;
  }
  return { ...DEFAULT_RULES, monthlyBudgetCents: budgets };
}

const sum = (rows: { total_cents: number | null }[] | null) =>
  (rows ?? []).reduce((total, r) => total + (r.total_cents ?? 0), 0);

/** The facts the policy needs about everything else that's been submitted. */
export async function loadPolicyContext(args: {
  requestId: string;
  category: Category;
  imageHash: string;
  dedupeKey: string | null;
  today: string;
  memberEdited: PolicyContext["memberEdited"];
}): Promise<PolicyContext & { duplicateOf: string | null }> {
  const requests = () => db().from("reimbursement_requests");
  const monthStart = `${args.today.slice(0, 7)}-01`;

  const [spent, autoToday, dupes] = await Promise.all([
    requests()
      .select("total_cents")
      .eq("category", args.category)
      .in("status", ["auto_approved", "approved", "paid", "payment_failed"])
      .gte("decided_at", monthStart),
    requests()
      .select("total_cents")
      .eq("decided_by", "policy")
      .in("status", ["auto_approved", "paid", "payment_failed"])
      .gte("decided_at", args.today),
    requests()
      .select("id, receipt_image_hash")
      .neq("id", args.requestId)
      .neq("status", "submitted")
      // Both values are made only of [a-z0-9|-], so they're safe in this filter.
      .or(
        args.dedupeKey
          ? `receipt_image_hash.eq.${args.imageHash},dedupe_key.eq.${args.dedupeKey}`
          : `receipt_image_hash.eq.${args.imageHash}`,
      )
      .order("created_at", { ascending: true })
      .limit(5),
  ]);
  for (const r of [spent, autoToday, dupes]) {
    if (r.error) throw new Error(`policy lookup: ${r.error.message}`);
  }

  const dupeRows = (dupes.data ?? []) as { id: string; receipt_image_hash: string }[];
  const samePhoto = dupeRows.find((d) => d.receipt_image_hash === args.imageHash);
  const first = samePhoto ?? dupeRows[0] ?? null;

  return {
    today: args.today,
    categorySpentThisMonthCents: sum(spent.data),
    clubAutoApprovedTodayCents: sum(autoToday.data),
    duplicate: samePhoto ? "same_photo" : dupeRows.length > 0 ? "same_details" : null,
    duplicateOf: first?.id ?? null,
    memberEdited: args.memberEdited,
  };
}

type PayoutRequestRow = PayoutRow & {
  id: string;
  privy_user_id: string;
  total_cents: number;
  category: Category;
  vendor: string | null;
  member: { solana_address: string } | null;
};

export type PayoutResult = "paid" | "processing" | "failed" | "not_payable";

async function recordPaid(row: PayoutRequestRow, signature: string) {
  const { error } = await db()
    .from("reimbursement_requests")
    .update({ status: "paid", paid_at: new Date().toISOString(), payout_error: null })
    .eq("id", row.id);
  if (error) throw new Error(`payout update: ${error.message}`);

  // Public ledger. The vendor came off a receipt: it's shown as plain text only.
  const label = CATEGORY_LABELS[row.category];
  const { error: ledgerError } = await db()
    .from("ledger_entries")
    .upsert(
      {
        direction: "out",
        kind: "reimbursement",
        amount_cents: row.total_cents,
        description: row.vendor ? `${label} reimbursement: ${row.vendor}` : `${label} reimbursement`,
        privy_user_id: row.privy_user_id,
        reimbursement_request_id: row.id,
        signature,
      },
      { onConflict: "reimbursement_request_id", ignoreDuplicates: true },
    );
  if (ledgerError) throw new Error(`ledger insert: ${ledgerError.message}`);
}

async function markFailed(id: string, message: string) {
  await db()
    .from("reimbursement_requests")
    .update({ status: "payment_failed", payout_error: message })
    .eq("id", id);
}

/**
 * Pay out an approved request, exactly once. Safe to call repeatedly and
 * from several requests at once: the row is claimed before anything is
 * signed, and the signature is saved before anything is sent.
 */
export async function payOut(requestId: string): Promise<PayoutResult> {
  const requests = () => db().from("reimbursement_requests");
  const { data, error } = await requests()
    .select(
      "id, privy_user_id, status, total_cents, category, vendor, payout_signature, payout_claimed_at, member:members(solana_address)",
    )
    .eq("id", requestId)
    .single();
  if (error) throw new Error(`payout lookup: ${error.message}`);
  const row = data as unknown as PayoutRequestRow;

  const chain = row.payout_signature ? await getChainStatus(row.payout_signature) : null;
  const decision = decidePayout(row, new Date(), chain);
  if (decision === "done") return "paid";
  if (decision === "not_payable") return "not_payable";
  if (decision === "wait") return "processing";
  if (decision === "mark_paid") {
    await recordPaid(row, row.payout_signature!);
    return "paid";
  }

  // send: claim the row first, only if nobody else changed it meanwhile.
  let claim = requests()
    .update({
      payout_claimed_at: new Date().toISOString(),
      payout_signature: null,
      payout_error: null,
      status: row.status === "payment_failed" ? "approved" : row.status,
    })
    .eq("id", row.id)
    .eq("status", row.status as RequestStatus);
  claim = row.payout_claimed_at
    ? claim.eq("payout_claimed_at", row.payout_claimed_at)
    : claim.is("payout_claimed_at", null);
  claim = row.payout_signature
    ? claim.eq("payout_signature", row.payout_signature)
    : claim.is("payout_signature", null);
  const { data: claimed, error: claimError } = await claim.select("id");
  if (claimError) throw new Error(`payout claim: ${claimError.message}`);
  if (!claimed?.length) return "processing";

  if (!row.member?.solana_address || !row.total_cents) {
    await markFailed(row.id, "This member's account isn't set up for payouts.");
    return "failed";
  }

  let payment;
  try {
    payment = await signDollarTransfer(
      row.member.solana_address,
      row.total_cents,
      `club-treasury:reimbursement:${row.id}`,
    );
  } catch (err) {
    const message = (err as Error).message.includes("enough dollars")
      ? "The club doesn't have enough money for this payout."
      : "The payout couldn't be prepared. Try again.";
    console.error("payout prepare failed:", (err as Error).message);
    await markFailed(row.id, message);
    return "failed";
  }

  // Save the signature BEFORE sending, so a retry can check whether it landed.
  const { error: sigError } = await requests()
    .update({ payout_signature: payment.signature })
    .eq("id", row.id);
  if (sigError) throw new Error(`payout save: ${sigError.message}`);

  try {
    await submit(payment);
  } catch (err) {
    // It may or may not have reached the network; the next check finds out.
    console.error("payout send failed:", (err as Error).message);
    return "processing";
  }

  const result = await waitForConfirmation(payment.signature);
  if (result === "confirmed") {
    await recordPaid(row, payment.signature);
    return "paid";
  }
  if (result === "failed") {
    await markFailed(row.id, "The payout didn't go through. Try again.");
    return "failed";
  }
  return "processing";
}

/** Short-lived links to receipt photos (private bucket). */
export async function photoLinks(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();
  const { data, error } = await db().storage.from(RECEIPT_BUCKET).createSignedUrls(unique, 60 * 60);
  if (error) throw new Error(`photo links: ${error.message}`);
  const links = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) links.set(item.path, item.signedUrl);
  }
  return links;
}
