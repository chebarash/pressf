import { desc, eq } from "drizzle-orm";
import type { AlertSettings } from "@/core/notifications";
import { shortName } from "@/core/people";
import { ago, shortDate } from "@/core/time";
import { REJECT_REASONS, type RejectReason, type UploadStatus } from "@/core/uploads";
import { db } from "@/lib/db";
import { lmsCourses, uploads } from "@/lib/db/schema";
import { roleOf } from "@/server/identity";
import type { Role } from "@/core/roles";
import { rateQueueFor } from "./rate";
import { loadStudent, type SyncState } from "./student";
import { inArray } from "drizzle-orm";

/** Profile (Figma 8.1, 8.5) and My uploads (11.6, 11.7). */

export type ProfileView = {
  name: string;
  /** "Shamsiddin A." */
  shortName: string;
  email: string;
  /** From the LMS gradebook: year of study of the open semester. */
  year: number | null;
  role: Role;
  telegramLinked: boolean;
  alerts: AlertSettings;
  sync: SyncState & { label: string | null };
  ratings: { count: number; waiting: number };
  uploads: { count: number; live: number };
};

export async function profile(userId: string, now = new Date()): Promise<ProfileView | null> {
  const student = await loadStudent(userId);
  if (!student) return null;
  const [queue, role, mine] = await Promise.all([
    rateQueueFor(student, now),
    roleOf(userId),
    db().select({ status: uploads.status }).from(uploads).where(eq(uploads.uploaderId, userId)),
  ]);
  const name = student.cache?.profile?.name ?? student.email;
  return {
    name,
    shortName: shortName(name),
    email: student.email,
    year: student.sync.semesters.find((s) => s.open)?.year ?? null,
    role,
    telegramLinked: !!student.telegramId,
    alerts: student.alerts,
    sync: { ...student.state, label: student.state.syncedAt ? ago(new Date(student.state.syncedAt), now) : null },
    ratings: { count: queue.rated.length, waiting: queue.waiting.length },
    uploads: { count: mine.length, live: mine.filter((u) => u.status === "live").length },
  };
}

export type MyUploadView = {
  id: string;
  title: string;
  course: string;
  status: UploadStatus;
  /** Why it was turned down, in the words the student got from the bot. */
  reason: string | null;
  opens: number;
  date: string;
  dateLabel: string;
  href: string | null;
};

export async function myUploads(userId: string): Promise<{ items: MyUploadView[]; live: number; opens: number }> {
  const rows = await db().select().from(uploads).where(eq(uploads.uploaderId, userId)).orderBy(desc(uploads.createdAt));
  const codes = [...new Set(rows.map((r) => r.courseCode ?? "").filter(Boolean))];
  const names = codes.length ? await db().selectDistinctOn([lmsCourses.code], { code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses).where(inArray(lmsCourses.code, codes)) : [];
  const name = new Map(names.map((n) => [n.code, n.name]));
  const items = rows.map((r) => ({
    id: r.id, title: r.title, course: name.get(r.courseCode ?? "") ?? r.courseCode ?? "", status: r.status,
    reason: r.rejectReason ? (r.rejectReason in REJECT_REASONS ? REJECT_REASONS[r.rejectReason as RejectReason].message(r.rejectNote ?? "").trim() : r.rejectNote) : null,
    opens: r.opens, date: r.createdAt.toISOString(), dateLabel: shortDate(r.createdAt), href: r.status === "live" ? `/f/${r.id}` : null,
  }));
  return { items, live: items.filter((i) => i.status === "live").length, opens: items.reduce((n, i) => n + i.opens, 0) };
}
