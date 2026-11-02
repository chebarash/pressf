import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ session: null as null | { token: string } }));
const lms = vi.hoisted(() => ({ scheduleList: vi.fn() }));
vi.mock("@/lib/lms/store", () => ({ sessionFor: async () => store.session }));
vi.mock("@/lib/lms/client", async (original) => ({
  ...(await original<typeof import("@/lib/lms/client")>()),
  scheduleList: lms.scheduleList,
}));

import { db } from "@/lib/db";
import { lmsCourses, lmsTeachers } from "@/lib/db/schema";
import { studentTimetable } from "@/lib/lms/schedule";
import { resetDb } from "../fixtures/db";

// 2026-11-02 is a Monday; 05:00 UTC is 10:00 in Tashkent (UTC+5).
const mon10 = Math.floor(Date.UTC(2026, 10, 2, 5, 0) / 1000);
const mon1120 = Math.floor(Date.UTC(2026, 10, 2, 6, 20) / 1000);
const tue14 = Math.floor(Date.UTC(2026, 10, 3, 9, 0) / 1000);

beforeEach(async () => {
  await resetDb();
  store.session = { token: "t" };
  lms.scheduleList.mockReset();
  await db().insert(lmsCourses).values([
    { id: "272", code: "CS210", name: "Intro to CS", raw: {} },
    { id: "906", code: "CS412", name: "Deep Learning", raw: {} },
  ]);
  await db().insert(lmsTeachers).values({ id: "141", firstName: "Sejuti", surName: "Rahman" });
});
afterEach(() => vi.clearAllMocks());

describe("studentTimetable", () => {
  it("returns null without a session", async () => {
    store.session = null;
    expect(await studentTimetable("u1")).toBeNull();
  });

  it("builds weekday lessons from LMS events in Tashkent time, resolving course and teacher", async () => {
    lms.scheduleList.mockResolvedValue([
      { day: "02.11.26", events: [
        { begin_time: String(mon10), end_time: String(mon1120), subject_id: "272", employee_id: "141", auditorium: "306" },
        { begin_time: String(tue14), subject_id: "906", auditorium: { name: "M.A.T.H. 101" } },
      ] },
    ]);
    const lessons = await studentTimetable("u1");
    expect(lessons).toHaveLength(2);
    expect(lessons![0]).toMatchObject({ day: 0, starts: "10:00", ends: "11:20", code: "CS210", subject: "Intro to CS", teacher_name: "Sejuti Rahman", room: "306" });
    expect(lessons![1]).toMatchObject({ day: 1, starts: "14:00", code: "CS412", room: "M.A.T.H. 101" });
  });

  it("merges consecutive hour-long pieces of one class into a single block", async () => {
    const mon1120end = Math.floor(Date.UTC(2026, 10, 2, 6, 20) / 1000); // 11:20 Tashkent
    const mon1120start = mon1120end; // next piece starts right as the first ends
    const mon1240end = Math.floor(Date.UTC(2026, 10, 2, 7, 40) / 1000); // 12:40 Tashkent
    lms.scheduleList.mockResolvedValue([
      { events: [
        { begin_time: String(mon10), end_time: String(mon1120end), subject_id: "272", employee_id: "141", auditorium: "306" },
        { begin_time: String(mon1120start), end_time: String(mon1240end), subject_id: "272", employee_id: "141", auditorium: "306" },
      ] },
    ]);
    const lessons = await studentTimetable("u1");
    expect(lessons).toHaveLength(1);
    expect(lessons![0]).toMatchObject({ starts: "10:00", ends: "12:40", code: "CS210" });
  });

  it("keeps two separate sessions of the same course on one day apart", async () => {
    const mon1120end = Math.floor(Date.UTC(2026, 10, 2, 6, 20) / 1000);
    const afternoon = Math.floor(Date.UTC(2026, 10, 2, 10, 0) / 1000); // 15:00, a clear gap
    const afternoonEnd = Math.floor(Date.UTC(2026, 10, 2, 11, 20) / 1000);
    lms.scheduleList.mockResolvedValue([
      { events: [
        { begin_time: String(mon10), end_time: String(mon1120end), subject_id: "272", employee_id: "141" },
        { begin_time: String(afternoon), end_time: String(afternoonEnd), subject_id: "272", employee_id: "141" },
      ] },
    ]);
    const lessons = await studentTimetable("u1");
    expect(lessons).toHaveLength(2);
  });

  it("collapses repeated weekly occurrences into one slot", async () => {
    const nextMon10 = mon10 + 7 * 86400;
    lms.scheduleList.mockResolvedValue([
      { events: [
        { begin_time: String(mon10), subject_id: "272", employee_id: "141", auditorium: "306" },
        { begin_time: String(nextMon10), subject_id: "272", employee_id: "141", auditorium: "306" },
      ] },
    ]);
    const lessons = await studentTimetable("u1");
    expect(lessons).toHaveLength(1);
  });

  it("drops events whose course is not in the catalog", async () => {
    lms.scheduleList.mockResolvedValue([{ events: [{ begin_time: String(mon10), subject_id: "999" }] }]);
    expect(await studentTimetable("u1")).toEqual([]);
  });
});
