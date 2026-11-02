import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ session: null as null | { token: string } }));
const lms = vi.hoisted(() => ({ myList: vi.fn() }));
vi.mock("@/lib/lms/store", () => ({ sessionFor: async () => store.session }));
vi.mock("@/lib/lms/client", async (original) => ({
  ...(await original<typeof import("@/lib/lms/client")>()),
  myList: lms.myList,
}));

import { db } from "@/lib/db";
import { lmsCourses } from "@/lib/db/schema";
import { studentSemester } from "@/lib/lms/enrollment";
import { resetDb } from "../fixtures/db";

beforeEach(async () => {
  await resetDb();
  store.session = { token: "t" };
  lms.myList.mockReset();
  await db().insert(lmsCourses).values([
    { id: "524", code: "CS330", name: "Operating Systems", raw: {} },
    { id: "525", code: "CS340", name: "Databases", raw: {} },
  ]);
});
afterEach(() => vi.clearAllMocks());

describe("studentSemester", () => {
  it("returns null without a session", async () => {
    store.session = null;
    expect(await studentSemester("u1")).toBeNull();
  });

  it("returns the open semester's courses, resolved from the catalog", async () => {
    lms.myList.mockResolvedValue({ semesters: [
      { id: "10", name: "Fall 2023", is_open: "0", subjects: [{ id: "x", subject_id: "999", subject: { id: "999", name: "Old" } }] },
      { id: "178", name: "Fall 2025", is_open: "1", subjects: [
        { id: "a", subject_id: "524", subject: { id: "524", name: "Operating Systems" } },
        { id: "b", subject_id: "525", subject: { id: "525", name: "Databases" } },
      ] },
    ] });
    const e = await studentSemester("u1");
    expect(e?.semesterName).toBe("Fall 2025");
    expect(e?.codes.sort()).toEqual(["CS330", "CS340"]);
    expect(e?.courses.find((c) => c.code === "CS330")?.subject).toBe("Operating Systems");
  });

  it("drops enrolled subjects that are not in the harvested catalog", async () => {
    lms.myList.mockResolvedValue({ semesters: [{ id: "1", name: "Now", is_open: "1", subjects: [{ id: "a", subject_id: "0", subject: { id: "0", name: "Ghost" } }] }] });
    const e = await studentSemester("u1");
    expect(e).toMatchObject({ semesterName: "Now", codes: [], courses: [] });
  });
});
