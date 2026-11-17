import { connection } from "next/server";
import { slugify } from "@/lib/insights/csv";
import { loadExport } from "@/lib/insights/load";
import { parseRange } from "@/lib/insights/ranges";
import { EXPORT_TYPES, type ExportType } from "@/lib/insights/types";
import { requireTreasurer } from "@/lib/orgs/access";

// GET /api/orgs/:orgId/treasurer/export?range=month|semester|year&type=activity|requests|members
// A CSV download for THIS club. Treasurer only (treasurers may see member
// emails, like on the ledger). Cells that look like spreadsheet formulas are
// made safe in lib/insights/csv.ts.
export async function GET(request: Request, ctx: RouteContext<"/api/orgs/[orgId]/treasurer/export">) {
  await connection();
  const { orgId } = await ctx.params;
  const access = await requireTreasurer(request, orgId);
  if (access instanceof Response) return access;
  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get("range"));
  const type = params.get("type") ?? "";
  if (!(EXPORT_TYPES as readonly string[]).includes(type)) {
    return Response.json({ error: "bad_type" }, { status: 400 });
  }
  try {
    const csv = await loadExport(access.org, range, type as ExportType);
    const filename = `${slugify(access.org.name)}-${type}-${range}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("export failed:", (err as Error).message);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
