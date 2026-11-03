import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ session: null as null | { token: string } }));
const lms = vi.hoisted(() => ({
  currentUser: vi.fn(),
  transcript: vi.fn(),
  gradebookSemesters: vi.fn(),
  gradebookData: vi.fn(),
}));

vi.mock("@/lib/lms/store", () => ({ sessionFor: async () => store.session }));
vi.mock("@/lib/lms/client", () => lms);

import { lmsProfile } from "@/lib/lms/profile";

afterEach(() => {
  vi.clearAllMocks();
  store.session = null;
});

describe("lmsProfile", () => {
  it("returns null when there is no LMS session", async () => {
    expect(await lmsProfile("u1", "a@newuu.uz")).toBeNull();
  });

  it("builds GPA, ECTS and newest-first graded semesters", async () => {
    store.session = { token: "t" };
    lms.currentUser.mockResolvedValue({ username: "Sam", sur_name: "Lee", email: "a@newuu.uz" });
    lms.transcript.mockResolvedValue({ transcript: { gpa: "3.40", ects: "120", ects_all: "180", diploma_with_honor: "0" } });
    lms.gradebookSemesters.mockResolvedValue([
      { id: 1, semester_id: 10, semester_name: "Fall 2023", year_of_study: 1, is_open: 0 },
      { id: 2, semester_id: 13, semester_name: "Fall 2024", year_of_study: 2, is_open: 1 },
    ]);
    lms.gradebookData.mockImplementation(async (_s, semesterId: number | string) =>
      String(semesterId) === "13"
        ? { resultSubjects: { "272": { subject: { name: "Intro to CS" }, final_grade: { mark: 40, positive_status: false } } } }
        : { resultSubjects: { "15": { subject: { name: "Calculus" }, final_grade: { mark: 88, positive_status: true } } } }
    );

    const p = await lmsProfile("u1", "a@newuu.uz");
    expect(p).toMatchObject({ name: "Sam Lee", gpa: 3.4, ectsEarned: 120, ectsTotal: 180, honors: false });
    // Newest semester (13) first.
    expect(p!.semesters.map((s) => s.name)).toEqual(["Fall 2024", "Fall 2023"]);
    expect(p!.semesters[0]).toMatchObject({ open: true, courses: [{ name: "Intro to CS", mark: 40, passed: false }] });
    expect(p!.semesters[1].courses[0]).toMatchObject({ name: "Calculus", mark: 88, passed: true });
  });

  it("falls back to the email when the LMS has no name, and drops empty semesters", async () => {
    store.session = { token: "t" };
    lms.currentUser.mockResolvedValue({ email: "a@newuu.uz" });
    lms.transcript.mockResolvedValue({ gpa: "", ects: "0", ects_all: "" });
    lms.gradebookSemesters.mockResolvedValue([{ id: 1, semester_id: 10, semester_name: "Empty", is_open: 0 }]);
    lms.gradebookData.mockResolvedValue({ resultSubjects: {} });

    const p = await lmsProfile("u1", "a@newuu.uz");
    expect(p).toMatchObject({ name: "a@newuu.uz", gpa: null, ectsEarned: 0, ectsTotal: null });
    expect(p!.semesters).toEqual([]);
  });

  it("survives a failing gradebook fetch", async () => {
    store.session = { token: "t" };
    lms.currentUser.mockResolvedValue({ username: "Sam", sur_name: "Lee" });
    lms.transcript.mockResolvedValue({ transcript: { gpa: "3.0" } });
    lms.gradebookSemesters.mockResolvedValue([{ id: 1, semester_id: 10, semester_name: "Fall", is_open: 0 }]);
    lms.gradebookData.mockRejectedValue(new Error("boom"));

    const p = await lmsProfile("u1", "a@newuu.uz");
    expect(p).toMatchObject({ gpa: 3, semesters: [] });
  });
});
