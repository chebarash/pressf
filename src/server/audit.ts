import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

/** Records an admin or moderator action. Never pass ids that link a person to a rating. */
export async function audit(actorId: string | null, action: string, target?: string, detail: Record<string, unknown> = {}) {
  await db().insert(auditLog).values({ actorId, action, target: target ?? null, detail });
}

export const recentAudit = (limit = 100, actorId?: string) =>
  db().select().from(auditLog).where(actorId ? eq(auditLog.actorId, actorId) : undefined).orderBy(desc(auditLog.at)).limit(limit);
