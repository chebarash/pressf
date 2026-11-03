import { coverageCsv, materialsCsv } from "@/core/coverage";
import { can } from "@/core/roles";
import { getUser } from "@/lib/auth";
import { coverage } from "@/server/admin/coverage";
import { roleOf } from "@/server/identity";

/** CSV of the coverage table (`?table=coverage`) or the materials table (`?table=materials`). Staff only. */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user || !can(await roleOf(user.id), "admin:coverage")) return new Response("Not found", { status: 404 });
  const table = new URL(request.url).searchParams.get("table") === "materials" ? "materials" : "coverage";
  const data = await coverage();
  const body = table === "materials" ? materialsCsv(data) : coverageCsv(data);
  return new Response(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pressf-${table}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
