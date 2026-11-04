import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userState } from "@/lib/db/schema";
import { dismissedHints, dismissHint } from "@/server/hints";
import { profile } from "@/server/views/profile";
import { resetDb } from "../fixtures/db";
import { seedStudent } from "../fixtures/student";

describe("hints are stored per student, so one shows once across devices", () => {
  let userId: string;
  beforeEach(async () => {
    await resetDb();
    userId = await seedStudent();
  });

  it("a dismissal persists and adds to the others, keeping the sync snapshot", async () => {
    expect(await dismissedHints(userId)).toEqual([]);
    expect(await dismissHint(userId, "timetable-google")).toBe(true);
    expect(await dismissHint(userId, "search-shortcut")).toBe(true);
    expect(await dismissHint(userId, "timetable-google")).toBe(true);
    expect((await dismissedHints(userId)).sort()).toEqual(["search-shortcut", "timetable-google"]);
    const [row] = await db().select().from(userState).where(eq(userState.userId, userId));
    expect(Object.keys(row.snapshot).length).toBeGreaterThan(0);
  });

  it("ignores unknown ids", async () => {
    expect(await dismissHint(userId, "made-up")).toBe(false);
    expect(await dismissedHints(userId)).toEqual([]);
  });

  it("works for a student with no state row yet", async () => {
    await db().delete(userState).where(eq(userState.userId, userId));
    await dismissHint(userId, "progress-numbers");
    expect(await dismissedHints(userId)).toEqual(["progress-numbers"]);
  });
});

describe("Settings → Calendar data", () => {
  beforeEach(resetDb);
  it("brings the student's own Google Calendar link with the layer switches", async () => {
    const userId = await seedStudent();
    const p = (await profile(userId))!;
    expect(p.calendar?.google).toMatch(/^https:\/\/calendar\.google\.com\/.+calendar%2Ffeed%2F[A-Za-z0-9_-]{32}\.ics|feed\/[A-Za-z0-9_-]{32}\.ics/);
    expect(p.feed.map((l) => l.id)).toEqual(expect.arrayContaining(["classes", "exams", "deadlines", "holidays", "registration"]));
  });
});
