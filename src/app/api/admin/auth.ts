import { can } from "@/core/roles";
import { getUser } from "@/lib/auth";
import { cronAuthorized } from "@/app/api/cron/auth";
import { roleOf } from "@/server/identity";

/**
 * Who may call the operator endpoints: a script with `Authorization: Bearer
 * <CRON_SECRET>`, or a signed-in admin. Null for everyone else; a wrong bearer
 * token is refused even when the browser also carries an admin session.
 */
export async function adminActor(request: Request): Promise<{ id: string | null } | null> {
  if (cronAuthorized(request)) return { id: null };
  if (request.headers.get("authorization")) return null;
  const user = await getUser().catch(() => null);
  if (user && can(await roleOf(user.id), "admin:catalog")) return { id: user.id };
  return null;
}
