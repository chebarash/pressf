import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lms = vi.hoisted(() => ({ individualPlan: vi.fn() }));
vi.mock("@/lib/lms/client", async (original) => ({
  ...(await original<typeof import("@/lib/lms/client")>()),
  individualPlan: lms.individualPlan,
}));

import { db } from "@/lib/db";
import { lmsCurricula } from "@/lib/db/schema";
import { harvestCurriculum } from "@/lib/lms/harvest";
import { resetDb } from "../fixtures/db";

const session = { token: "t" };

beforeEach(() => resetDb());
afterEach(() => vi.clearAllMocks());

describe("harvestCurriculum", () => {
  it("groups a student's plan into a cohort curriculum keyed by work-education-plan", async () => {
    lms.individualPlan.mockResolvedValue([
      { work_education_plan_id: "7", education_program_id: "23", semester_id: "11", year_of_study: "1", subjects: [{ subject_id: "96", code: "ACS2", name: "Academic Skills 2", ects: "6" }] },
      { work_education_plan_id: "7", education_program_id: "23", semester_id: "10", year_of_study: "1", subjects: [{ subject_id: "15", code: "CS100", name: "Info Systems", ects: "6" }] },
    ]);
    const r = await harvestCurriculum(session);
    expect(r).toEqual({ curricula: 1 });
    const [row] = await db().select().from(lmsCurricula);
    expect(row.workEducationPlanId).toBe("7");
    expect(row.programId).toBe("23");
    // Semesters ordered by id; courses carried with ects.
    expect(row.data.semesters.map((s) => s.semesterId)).toEqual(["10", "11"]);
    expect(row.data.semesters[0].courses[0]).toMatchObject({ code: "CS100", name: "Info Systems", ects: 6 });
  });

  it("does not overwrite a saved plan with an empty one", async () => {
    lms.individualPlan.mockResolvedValueOnce([
      { work_education_plan_id: "7", education_program_id: "23", semester_id: "10", year_of_study: "1", subjects: [{ subject_id: "15", code: "CS100", name: "Info Systems", ects: "6" }] },
    ]);
    await harvestCurriculum(session);
    lms.individualPlan.mockResolvedValueOnce([{ work_education_plan_id: "7", education_program_id: "23", semester_id: "10", subjects: [] }]);
    const r = await harvestCurriculum(session);
    expect(r).toEqual({ curricula: 0 });
    const [row] = await db().select().from(lmsCurricula);
    expect(row.data.semesters[0].courses).toHaveLength(1);
  });

  it("returns zero when the plan cannot be fetched", async () => {
    lms.individualPlan.mockRejectedValue(new Error("down"));
    expect(await harvestCurriculum(session)).toEqual({ curricula: 0 });
    expect(await db().select().from(lmsCurricula)).toHaveLength(0);
  });
});
