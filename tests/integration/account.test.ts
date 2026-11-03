import { beforeEach, describe, expect, it } from "vitest";
import type { RatingInput } from "@/core/ratings";
import { db } from "@/lib/db";
import { courseRatings, feedItems, lmsAccounts, lmsCache, teacherRatings, userState, users } from "@/lib/db/schema";
import { deleteAccount } from "@/server/account";
import { ingest, setAlerts } from "@/server/feed";
import { myRatings, saveRating } from "@/server/ratings";
import { resetDb } from "../fixtures/db";

const newUser = async (email: string) => (await db().insert(users).values({ email }).returning())[0].id;

const rating = (over: Partial<RatingInput> = {}): RatingInput => ({
  recommend: "yes", hours: "2-5", difficulty: 2, tags: [],
  teachers: [{ teacherId: "t1", role: "lecture", pressF: true, tags: [] }], ...over,
});

let student: string;
let other: string;

beforeEach(async () => {
  await resetDb();
  student = await newUser("gone@newuu.uz");
  other = await newUser("stays@newuu.uz");
});

describe("delete my data", () => {
  it("removes the user, LMS login, cache, feed, state and their pseudonymous ratings only", async () => {
    await db().insert(lmsAccounts).values({ userId: student, sealedPassword: "v1.sealed" });
    await db().insert(lmsCache).values({ userId: student, data: { enrollment: null, timetable: [], profile: null } });
    await ingest(student, [{ id: "lms:1", kind: "announcement", title: "Hi", at: new Date(), read: false }]);
    await setAlerts(student, { digest: false });
    await saveRating(student, { id: "77", code: "MATH111" }, "Fall 2025", rating());
    await saveRating(student, { id: "78", code: "PHYS101" }, "Fall 2025", rating({ recommend: "no" }));
    await saveRating(other, { id: "77", code: "MATH111" }, "Fall 2025", rating({ recommend: "unsure" }));

    const result = await deleteAccount(student);

    expect(result).toEqual({ deleted: true, ratings: 2, courses: ["MATH111", "PHYS101"] });
    expect(await db().select().from(users)).toHaveLength(1);
    expect(await db().select().from(lmsAccounts)).toHaveLength(0);
    expect(await db().select().from(lmsCache)).toHaveLength(0);
    expect(await db().select().from(feedItems)).toHaveLength(0);
    expect(await db().select().from(userState)).toHaveLength(0);
    const left = await db().select().from(courseRatings);
    expect(left.map((r) => r.recommend)).toEqual(["unsure"]);
    expect(await db().select().from(teacherRatings)).toHaveLength(1);
    expect(await myRatings(other)).toHaveLength(1);
  });

  it("is a no-op for an unknown user", async () => {
    expect(await deleteAccount("00000000-0000-0000-0000-000000000000")).toEqual({ deleted: false, ratings: 0, courses: [] });
  });
});
