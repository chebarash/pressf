import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const builders = vi.hoisted(() => ({ semester: vi.fn(), timetable: vi.fn(), profile: vi.fn() }));
vi.mock("@/lib/lms/enrollment", () => ({ studentSemester: builders.semester }));
vi.mock("@/lib/lms/schedule", () => ({ studentTimetable: builders.timetable }));
vi.mock("@/lib/lms/profile", () => ({ lmsProfile: builders.profile }));

import { db } from "@/lib/db";
import { lmsCache, users } from "@/lib/db/schema";
import { CACHE_TTL_MS, preloadUser, readUserCache, userData } from "@/lib/lms/cache";
import { eq } from "drizzle-orm";
import { resetDb } from "../fixtures/db";

let userId: string;

beforeEach(async () => {
  await resetDb();
  const [u] = await db().insert(users).values({ email: "s@newuu.uz" }).returning();
  userId = u.id;
  builders.semester.mockReset().mockResolvedValue({ semesterName: "Fall 2026", codes: ["CS412"], courses: [{ code: "CS412", subject: "Deep Learning" }] });
  builders.timetable.mockReset().mockResolvedValue([{ class: "", day: 0, starts: "10:00", ends: "11:20", subject: "Deep Learning", code: "CS412", teacher: "9", teacher_name: "Ann", room: "306" }]);
  builders.profile.mockReset().mockResolvedValue({ name: "Sam", email: "s@newuu.uz", gpa: 3.4, ectsEarned: 120, ectsTotal: 180, honors: false, semesters: [] });
});
afterEach(() => vi.clearAllMocks());

describe("lms/cache", () => {
  it("preloads all LMS data into one row", async () => {
    const data = await preloadUser(userId, "s@newuu.uz");
    expect(data.enrollment?.codes).toEqual(["CS412"]);
    expect(data.timetable).toHaveLength(1);
    expect(data.profile?.gpa).toBe(3.4);
    const [row] = await db().select().from(lmsCache).where(eq(lmsCache.userId, userId));
    expect(row).toBeTruthy();
  });

  it("serves the cache without calling the LMS again", async () => {
    await preloadUser(userId, "s@newuu.uz");
    builders.semester.mockClear(); builders.timetable.mockClear(); builders.profile.mockClear();
    const { data, stale } = await userData(userId, "s@newuu.uz");
    expect(data.enrollment?.codes).toEqual(["CS412"]);
    expect(stale).toBe(false);
    expect(builders.semester).not.toHaveBeenCalled();
    expect(builders.timetable).not.toHaveBeenCalled();
  });

  it("fills the cache on first use when empty", async () => {
    const { data } = await userData(userId, "s@newuu.uz");
    expect(data.enrollment?.codes).toEqual(["CS412"]);
    expect(await readUserCache(userId)).not.toBeNull();
  });

  it("marks the cache stale past the TTL", async () => {
    await preloadUser(userId, "s@newuu.uz");
    await db().update(lmsCache).set({ syncedAt: new Date(Date.now() - CACHE_TTL_MS - 1000) }).where(eq(lmsCache.userId, userId));
    const { stale } = await userData(userId, "s@newuu.uz");
    expect(stale).toBe(true);
  });
});
