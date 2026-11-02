import { can } from "@/core/roles";
import { getUser } from "@/lib/auth";
import { roleOf } from "@/server/identity";
import { auditPage } from "@/server/admin/views";

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV of the audit log (same filters as the page). Staff with audit access only. */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user || !can(await roleOf(user.id), "admin:audit")) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const actor = url.searchParams.get("actor");
  const action = url.searchParams.get("action");
  const data = await auditPage({ actor: actor && /^[0-9a-f-]{36}$/.test(actor) ? actor : undefined, action: action?.slice(0, 40) || undefined }, new Date(), 10_000);
  const lines = [["at", "who", "action", "what"], ...data.rows.map((r) => [r.at, r.who, r.action, r.what])].map((r) => r.map(cell).join(","));
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pressf-audit-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
