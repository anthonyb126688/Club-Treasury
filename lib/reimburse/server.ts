import "server-only";
import { db } from "@/lib/db";
import { currentPeriod } from "@/lib/dues/period";
import { centsToUnits } from "@/lib/money";
import type { Org } from "@/lib/orgs/orgs";
import type { PolicyContext, ReviewReason } from "@/lib/policy/decide";
import type { CategoryRule } from "@/lib/policy/rules";
import { isSpendingLimitExceeded } from "@/lib/solana/allowance";
import { checkApprovedPayment } from "@/lib/solana/dues";
import {
  allowanceLeft,
  allowancePaymentInstructions,
  createPaymentProposal,
  isVaultApprover,
  prepareProposalApproval,
  squadsConfigFor,
} from "@/lib/solana/squads";
import { getChainStatus, signWithTreasury, submit, waitForConfirmation } from "@/lib/solana/treasury";
import { decidePayout, decideProposalPayout, type PayoutRow, type RequestStatus } from "./decide";

// Reimbursement payouts and lookups for ONE club at a time. Every function
// takes the club (or its id) and every query filters by org_id.

export const RECEIPT_BUCKET = "receipts";

/** Today's date (UTC) as YYYY-MM-DD. */
export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const sum = (rows: { total_cents: number | null }[] | null) =>
  (rows ?? []).reduce((total, r) => total + (r.total_cents ?? 0), 0);

/** The facts the policy needs about everything else submitted in this club. */
export async function loadPolicyContext(args: {
  orgId: string;
  requestId: string;
  category: CategoryRule | null;
  imageHash: string;
  dedupeKey: string | null;
  today: string;
  memberEdited: PolicyContext["memberEdited"];
}): Promise<PolicyContext & { duplicateOf: string | null }> {
  const requests = () => db().from("reimbursement_requests");
  const periodStart = currentPeriod(args.category?.period ?? "month", new Date(`${args.today}T12:00:00Z`)).startsOn;

  const [spent, autoToday, dupes] = await Promise.all([
    args.category
      ? requests()
          .select("total_cents")
          .eq("org_id", args.orgId)
          .eq("category", args.category.slug)
          .in("status", ["auto_approved", "approved", "paid", "payment_failed"])
          .gte("decided_at", periodStart)
      : Promise.resolve({ data: [], error: null }),
    requests()
      .select("total_cents")
      .eq("org_id", args.orgId)
      .eq("decided_by", "policy")
      .in("status", ["auto_approved", "paid", "payment_failed"])
      .gte("decided_at", args.today),
    requests()
      .select("id, receipt_image_hash")
      .eq("org_id", args.orgId)
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
    categorySpentThisPeriodCents: sum(spent.data as { total_cents: number | null }[]),
    clubAutoApprovedTodayCents: sum(autoToday.data),
    duplicate: samePhoto ? "same_photo" : dupeRows.length > 0 ? "same_details" : null,
    duplicateOf: first?.id ?? null,
    memberEdited: args.memberEdited,
  };
}

// ---- Payouts ----------------------------------------------------------------

type PayoutRequestRow = PayoutRow & {
  id: string;
  org_id: string;
  privy_user_id: string;
  total_cents: number;
  category: string;
  vendor: string | null;
  receipt_image_hash: string;
  squads_transaction_index: number | string | null;
  approval_tx: string | null;
  member: { solana_address: string } | null;
  org: Org;
};

const PAYOUT_SELECT =
  "id, org_id, privy_user_id, status, total_cents, category, vendor, receipt_image_hash, payout_signature, payout_claimed_at, squads_transaction_index, approval_tx, member:members(solana_address), org:orgs(id, name, squads_multisig_address, squads_vault_address, squads_spending_limit_address, vault_status)";

async function loadPayoutRow(orgId: string, requestId: string): Promise<PayoutRequestRow | null> {
  const { data, error } = await db()
    .from("reimbursement_requests")
    .select(PAYOUT_SELECT)
    .eq("org_id", orgId)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(`payout lookup: ${error.message}`);
  return data as unknown as PayoutRequestRow | null;
}

/** Public memo on every payout: request id + receipt fingerprint (no personal data). */
function payoutMemo(row: Pick<PayoutRequestRow, "id" | "receipt_image_hash">): string {
  return `club-treasury:reimbursement:${row.id}:${row.receipt_image_hash}`;
}

export type PayoutResult = "paid" | "processing" | "failed" | "not_payable" | "queued";

async function categoryLabel(orgId: string, slug: string): Promise<string> {
  const { data } = await db()
    .from("org_categories")
    .select("name")
    .eq("org_id", orgId)
    .eq("slug", slug)
    .maybeSingle<{ name: string }>();
  return data?.name ?? slug;
}

async function recordPaid(row: PayoutRequestRow, signature: string) {
  const { error } = await db()
    .from("reimbursement_requests")
    .update({ status: "paid", paid_at: new Date().toISOString(), payout_error: null, approval_tx: null })
    .eq("org_id", row.org_id)
    .eq("id", row.id);
  if (error) throw new Error(`payout update: ${error.message}`);

  // Public ledger. The vendor came off a receipt: it's shown as plain text only.
  const label = await categoryLabel(row.org_id, row.category);
  const { error: ledgerError } = await db()
    .from("ledger_entries")
    .upsert(
      {
        org_id: row.org_id,
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

async function markFailed(row: PayoutRequestRow, message: string) {
  await db()
    .from("reimbursement_requests")
    .update({ status: "payment_failed", payout_error: message })
    .eq("org_id", row.org_id)
    .eq("id", row.id);
}

const ALLOWANCE_USED_UP: ReviewReason = {
  code: "daily_limit",
  message: "The club's automatic payout allowance is used up for now, so this needs the treasurer.",
};

/**
 * The club's daily allowance can't cover this one: hand it to the
 * treasurer instead (and open a proposal for them to approve).
 */
async function sendToTreasurer(row: PayoutRequestRow): Promise<PayoutResult> {
  const { data, error } = await db()
    .from("reimbursement_requests")
    .update({
      status: "queued",
      review_group: ALLOWANCE_USED_UP.code,
      review_reasons: [ALLOWANCE_USED_UP],
      decision_reason: ALLOWANCE_USED_UP.message,
      decided_by: null,
      decided_at: null,
      payout_signature: null,
      payout_claimed_at: null,
    })
    .eq("org_id", row.org_id)
    .eq("id", row.id)
    .in("status", ["auto_approved", "payment_failed"])
    .select("id");
  if (error) throw new Error(`send to treasurer: ${error.message}`);
  if (data?.length) {
    await ensureProposal(row.org_id, row.id).catch((e) => console.error("proposal:", (e as Error).message));
  }
  return "queued";
}

/**
 * Pay out an approved request, exactly once. Safe to call repeatedly and
 * from several requests at once: the row is claimed before anything is
 * signed, and the signature is saved before anything is sent.
 *
 * Instant (policy-approved) payouts use the club's daily allowance from its
 * vault. Treasurer-approved payouts are sent by the treasurer's own account
 * (finishTreasurerApproval); here we only check on them.
 */
export async function payOut(orgId: string, requestId: string): Promise<PayoutResult> {
  const requests = () => db().from("reimbursement_requests");
  const row = await loadPayoutRow(orgId, requestId);
  if (!row) return "not_payable";
  const config = squadsConfigFor(row.org);

  // Treasurer-approved, paid through a Squads proposal.
  if (row.squads_transaction_index !== null) {
    if (row.status === "payment_failed") {
      await requests()
        .update({ status: "queued", payout_error: null, decided_by: null, decided_at: null, payout_signature: null, payout_claimed_at: null })
        .eq("org_id", orgId)
        .eq("id", row.id)
        .eq("status", "payment_failed");
      return "queued";
    }
    return settleProposalPayout(row);
  }

  const chain = row.payout_signature ? await getChainStatus(row.payout_signature) : null;
  const decision = decidePayout(row, new Date(), chain);
  if (decision === "done") return "paid";
  if (decision === "not_payable") return "not_payable";
  if (decision === "wait") return "processing";
  if (decision === "mark_paid") {
    await recordPaid(row, row.payout_signature!);
    return "paid";
  }

  if (!config) {
    await markFailed(row, "This club's account is still being set up.");
    return "failed";
  }
  if (row.total_cents && (await allowanceLeft(config)) < centsToUnits(row.total_cents)) {
    return sendToTreasurer(row);
  }

  // send: claim the row first, only if nobody else changed it meanwhile.
  let claim = requests()
    .update({
      payout_claimed_at: new Date().toISOString(),
      payout_signature: null,
      payout_error: null,
      status: row.status === "payment_failed" ? "approved" : row.status,
    })
    .eq("org_id", orgId)
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
    await markFailed(row, "This member's account isn't set up for payouts.");
    return "failed";
  }

  let payment;
  try {
    payment = await signWithTreasury(
      await allowancePaymentInstructions(config, row.member.solana_address, row.total_cents, payoutMemo(row)),
    );
  } catch (err) {
    console.error("payout prepare failed:", (err as Error).message);
    await markFailed(row, "The payout couldn't be prepared. Try again.");
    return "failed";
  }

  // Save the signature BEFORE sending, so a retry can check whether it landed.
  const { error: sigError } = await requests()
    .update({ payout_signature: payment.signature })
    .eq("org_id", orgId)
    .eq("id", row.id);
  if (sigError) throw new Error(`payout save: ${sigError.message}`);

  try {
    await submit(payment);
  } catch (err) {
    if (isSpendingLimitExceeded(err)) {
      // Squads refused: over the daily allowance. Nothing was sent.
      return sendToTreasurer({ ...row, status: "payment_failed" });
    }
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
    await markFailed(row, "The payout didn't go through. Try again.");
    return "failed";
  }
  return "processing";
}

// ---- Treasurer approvals through Squads ---------------------------------------

/** Put a request back in the treasurer's queue (its approval never landed). */
async function reopen(row: PayoutRequestRow) {
  await db()
    .from("reimbursement_requests")
    .update({
      status: "queued",
      decided_by: null,
      decided_at: null,
      payout_signature: null,
      payout_claimed_at: null,
      approval_tx: null,
    })
    .eq("org_id", row.org_id)
    .eq("id", row.id)
    .eq("status", "approved");
}

async function settleProposalPayout(row: PayoutRequestRow): Promise<PayoutResult> {
  const chain = row.payout_signature ? await getChainStatus(row.payout_signature) : null;
  const decision = decideProposalPayout(row, new Date(), chain);
  if (decision === "done") return "paid";
  if (decision === "not_payable") return "not_payable";
  if (decision === "wait") return "processing";
  if (decision === "mark_paid") {
    await recordPaid(row, row.payout_signature!);
    return "paid";
  }
  await reopen(row);
  return "queued";
}

/** Make sure a queued request has a Squads proposal. Returns its index (or null if it can't have one). */
export async function ensureProposal(orgId: string, requestId: string): Promise<bigint | null> {
  const row = await loadPayoutRow(orgId, requestId);
  if (!row) return null;
  const config = squadsConfigFor(row.org);
  if (!config) return null;
  if (row.squads_transaction_index !== null) return BigInt(row.squads_transaction_index);
  if (row.status !== "queued" || !row.member?.solana_address || !row.total_cents) return null;

  const index = await createPaymentProposal(config, row.member.solana_address, row.total_cents, payoutMemo(row));
  await db()
    .from("reimbursement_requests")
    .update({ squads_transaction_index: index.toString() })
    .eq("org_id", orgId)
    .eq("id", row.id)
    .is("squads_transaction_index", null);
  return index;
}

export type Approver = { userId: string; solanaAddress: string };

export type ApprovalStart =
  | { status: "ready"; transaction: string }
  | { status: "processing" | "paid" | "not_found" | "not_approver" | "unavailable" };

/**
 * Step 1 of the treasurer's Approve tap: build "approve + pay" for their
 * account to approve (silently, in the browser).
 */
export async function startTreasurerApproval(
  org: Org,
  requestId: string,
  treasurer: Approver,
): Promise<ApprovalStart> {
  const config = squadsConfigFor(org);
  if (!config) return { status: "unavailable" };
  if (!(await isVaultApprover(config, treasurer.solanaAddress))) return { status: "not_approver" };

  let row = await loadPayoutRow(org.id, requestId);
  if (!row) return { status: "not_found" };
  if (row.status === "approved") {
    const settled = await payOut(org.id, row.id);
    if (settled === "paid") return { status: "paid" };
    if (settled === "processing") return { status: "processing" };
    row = await loadPayoutRow(org.id, requestId);
    if (!row) return { status: "not_found" };
  }
  if (row.status === "paid") return { status: "paid" };
  if (row.status !== "queued") return { status: "not_found" };

  let index = await ensureProposal(org.id, row.id);
  if (index === null) return { status: "unavailable" };
  let prep = await prepareProposalApproval(config, index, treasurer.solanaAddress);
  if (prep.status === "unavailable") {
    // The old proposal is gone, closed, or stale: open a fresh one.
    await db()
      .from("reimbursement_requests")
      .update({ squads_transaction_index: null })
      .eq("org_id", org.id)
      .eq("id", row.id);
    index = await ensureProposal(org.id, row.id);
    if (index === null) return { status: "unavailable" };
    prep = await prepareProposalApproval(config, index, treasurer.solanaAddress);
  }
  if (prep.status !== "ready") return { status: "unavailable" };

  const { error } = await db()
    .from("reimbursement_requests")
    .update({
      approval_tx: prep.payment.wire,
      payout_signature: prep.payment.signature,
      payout_claimed_at: new Date().toISOString(),
    })
    .eq("org_id", org.id)
    .eq("id", row.id)
    .eq("status", "queued");
  if (error) throw new Error(`approval save: ${error.message}`);
  return { status: "ready", transaction: prep.payment.wire };
}

/**
 * Step 2: the treasurer's account approved it. Check it's exactly what we
 * prepared, send it, and record the payout.
 */
export async function finishTreasurerApproval(
  org: Org,
  requestId: string,
  treasurer: Approver,
  signedWire: string,
): Promise<"paid" | "processing" | "failed" | "conflict"> {
  const row = await loadPayoutRow(org.id, requestId);
  if (!row || row.status !== "queued" || !row.payout_signature || !row.approval_tx) return "conflict";

  let wire: string;
  try {
    wire = checkApprovedPayment(signedWire, row.payout_signature, treasurer.solanaAddress);
  } catch {
    return "conflict";
  }

  const { data: claimed, error } = await db()
    .from("reimbursement_requests")
    .update({ status: "approved", decided_by: treasurer.userId, decided_at: new Date().toISOString() })
    .eq("org_id", org.id)
    .eq("id", row.id)
    .eq("status", "queued")
    .eq("payout_signature", row.payout_signature)
    .select("id");
  if (error) throw new Error(`approve: ${error.message}`);
  if (!claimed?.length) return "conflict";
  const approved = { ...row, status: "approved" as const };

  try {
    await submit({ wire });
  } catch (err) {
    console.error("approval send failed:", (err as Error).message);
    await reopen(approved);
    return "failed";
  }

  const result = await waitForConfirmation(row.payout_signature);
  if (result === "confirmed") {
    await recordPaid(approved, row.payout_signature);
    return "paid";
  }
  if (result === "failed") {
    await reopen(approved);
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
