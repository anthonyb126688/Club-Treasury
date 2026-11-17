import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ReceiptReadError, readReceipt, type ReceiptImage } from "@/lib/extract/read";
import { requireMember } from "@/lib/orgs/access";
import { loadOrgCategories } from "@/lib/orgs/settings";
import { RECEIPT_BUCKET, todayUtc } from "@/lib/reimburse/server";

// POST /api/orgs/:orgId/reimburse/read: upload a receipt photo; the AI reads it
// (sorting it into one of THIS club's categories).
// Saves a draft request (status 'submitted') and returns what was read, for
// the member to confirm or edit. Nothing is decided or paid here.

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_READS_PER_DAY = 30; // keeps AI costs bounded if someone spams uploads

function sniffImageType(bytes: Buffer): ReceiptImage["mediaType"] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") {
    return "image/webp";
  }
  return null;
}

const EXTENSION = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export async function POST(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/reimburse/read">) {
  const { orgId } = await ctx.params;
  const access = await requireMember(request, orgId);
  if (access instanceof Response) return access;
  const member = access.person;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await db()
      .from("reimbursement_requests")
      .select("id", { count: "exact", head: true })
      .eq("privy_user_id", member.userId)
      .gte("created_at", since);
    if (countError) throw new Error(`count: ${countError.message}`);
    if ((count ?? 0) >= MAX_READS_PER_DAY) {
      return Response.json({ error: "too_many" }, { status: 429 });
    }

    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.size === 0) {
      return Response.json({ error: "no_photo" }, { status: 400 });
    }
    if (photo.size > MAX_BYTES) return Response.json({ error: "too_big" }, { status: 413 });

    const bytes = Buffer.from(await photo.arrayBuffer());
    const mediaType = sniffImageType(bytes);
    if (!mediaType) return Response.json({ error: "not_an_image" }, { status: 415 });

    const imageHash = createHash("sha256").update(bytes).digest("hex");
    const id = randomUUID();
    const path = `${id}.${EXTENSION[mediaType]}`;

    const { error: uploadError } = await db()
      .storage.from(RECEIPT_BUCKET)
      .upload(path, bytes, { contentType: mediaType });
    if (uploadError) throw new Error(`upload: ${uploadError.message}`);

    const categories = await loadOrgCategories(orgId);
    let reading;
    try {
      reading = await readReceipt({ base64: bytes.toString("base64"), mediaType }, todayUtc(), categories);
    } catch (err) {
      console.error("receipt read failed:", (err as Error).message);
      const status = err instanceof ReceiptReadError ? 422 : 502;
      return Response.json({ error: "unreadable" }, { status });
    }

    const { error: insertError } = await db().from("reimbursement_requests").insert({
      id,
      org_id: orgId,
      privy_user_id: member.userId,
      receipt_path: path,
      receipt_image_hash: imageHash,
      ai_is_receipt: reading.isReceipt,
      vendor: reading.vendor,
      receipt_date: reading.date,
      ai_total_cents: reading.totalCents,
      ai_category: reading.category,
      line_items: reading.lineItems,
      ai_summary: reading.summary,
      status: "submitted",
    });
    if (insertError) throw new Error(`insert: ${insertError.message}`);

    return Response.json({
      id,
      isReceipt: reading.isReceipt,
      vendor: reading.vendor,
      date: reading.date,
      totalCents: reading.totalCents,
      category: reading.category,
      summary: reading.summary,
      // The club's categories, for the member's category picker.
      categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
    });
  } catch (err) {
    console.error("reimburse read failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
