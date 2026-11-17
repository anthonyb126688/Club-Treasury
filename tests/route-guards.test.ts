import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Club isolation, enforced by structure: EVERY API route under
// app/api/orgs/[orgId]/ must call the club gatekeeper in EVERY handler,
// and treasurer-only areas must use requireTreasurer (not requireMember).
// A new route that forgets the check fails this test.

const ORG_API = join(__dirname, "..", "app", "api", "orgs", "[orgId]");

/** Folders (anywhere in the path) that are treasurer-only. */
const TREASURER_AREAS = ["treasurer", "settings", "categories", "members", "join-code", "vault"];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

const files = routeFiles(ORG_API);

describe("club route guards", () => {
  it("finds club routes to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [relative(ORG_API, f)]))("%s checks membership in every handler", (rel) => {
    const source = readFileSync(join(ORG_API, rel), "utf8");
    const handlers = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)];
    const guards = [...source.matchAll(/await\s+require(Member|Treasurer)\(\s*request\s*,\s*orgId\s*\)/g)];
    expect(handlers.length).toBeGreaterThan(0);
    expect(guards.length).toBeGreaterThanOrEqual(handlers.length);
  });

  const treasurerFiles = files.filter((f) =>
    relative(ORG_API, f).split(sep).some((part) => TREASURER_AREAS.includes(part)),
  );

  it.each(treasurerFiles.map((f) => [relative(ORG_API, f)]))("%s is treasurer-only", (rel) => {
    const source = readFileSync(join(ORG_API, rel), "utf8");
    expect(source).not.toMatch(/requireMember\(/);
    expect(source).toMatch(/requireTreasurer\(/);
  });

  it("every club route filters its queries by org_id", () => {
    for (const f of files) {
      const source = readFileSync(f, "utf8");
      if (!/\.from\("(reimbursement_requests|dues_payments|ledger_entries|org_\w+)"\)/.test(source)) continue;
      expect(source, relative(ORG_API, f)).toMatch(/\.eq\("org_id", orgId\)|org_id: orgId/);
    }
  });
});
