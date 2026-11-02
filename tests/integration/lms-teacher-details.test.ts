import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lms = vi.hoisted(() => ({ employee: vi.fn() }));
vi.mock("@/lib/lms/client", () => lms);

import { db } from "@/lib/db";
import { lmsTeachers } from "@/lib/db/schema";
import { harvestTeacherDetails } from "@/lib/lms/harvest";
import { resetDb } from "../fixtures/db";

const session = { token: "t" };

beforeEach(async () => {
  await resetDb();
  await db().insert(lmsTeachers).values([
    { id: "9", firstName: "Ann", surName: "A" },
    { id: "10", firstName: "Bob", surName: "B" },
    { id: "11", firstName: "Cy", surName: "C" },
  ]);
});
afterEach(() => vi.clearAllMocks());

describe("harvestTeacherDetails", () => {
  it("fills position from academicStatus.name and tolerates both shapes", async () => {
    lms.employee.mockImplementation(async (_s, id: string) => {
      // The LMS returns the object directly or wrapped in a one-element array.
      if (id === "9") return { employee_id: "9", academicStatus: { name: "Professor" } };
      if (id === "10") return { employee_id: "10", academicStatus: { name: "  Senior Lecturer  " } };
      return { employee_id: "11", academicStatus: null };
    });

    const r = await harvestTeacherDetails(session);
    expect(r.teacherDetails).toBe(3);

    const rows = await db().select().from(lmsTeachers);
    const pos = Object.fromEntries(rows.map((t) => [t.id, t.position]));
    expect(pos["9"]).toBe("Professor");
    expect(pos["10"]).toBe("Senior Lecturer"); // trimmed
    expect(pos["11"]).toBeNull(); // empty status -> null
  });

  it("one failing fetch does not abort the others", async () => {
    lms.employee.mockImplementation(async (_s, id: string) => {
      if (id === "10") throw new Error("boom");
      return { employee_id: id, academicStatus: { name: "Professor" } };
    });

    const r = await harvestTeacherDetails(session);
    expect(r.teacherDetails).toBe(2); // 9 and 11 succeeded

    const rows = await db().select().from(lmsTeachers);
    const pos = Object.fromEntries(rows.map((t) => [t.id, t.position]));
    expect(pos["9"]).toBe("Professor");
    expect(pos["10"]).toBeNull(); // failed, left untouched
    expect(pos["11"]).toBe("Professor");
  });
});
