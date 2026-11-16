// Read a receipt photo with the AI and print what it found, plus what the
// policy would decide on a quiet day. A manual test of lib/extract/.
// Nothing is saved or paid.
//   npm run read-receipt -- <path-to-image>
process.loadEnvFile(".env.local");

const { readFileSync } = await import("node:fs");
const { readReceipt } = await import("@/lib/extract/read");
const { buildClaim } = await import("@/lib/extract/claim");
const { decideReimbursement } = await import("@/lib/policy/decide");
const { DEFAULT_RULES } = await import("@/lib/policy/rules");

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run read-receipt -- <path-to-image>");
  process.exit(1);
}

const lower = path.toLowerCase();
const mediaType = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
const today = new Date().toISOString().slice(0, 10);

const started = Date.now();
const reading = await readReceipt({ base64: readFileSync(path).toString("base64"), mediaType }, today);
console.log(`Read in ${((Date.now() - started) / 1000).toFixed(1)}s:`);
console.log(JSON.stringify(reading, null, 2));

if (reading.totalCents !== null) {
  const { claim, memberEdited } = buildClaim(reading, {
    totalCents: reading.totalCents,
    category: reading.category,
  });
  const result = decideReimbursement(claim, DEFAULT_RULES, {
    today,
    categorySpentThisMonthCents: 0,
    clubAutoApprovedTodayCents: 0,
    duplicate: null,
    memberEdited,
  });
  console.log("Policy:", JSON.stringify(result, null, 2));
}
