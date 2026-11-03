import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { courseRatings, users } from "@/lib/db/schema";
import { pseudonym } from "./identity";

/**
 * "Delete my data": removes the student and everything keyed to them. The
 * users row cascades to the LMS account (sealed password and token), the LMS
 * cache, the feed, alert settings and snapshots, roles, rating asks, link
 * codes and the calendar feed link. Ratings hold no user id, only a pseudonym, so they are found by
 * recomputing it; teacher answers go with their rating (cascade). Reports stay
 * (moderation needs them; their pseudonym no longer leads to anyone). Uploads
 * stay published but lose their uploader (set null).
 *
 * Returns the courses whose rating summaries changed, so callers can refresh them.
 */
export async function deleteAccount(userId: string) {
  const rater = pseudonym(userId, "rater");
  return db().transaction(async (tx) => {
    const removed = await tx.delete(courseRatings).where(eq(courseRatings.rater, rater)).returning({ courseId: courseRatings.courseId, courseCode: courseRatings.courseCode });
    const [gone] = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    return { deleted: !!gone, ratings: removed.length, courses: [...new Set(removed.map((r) => r.courseCode ?? r.courseId))].sort() };
  });
}
