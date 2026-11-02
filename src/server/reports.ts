import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { audit } from "./audit";
import { pseudonym } from "./identity";

export type ReportTarget = { kind: "post" | "file"; id: string };

/** One report per student per item; repeating is a no-op. */
export async function report(userId: string, target: ReportTarget, reason: string) {
  await db()
    .insert(reports)
    .values({ targetKind: target.kind, targetId: target.id, reason, reporter: pseudonym(userId, "reporter") })
    .onConflictDoNothing({ target: [reports.targetKind, reports.targetId, reports.reporter] });
}

/** Open reports grouped by item, with reason counts, oldest first. */
export async function openReports() {
  const rows = await db()
    .select({ kind: reports.targetKind, id: reports.targetId, reason: reports.reason, n: count() })
    .from(reports)
    .where(eq(reports.status, "open"))
    .groupBy(reports.targetKind, reports.targetId, reports.reason)
    .orderBy(asc(reports.targetKind));
  const by = new Map<string, { kind: string; id: string; total: number; reasons: Record<string, number> }>();
  for (const r of rows) {
    const key = `${r.kind}:${r.id}`;
    const item = by.get(key) ?? { kind: r.kind, id: r.id, total: 0, reasons: {} };
    item.total += r.n;
    item.reasons[r.reason] = r.n;
    by.set(key, item);
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}

export async function resolve(target: ReportTarget, outcome: "hidden" | "kept", actorId: string) {
  await db()
    .update(reports)
    .set({ status: outcome, resolvedBy: actorId, resolvedAt: new Date() })
    .where(and(eq(reports.targetKind, target.kind), eq(reports.targetId, target.id), eq(reports.status, "open")));
  await audit(actorId, `report.${outcome}`, `${target.kind}:${target.id}`);
}
